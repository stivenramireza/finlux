import { z } from 'zod';

/**
 * Shape of the per-request context every MCP transaction tool reads. Both the
 * caller's `userId` and the caller's raw JWT `accessToken` are injected
 * server-side (from the validated request) via Mastra's `RequestContext`.
 *
 * ## Token-handling security — Layer 1 (credential/data channel split)
 * Neither `userId` nor `accessToken` is part of any tool `inputSchema`, so the
 * model can never read or set them. The tools forward `accessToken` to the
 * transaction API as `Authorization: Bearer`; the API is the sole ownership
 * authority (it resolves the owner from that token). `userId` is carried for
 * server-side context only and is never serialized back into a tool result.
 */
export const requestContextSchema = z.object({
  userId: z.string().uuid(),
  accessToken: z.string().min(1),
});

export type AgentRequestContext = z.infer<typeof requestContextSchema>;

/** RequestContext key carrying the authenticated caller's id (server-side only). */
export const USER_ID_KEY = 'userId' as const;

/** RequestContext key carrying the caller's raw JWT (server-side only). */
export const ACCESS_TOKEN_KEY = 'accessToken' as const;
