import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { RequestContext } from '@mastra/core/request-context';

/**
 * End-to-end proof of at-rest PII encryption. Boots the full app with REAL
 * 32-byte test keys (set in env BEFORE the app/entity transformers are
 * constructed) and asserts:
 *  - register → login happy path works through the blind index;
 *  - a case-insensitive duplicate email collides on `uq_users_email_bidx` (409);
 *  - a captured transaction's `description` comes back as PLAINTEXT via the API;
 *  - a chat turn's `content` comes back as PLAINTEXT via the API;
 *  - a raw SELECT (bypassing the transformer) shows the stored
 *    email/display_name/description/content are `v1:…` ciphertext envelopes that
 *    do NOT contain the plaintext, and `email_bidx` equals the expected HMAC.
 *
 * The model is mocked (via the scripted agent runner below); the MCP tools hit
 * the real /transactions so JWT propagation and transparent decryption run.
 */

const PORT = 3998;
const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
const TEST_BIDX_KEY = Buffer.alloc(32, 5).toString('base64');

// Set BEFORE importing the app so initCryptoKeys (and the module graph) pick
// them up. Also point the MCP transaction client at this app.
process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
process.env.BIDX_KEY = TEST_BIDX_KEY;
process.env.TRANSACTION_API_BASE_URL = `http://127.0.0.1:${PORT}`;

const { initCryptoKeys, resetCryptoKeysForTest } =
  await import('../src/crypto/crypto-keys.js');
resetCryptoKeysForTest();
initCryptoKeys((name) => process.env[name]);

const { AppModule } = await import('../src/app.module.js');
const { AGENT_RUNNER } = await import('../src/agent/agent-runner.js');
const { TransactionApiClient } =
  await import('../src/mcp/transaction-api.client.js');
const { buildTransactionTools } = await import('../src/mcp/tools/index.js');
const { ACCESS_TOKEN_KEY, USER_ID_KEY } =
  await import('../src/mcp/tools/request-context.js');
type AgentMessage = import('../src/agent/agent-runner.js').AgentMessage;
type AgentRunResult = import('../src/agent/agent-runner.js').AgentRunResult;

/** Mocks ONLY the model; drives the real MCP tools with a real RequestContext. */
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
    const last = messages[messages.length - 1]?.content ?? '';
    const ctx = this.ctx(userId, accessToken);

    if (/^confirm/i.test(last.trim())) {
      const created = await this.toolSet['create-transaction'].execute!(
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
        text: 'Saved your expense of 20.00 COP.',
        toolCalls: [
          {
            toolName: 'create-transaction',
            args: { id: (created as { id: string }).id },
          },
        ],
      };
    }

    return {
      text: 'Draft: 20.00 COP expense (food). Reply "confirm" to save.',
      toolCalls: [],
    };
  }
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
  description: string | null;
}

const expectedBidx = (email: string): string =>
  createHmac('sha256', Buffer.from(TEST_BIDX_KEY, 'base64'))
    .update(email.trim().toLowerCase())
    .digest('hex');

