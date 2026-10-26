/**
 * Egress redaction guardrail (design "Token-handling security" — Layer 1,
 * belt-and-suspenders).
 *
 * The caller's JWT must never leave the backend inside the agent's reply. As a
 * defense in case a token-shaped value ever reaches the model's output (e.g.
 * under prompt injection), this scrubs any JWT-shaped substring from the
 * agent's final text before it is returned/persisted.
 *
 * A JWT is three base64url segments separated by dots, the first of which is a
 * JSON header beginning `{"` → base64url-encoded as the well-known `eyJ`
 * prefix. We match `eyJ`-prefixed three-part tokens specifically, so ordinary
 * prose and legitimate numbers are untouched.
 */
const JWT_LIKE_RE = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

/** Placeholder written in place of any redacted token. */
export const REDACTED_TOKEN = '[redacted]';

/** Returns true if the text contains a JWT-shaped substring. */
export function containsJwtLike(text: string): boolean {
  JWT_LIKE_RE.lastIndex = 0;
  return JWT_LIKE_RE.test(text);
}

/**
 * Scrubs any JWT-shaped substring from `text`, replacing it with
 * {@link REDACTED_TOKEN}. Idempotent and side-effect free.
 */
export function scrubJwtLike(text: string): string {
  return text.replace(JWT_LIKE_RE, REDACTED_TOKEN);
}
