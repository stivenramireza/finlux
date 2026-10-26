import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { RequestContext } from '@mastra/core/request-context';

// The transaction API the MCP tools call is this very app. Bind it to a fixed
// loopback port and point the client at it BEFORE the module (and thus the
// TransactionApiClient) is constructed. The model is mocked; the MCP tools hit
// the real /transactions so JWT propagation is exercised end to end.
const PORT = 3999;
process.env.TRANSACTION_API_BASE_URL = `http://127.0.0.1:${PORT}`;

const { AppModule } = await import('../src/app.module.js');
const { AGENT_RUNNER } = await import('../src/agent/agent-runner.js');
const { TransactionApiClient } =
  await import('../src/mcp/transaction-api.client.js');
const { buildTransactionTools } = await import('../src/mcp/tools/index.js');
const { ACCESS_TOKEN_KEY, USER_ID_KEY } =
  await import('../src/mcp/tools/request-context.js');
type AgentMessage = import('../src/agent/agent-runner.js').AgentMessage;
type AgentRunResult = import('../src/agent/agent-runner.js').AgentRunResult;

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/**
 * Deterministic stand-in for the Gemini-backed runner. It mocks ONLY the model:
 * it drives the REAL MCP tools (built on the real TransactionApiClient pointed
 * at this app) with a real RequestContext carrying the forwarded userId + JWT,
 * so the full JWT-propagation path to /transactions runs. No network to Google.
 */
class ScriptedAgentRunner {
  private readonly toolSet: ReturnType<typeof buildTransactionTools>;

  constructor() {
    const client = new TransactionApiClient({
      get: (key: string) =>
        key === 'TRANSACTION_API_BASE_URL'
          ? process.env.TRANSACTION_API_BASE_URL
          : undefined,
    } as never);
    this.toolSet = buildTransactionTools(client);
  }

  private ctx(userId: string, accessToken: string) {
    const rc = new RequestContext();
    rc.set(USER_ID_KEY, userId);
    rc.set(ACCESS_TOKEN_KEY, accessToken);
    return { requestContext: rc };
  }

  async runTurn(
    userId: string,
    accessToken: string,
    messages: AgentMessage[],
  ): Promise<AgentRunResult> {
    const toolSet = this.toolSet;
    const last = messages[messages.length - 1]?.content ?? '';
    const ctx = this.ctx(userId, accessToken);

    // Scenario: "look up transaction <uuid>" → get-transaction (may 404).
    const idMatch = last.match(UUID_RE);
    if (/look up|fetch|show|get transaction/i.test(last) && idMatch) {
      try {
        const tx = await toolSet['get-transaction'].execute!(
          { id: idMatch[0] },
          ctx,
        );
        return {
          text: `Found transaction ${(tx as { id: string }).id}.`,
          toolCalls: [
            { toolName: 'get-transaction', args: { id: idMatch[0] } },
          ],
        };
      } catch {
        return {
          text: 'I could not find that transaction in your data.',
          toolCalls: [
            { toolName: 'get-transaction', args: { id: idMatch[0] } },
          ],
        };
      }
    }

    // Scenario: explicit confirmation → create-transaction (the only write).
    if (/^confirm/i.test(last.trim())) {
      const created = await toolSet['create-transaction'].execute!(
        {
          amount: '20.00',
          type: 'expense',
          currency: 'COP',
          date: '2025-02-10',
          description: 'lunch (food)',
        },
        ctx,
      );
      return {
        text: `Saved your expense of 20.00 COP.`,
        toolCalls: [
          {
            toolName: 'create-transaction',
            args: { id: (created as { id: string }).id },
          },
        ],
      };
    }

    // Default: describe-only draft, NO write.
    return {
      text: 'Draft: 20.00 COP expense (food). Reply "confirm" to save.',
      toolCalls: [],
    };
  }
}

interface Registered {
  token: string;
}

/** Narrow a supertest response body to a known shape for typed assertions. */
function asBody<T>(res: request.Response): T {
  return res.body as T;
}

interface ConversationBody {
  conversation: { id: string };
  messages: Array<{ role: string; content: string }>;
}
interface TransactionBody {
  id: string;
  amount: string;
  currency: string;
}