describe('PII encryption at rest (e2e)', () => {
  let app: INestApplication<App>;
  let base: string;
  let dataSource: DataSource;
  const createdUserIds: string[] = [];

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
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized && createdUserIds.length > 0) {
      await dataSource.query('DELETE FROM "users" WHERE id = ANY($1)', [
        createdUserIds,
      ]);
    }
    await app?.close();
  });

  it('register → login happy path through the blind index', async () => {
    const email = `pii-happy-${Date.now()}@example.com`;
    // Registration is non-disclosing: it returns a generic body (no id/email/
    // displayName/password). The decrypted fields are observed via login.
    const reg = await request(base)
      .post('/auth/register')
      .send({ email, password: 'S3cur3P@ss', displayName: 'Jane Doe' })
      .expect(201);
    const regBody = asBody<Record<string, unknown>>(reg);
    expect(regBody).not.toHaveProperty('id');
    expect(regBody).not.toHaveProperty('password');
    expect(regBody).not.toHaveProperty('email');

    const login = await request(base)
      .post('/auth/login')
      .send({ email, password: 'S3cur3P@ss' })
      .expect(200);
    const loginBody = asBody<{
      accessToken: string;
      user: { id: string; email: string; displayName: string };
    }>(login);
    createdUserIds.push(loginBody.user.id);
    expect(typeof loginBody.accessToken).toBe('string');
    expect(loginBody.user.email).toBe(email);
    // The API returns plaintext (decrypted transparently).
    expect(loginBody.user.displayName).toBe('Jane Doe');
  });

  it('case-insensitive existing email is non-disclosing (201, no 409) and creates no second user', async () => {
    const stamp = Date.now();
    await request(base)
      .post('/auth/register')
      .send({ email: `User-${stamp}@Example.com`, password: 'S3cur3P@ss' })
      .expect(201);

    // Re-registering the same email in a different case must NOT disclose that
    // it exists: identical generic 201, not a 409. The DB-level
    // `uq_users_email_bidx` constraint still prevents a duplicate row — its
    // violation is swallowed silently.
    await request(base)
      .post('/auth/register')
      .send({ email: `user-${stamp}@example.com`, password: 'S3cur3P@ss' })
      .expect(201);

    // Exactly one user row exists for that normalized email (no second user
    // created despite the second request succeeding).
    const bidx = expectedBidx(`user-${stamp}@example.com`);
    const rows = await dataSource.query<Array<{ id: string }>>(
      'SELECT id FROM "users" WHERE email_bidx = $1',
      [bidx],
    );
    expect(rows).toHaveLength(1);
    createdUserIds.push(rows[0].id);
  });

  it('captured transaction description round-trips as plaintext via the API', async () => {
    const email = `pii-tx-${Date.now()}@example.com`;
    await request(base)
      .post('/auth/register')
      .send({ email, password: 'S3cur3P@ss' })
      .expect(201);
    const login = await request(base)
      .post('/auth/login')
      .send({ email, password: 'S3cur3P@ss' })
      .expect(200);
    const loginBody = asBody<{ accessToken: string; user: { id: string } }>(
      login,
    );
    createdUserIds.push(loginBody.user.id);
    const token = loginBody.accessToken;
    const auth = { Authorization: `Bearer ${token}` };

    await request(base)
      .post('/conversations')
      .set(auth)
      .send({ message: 'I spent 20 on lunch today' })
      .expect(201);
    await request(base)
      .post('/conversations')
      .set(auth)
      .send({ message: 'confirm' })
      .expect(201);

    const list = await request(base).get('/transactions').set(auth).expect(200);
    const txs = asBody<TransactionBody[]>(list);
    expect(txs).toHaveLength(1);
    expect(txs[0].description).toBe('lunch (food)');
  });

  it('chat message content round-trips as plaintext via the API', async () => {
    const email = `pii-chat-${Date.now()}@example.com`;
    await request(base)
      .post('/auth/register')
      .send({ email, password: 'S3cur3P@ss' })
      .expect(201);
    const login = await request(base)
      .post('/auth/login')
      .send({ email, password: 'S3cur3P@ss' })
      .expect(200);
    const loginBody = asBody<{ accessToken: string; user: { id: string } }>(
      login,
    );
    createdUserIds.push(loginBody.user.id);
    const token = loginBody.accessToken;
    const auth = { Authorization: `Bearer ${token}` };

    const started = await request(base)
      .post('/conversations')
      .set(auth)
      .send({ message: 'hello finlux' })
      .expect(201);
    const conversationId = asBody<ConversationBody>(started).conversation.id;

    const msgs = await request(base)
      .get(`/conversations/${conversationId}/messages`)
      .set(auth)
      .expect(200);
    const body = asBody<Array<{ role: string; content: string }>>(msgs);
    const userTurn = body.find((m) => m.role === 'user');
    expect(userTurn?.content).toBe('hello finlux');
  });

  it('AT REST: raw SELECT shows ciphertext envelopes, not plaintext', async () => {
    const email = `pii-rest-${Date.now()}@example.com`;
    const displayName = 'Alice Atrest';
    await request(base)
      .post('/auth/register')
      .send({ email, password: 'S3cur3P@ss', displayName })
      .expect(201);
    const login = await request(base)
      .post('/auth/login')
      .send({ email, password: 'S3cur3P@ss' })
      .expect(200);
    const loginBody = asBody<{ accessToken: string; user: { id: string } }>(
      login,
    );
    const userId = loginBody.user.id;
    createdUserIds.push(userId);
    const token = loginBody.accessToken;
    const auth = { Authorization: `Bearer ${token}` };

    // A transaction (description) + a chat turn (content).
    await request(base)
      .post('/transactions')
      .set(auth)
      .send({
        amount: '12.3400',
        type: 'expense',
        currency: 'USD',
        date: '2025-04-01',
        description: 'secret groceries',
      })
      .expect(201);
    const started = await request(base)
      .post('/conversations')
      .set(auth)
      .send({ message: 'a very private message' })
      .expect(201);
    const conversationId = asBody<ConversationBody>(started).conversation.id;

    // --- raw reads (bypass the transformer) ---
    const userRows = await dataSource.query<
      Array<{ email: string; email_bidx: string; display_name: string }>
    >('SELECT email, email_bidx, display_name FROM "users" WHERE id = $1', [
      userId,
    ]);
    expect(userRows).toHaveLength(1);
    const rawUser = userRows[0];

    const envelope = /^v1:[^:]+:[^:]+:[^:]+$/;
    expect(rawUser.email).toMatch(envelope);
    expect(rawUser.email).not.toContain(email);
    expect(rawUser.display_name).toMatch(envelope);
    expect(rawUser.display_name).not.toContain(displayName);
    // Blind index is the keyed HMAC of the normalized email (not encrypted).
    expect(rawUser.email_bidx).toBe(expectedBidx(email));

    const txRows = await dataSource.query<Array<{ description: string }>>(
      'SELECT description FROM "transactions" WHERE user_id = $1',
      [userId],
    );
    expect(txRows).toHaveLength(1);
    expect(txRows[0].description).toMatch(envelope);
    expect(txRows[0].description).not.toContain('secret groceries');

    const msgRows = await dataSource.query<Array<{ content: string }>>(
      'SELECT content FROM "messages" WHERE conversation_id = $1',
      [conversationId],
    );
    expect(msgRows.length).toBeGreaterThan(0);
    const userMsg = msgRows.find((r) => !r.content.includes('a very private'));
    // Every stored content is a ciphertext envelope; none contains the plaintext.
    for (const row of msgRows) {
      expect(row.content).toMatch(envelope);
      expect(row.content).not.toContain('a very private message');
    }
    expect(userMsg).toBeDefined();
  });
});
