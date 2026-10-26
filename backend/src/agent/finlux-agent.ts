import { Agent } from '@mastra/core/agent';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { TransactionToolSet } from '../mcp/tools/index.js';
import { FINLUX_SYSTEM_PROMPT } from './prompts/system-prompt.js';

/** The `model` field type accepted by the Mastra `Agent` constructor. */
type AgentModelConfig = ConstructorParameters<typeof Agent>[0]['model'];

/** Config needed to construct the real Gemini-backed agent. */
export interface FinluxAgentConfig {
  /** Google Generative AI API key (from `GOOGLE_GENERATIVE_AI_API_KEY`). */
  apiKey: string;
  /** Gemini model id (from `AGENT_MODEL_ID`, e.g. `gemini-2.5-flash`). */
  modelId: string;
}

/**
 * Builds the Finlux Mastra `Agent`: a Google Gemini model (provider object from
 * `@ai-sdk/google`, reading `GOOGLE_GENERATIVE_AI_API_KEY`), the guardrail
 * system prompt, and the transaction tools registered by the in-process MCP
 * server. We pass a provider MODEL OBJECT (not Mastra's `google/<model>` router
 * string) so the steering's env key stays authoritative.
 *
 * The `tools` are the exact tool objects the `FinluxMcpServer` registers, so
 * the agent operates over the MCP-registered allowlist in-process (see
 * `FinluxMcpServer` for why no stdio/HTTP transport hop is used).
 */
export function buildFinluxAgent(
  config: FinluxAgentConfig,
  tools: TransactionToolSet,
): Agent {
  const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
  // The model is cast to Mastra's accepted config type. `@ai-sdk/google`'s
  // LanguageModelV4 and Mastra's bundled copy of `@ai-sdk/provider` describe the
  // same structural interface but are *distinct* TS declarations (dual package
  // instances), so the compiler rejects the direct assignment though they are
  // runtime-compatible. This boundary cast is the only place that leak is
  // contained; the provider-object + env-key contract is unchanged.
  const model = google(config.modelId) as unknown as AgentModelConfig;
  return new Agent({
    id: 'finlux-agent',
    name: 'Finlux Agent',
    instructions: FINLUX_SYSTEM_PROMPT,
    model,
    tools,
  });
}