describe('Chat (e2e)', () => {
  let app: INestApplication<App>;
  let base: string;

  async function register(email: string): Promise<Registered> {
    await request(base)
      .post('/auth/register')
      .send({ email, password: 'S3cur3P@ss', displayName: 'T' })
      .expect(201);
    const login = await request(base)
      .post('/auth/login')
      .send({ email, password: 'S3cur3P@ss' })
      .expect(200);
    const body = asBody<{ accessToken: string }>(login);
    return { token: body.accessToken };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AGENT_RUNNER)
      .useValue(new ScriptedAgentRunner())
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(PORT);
    base = `http://127.0.0.1:${PORT}`;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('401 on every chat route without a valid token', async () => {
    await request(base)
      .post('/conversations')
      .send({ message: 'hi' })
      .expect(401);
    await request(base).get('/conversations').expect(401);
    const randomId = '44444444-4444-4444-8444-444444444444';
    await request(base)
      .post(`/conversations/${randomId}/messages`)
      .send({ message: 'hi' })
      .expect(401);
    await request(base).get(`/conversations/${randomId}/messages`).expect(401);
  });

  it('400 on empty, oversized, unknown-field bodies and non-uuid :id', async () => {
    const { token } = await register(`v-${Date.now()}@ex.com`);
    const auth = { Authorization: `Bearer ${token}` };

    await request(base)
      .post('/conversations')
      .set(auth)
      .send({ message: '' })
      .expect(400);
    await request(base)
      .post('/conversations')
      .set(auth)
      .send({ message: 'x'.repeat(4001) })
      .expect(400);
    await request(base)
      .post('/conversations')
      .set(auth)
      .send({ message: 'hi', bogus: 'nope' })
      .expect(400);
    await request(base)
      .post('/conversations/not-a-uuid/messages')
      .set(auth)
      .send({ message: 'hi' })
      .expect(400);
  });

  it('capture → confirm actually creates a transaction visible via GET /transactions', async () => {
    const { token } = await register(`cap-${Date.now()}@ex.com`);
    const auth = { Authorization: `Bearer ${token}` };

    // Start: describe-only (no write yet).
    const started = await request(base)
      .post('/conversations')
      .set(auth)
      .send({ message: 'I spent 20 on lunch today' })
      .expect(201);
    const startedBody = asBody<ConversationBody>(started);
    const conversationId = startedBody.conversation.id;
    expect(startedBody.messages).toHaveLength(2);

    const before = await request(base)
      .get('/transactions')
      .set(auth)
      .expect(200);
    expect(asBody<TransactionBody[]>(before)).toHaveLength(0);

    // Confirm → the only write path.
    await request(base)
      .post(`/conversations/${conversationId}/messages`)
      .set(auth)
      .send({ message: 'confirm' })
      .expect(201);

    const after = await request(base)
      .get('/transactions')
      .set(auth)
      .expect(200);
    const afterBody = asBody<TransactionBody[]>(after);
    expect(afterBody).toHaveLength(1);
    expect(afterBody[0].amount).toBe('20.0000');
    expect(afterBody[0].currency).toBe('COP');
  });

  it('isolation via the API: user A asking about user B transaction id gets a clean not-found', async () => {
    const a = await register(`a-${Date.now()}@ex.com`);
    const b = await register(`b-${Date.now()}@ex.com`);
    const authA = { Authorization: `Bearer ${a.token}` };
    const authB = { Authorization: `Bearer ${b.token}` };

    // B creates a transaction directly via the REST API.
    const created = await request(base)
      .post('/transactions')
      .set(authB)
      .send({
        amount: '99.00',
        type: 'expense',
        currency: 'USD',
        date: '2025-03-01',
      })
      .expect(201);
    const bTxId = asBody<TransactionBody>(created).id;

    // A asks the agent to look up B's transaction id → the API returns 404 to
    // the forwarded A-token, surfaced as a clean "not found" (no disclosure).
    const conv = await request(base)
      .post('/conversations')
      .set(authA)
      .send({ message: `look up transaction ${bTxId}` })
      .expect(201);
    const reply = asBody<ConversationBody>(conv).messages[1].content;
    expect(reply).toMatch(/could not find/i);
    expect(reply).not.toContain('99');
  });

  it('user A → user B conversation id is 404, identical to a random uuid', async () => {
    const a = await register(`a2-${Date.now()}@ex.com`);
    const b = await register(`b2-${Date.now()}@ex.com`);
    const authA = { Authorization: `Bearer ${a.token}` };
    const authB = { Authorization: `Bearer ${b.token}` };

    const bConv = await request(base)
      .post('/conversations')
      .set(authB)
      .send({ message: 'hello' })
      .expect(201);
    const bConvId = asBody<ConversationBody>(bConv).conversation.id;
    const randomId = '55555555-5555-4555-8555-555555555555';

    await request(base)
      .get(`/conversations/${bConvId}/messages`)
      .set(authA)
      .expect(404);
    await request(base)
      .get(`/conversations/${randomId}/messages`)
      .set(authA)
      .expect(404);
  });
});
