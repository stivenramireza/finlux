/**
 * Shared auth types and the typed error surface the forms render.
 *
 * These mirror the implemented `user-authentication` backend contract (see
 * `backend/src/auth/auth.service.ts`) and the Tech Lead's Decision A
 * (status-code → error mapping, owned by the API client). The forms consume
 * `AuthError` and never inspect raw HTTP status codes.
 */

/** Public view of a user as returned by the backend (never includes a password). */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Successful-login response shape: `POST /auth/login` → 200. */
export interface LoginResult {
  accessToken: string;
  user: PublicUser;
}

/** Login request body. */
export interface LoginInput {
  email: string;
  password: string;
}

/** Registration request body (`displayName` optional). */
export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

/**
 * Typed auth error (Design: Decision A). Produced by the API client from HTTP
 * results; rendered as copy by the forms.
 * - `duplicate-email`      → register 409
 * - `invalid-credentials`  → login 401 (generic, no field disclosure)
 * - `validation`           → 400 (keep non-password input)
 * - `network`              → transport failure (offline/DNS/CORS/timeout)
 * - `unknown`              → anything else (e.g. 5xx)
 */
export type AuthError =
  | { kind: 'duplicate-email' }
  | { kind: 'invalid-credentials' }
  | { kind: 'validation'; message?: string }
  | { kind: 'network' }
  | { kind: 'unknown'; status?: number };
