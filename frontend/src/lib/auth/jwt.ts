/**
 * Client-side JWT inspection (Design: Decision C).
 *
 * We only read the `exp` claim to decide whether a persisted token is still
 * usable. We do NOT verify the signature — the backend is the authority; the
 * client decode is a convenience so we don't render the chat for a token the
 * backend would reject. A malformed or `exp`-less token is treated as expired.
 */

interface JwtExpPayload {
  exp?: number;
}

/**
 * Base64url-decodes a JWT payload segment into an object, or returns `null`
 * if the token is malformed / cannot be parsed. No signature verification.
 */
function decodePayload(token: string): JwtExpPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const payloadSegment = parts[1];
  if (!payloadSegment) {
    return null;
  }

  try {
    // base64url → base64, then pad to a multiple of 4.
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      '=',
    );
    const json = atob(padded);
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    return parsed as JwtExpPayload;
  } catch {
    return null;
  }
}

/** Returns the token's `exp` (seconds since epoch), or `null` if absent/malformed. */
export function getExp(token: string): number | null {
  const payload = decodePayload(token);
  if (!payload || typeof payload.exp !== 'number') {
    return null;
  }
  return payload.exp;
}

/**
 * True if the token is expired or otherwise unusable. A missing/malformed `exp`
 * is treated as expired. `skewSeconds` (default 30s) guards against minor clock
 * drift by expiring slightly early.
 */
export function isExpired(token: string, skewSeconds = 30): boolean {
  const exp = getExp(token);
  if (exp === null) {
    return true;
  }
  const nowSeconds = Date.now() / 1000;
  return exp <= nowSeconds + skewSeconds;
}
