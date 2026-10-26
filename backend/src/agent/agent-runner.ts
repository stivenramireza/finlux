/**
 * Port over the LLM agent so the HTTP/orchestration layer never depends on
 * Mastra/Gemini directly. The real implementation is Mastra-backed
 * (`AgentService`); tests inject a deterministic fake. The model is never
 * called in tests.
 */

/** A chat message in the agent's wire format (assistant === the agent). */
export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** A tool invocation the agent performed during a turn (surfaced for tests). */
export interface AgentToolCall {
  toolName: string;
  args?: unknown;
}

/** Result of a single agent turn. */
export interface AgentRunResult {
  text: string;
  toolCalls: AgentToolCall[];
}

/** The injectable port. */
export interface AgentRunner {
  /**
   * Runs one agent turn for `userId` over the provided message history. Both
   * `userId` and the caller's raw JWT `accessToken` are injected into the
   * agent's server-side `RequestContext` so every tool is scoped to the caller
   * and can forward the token to the transaction API; neither is ever part of
   * any tool input the model fills (Layer 1).
   */
  runTurn(
    userId: string,
    accessToken: string,
    messages: AgentMessage[],
  ): Promise<AgentRunResult>;
}

/** DI token for the {@link AgentRunner} port. */
export const AGENT_RUNNER = Symbol('AGENT_RUNNER');
