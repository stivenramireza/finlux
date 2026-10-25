/**
 * Access-token persistence (Design: Decision C).
 *
 * The in-memory React state in the AuthProvider is the source of truth; this
 * module mirrors the token to `sessionStorage` so the authenticated state
 * survives a page reload within the same browser tab (Req 4.1), while bounding
 * exposure to a single tab/session. All access is guarded for SSR / no-window
 * so the helpers are safe to import anywhere.
 *
 * The token value is never logged here or anywhere else (Req 4.5).
 */

const STORAGE_KEY = 'finlux.accessToken';

/** True when a usable `sessionStorage` is available (browser, not SSR). */
function hasSessionStorage(): boolean {
  return typeof window !== 'undefined' && !!window.sessionStorage;
}

/** Reads the persisted token, or `null` if none / unavailable. */
export function readToken(): string | null {
  if (!hasSessionStorage()) {
    return null;
  }
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persists the token (best-effort; storage errors are swallowed). */
export function writeToken(token: string): void {
  if (!hasSessionStorage()) {
    return;
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Ignore quota / disabled-storage errors; in-memory state still works.
  }
}

/** Clears the persisted token (best-effort). */
export function clearToken(): void {
  if (!hasSessionStorage()) {
    return;
  }
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
