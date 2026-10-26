import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RequestContext } from '@mastra/core/request-context';
import type { Agent } from '@mastra/core/agent';
import { FinluxMcpServer } from '../mcp/finlux-mcp-server.js';
import { buildFinluxAgent } from './finlux-agent.js';
import { scrubJwtLike } from './egress-guardrail.js';
import { ACCESS_TOKEN_KEY, USER_ID_KEY } from '../mcp/tools/request-context.js';
import type {
  AgentMessage,
  AgentRunResult,
  AgentRunner,
  AgentToolCall,
} from './agent-runner.js';

/** Minimal view of the Mastra generate result we consume. */
interface GenerateResultLike {
  text?: string;
  toolCalls?: Array<{ toolName?: string; args?: unknown; payload?: unknown }>;
}

/** Server-side RequestContext payload: the caller identity + raw JWT. */
type FinluxRequestContext = {
  [USER_ID_KEY]: string;
  [ACCESS_TOKEN_KEY]: string;
};

/**
 * Real, Mastra-backed {@link AgentRunner}. Builds the Gemini agent once (failing
 * fast if the API key is missing, mirroring `JwtStrategy`/`DatabaseModule`) over
 * the transaction tools registered by the in-process MCP server. Per turn, it
 * injects the caller's `userId` and raw JWT into a typed, server-side
 * `RequestContext` so every tool is scoped to the caller and forwards the JWT
 * to the transaction API (Layer 1 — never a tool input). The model is never
 * invoked in tests — tests use a fake runner instead of this service.
 */
@Injectable()
export class AgentService implements AgentRunner {
  private readonly logger = new Logger(AgentService.name);
  private readonly agent: Agent;

  constructor(
    private readonly configService: ConfigService,
    private readonly mcpServer: FinluxMcpServer,
  ) {
    const apiKey = this.configService.get<string>(
      'GOOGLE_GENERATIVE_AI_API_KEY',
    );
    if (!apiKey) {
      throw new Error(
        'GOOGLE_GENERATIVE_AI_API_KEY is not set. Define it in backend/.env (see .env.example).',
      );
    }
    const modelId =
      this.configService.get<string>('AGENT_MODEL_ID') ?? 'gemini-2.5-flash';
    this.agent = buildFinluxAgent({ apiKey, modelId }, this.mcpServer.toolSet);
  }

  async runTurn(
    userId: string,
    accessToken: string,
    messages: AgentMessage[],
  ): Promise<AgentRunResult> {
    // Both values live ONLY here, server-side; neither is a tool input, part of
    // the prompt, or logged (Layer 1).
    const requestContext = new RequestContext<FinluxRequestContext>();
    requestContext.set(USER_ID_KEY, userId);
    requestContext.set(ACCESS_TOKEN_KEY, accessToken);

    try {
      const result = (await this.agent.generate(
        messages as Parameters<Agent['generate']>[0],
        { requestContext },
      )) as GenerateResultLike;

      const toolCalls: AgentToolCall[] = (result.toolCalls ?? []).map((tc) => ({
        toolName: tc.toolName ?? 'unknown',
        args: tc.args ?? tc.payload,
      }));

      // Egress guardrail (Layer 1): scrub any JWT-shaped substring before the
      // reply leaves the backend.
      const text = scrubJwtLike(result.text ?? '');
      return { text, toolCalls };
    } catch (error) {
      // Never log message bodies, amounts, descriptions, tokens, or the key.
      this.logger.error(
        `Agent turn failed: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
      throw error;
    }
  }
}
