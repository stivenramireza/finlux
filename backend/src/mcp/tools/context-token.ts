import { ACCESS_TOKEN_KEY } from './request-context.js';

/** Minimal view of the per-tool execution context we read the token from. */
export interface ToolExecuteContext {
  requestContext?: { get(key: string): unknown };
}

/**
 * Reads the caller's JWT from the server-side RequestContext. The token is
 * NEVER a tool input (Layer 1); it is injected by `AgentService`. Throws if it
 * is missing so a tool can never call the transaction API unauthenticated.
 */
export function requireAccessToken(context: ToolExecuteContext): string {
  const token = context.requestContext?.get(ACCESS_TOKEN_KEY);
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('missing caller credentials in request context');
  }
  return token;
}
