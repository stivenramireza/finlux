/**
 * Shared API client (Design: Decisions A and E).
 *
 * This is the single owner of the status-code → `AuthError` mapping and of the
 * global `401 → onUnauthorized()` transition for AUTHENTICATED requests. Forms
 * only ever see the typed results below; they never inspect raw status codes.
 *
 * Security: never logs request bodies, tokens, or credentials (Req 4.5). The
 * `Authorization: Bearer <token>` header is attached only on authenticated
 * requests (Req 4.3).
 */
import type {
  AuthError,
  LoginInput,
  LoginResult,
  PublicUser,
  RegisterInput,
} from './types';

export interface AuthApiClientOptions {
  /** Backend base URL (no trailing slash). */
  baseUrl: string;
  /** Returns the current access token, or null if unauthenticated. */
  getToken: () => string | null;
  /**
   * Invoked when an AUTHENTICATED request returns 401 (token expired/invalid
   * mid-session). The auth endpoints (login/register) are exempt — their 401s
   * are form errors, not session expiry. (Decision E, Req 4.4)
   */
  onUnauthorized: () => void;
}

/** Discriminated result wrapper returned by auth calls. */
export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; error: AuthError };

/**
 * Typed outcome for the password-reset calls (Design: Decision 9). These are
 * unauthenticated and EXEMPT from the global `401 → logout` handling — there is
 * no session involved, so a `401` (not expected from these routes) is treated
 * as a generic failure rather than a session expiry.
 * - `success`     → the request/confirm completed (200)
 * - `rejected`    → confirm 400: invalid/expired/used token OR weak password,
 *                   intentionally indistinguishable (no oracle)
 * - `validation`  → request 400: malformed email / body
 * - `network`     → transport failure (offline/DNS/CORS/timeout)
 * - `unknown`     → anything else (e.g. 5xx)
 */
export type PasswordResetOutcome =
  | { kind: 'success' }
  | { kind: 'rejected' }
  | { kind: 'validation' }
  | { kind: 'network' }
  | { kind: 'unknown'; status?: number };

export class AuthApiClient {
  private readonly baseUrl: string;
  private readonly getToken: () => string | null;
  private readonly onUnauthorized: () => void;

  constructor(options: AuthApiClientOptions) {
    this.baseUrl = options.baseUrl;
    this.getToken = options.getToken;
    this.onUnauthorized = options.onUnauthorized;
  }

  /**
   * `POST /auth/register` → 201 PublicUser.
   * Maps: 409 → duplicate-email, 400 → validation, other → unknown.
   * This is an auth endpoint: it is EXEMPT from global 401 handling.
   */
  async register(input: RegisterInput): Promise<ApiResult<PublicUser>> {
    const body: RegisterInput = {
      email: input.email,
      password: input.password,
    };
    if (input.displayName && input.displayName.trim().length > 0) {
      body.displayName = input.displayName.trim();
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, error: { kind: 'network' } };
    }

    if (response.status === 201) {
      const data = (await this.safeJson(response)) as PublicUser | null;
      if (!data) {
        return { ok: false, error: { kind: 'unknown', status: 201 } };
      }
      return { ok: true, data };
    }
    if (response.status === 409) {
      return { ok: false, error: { kind: 'duplicate-email' } };
    }
    if (response.status === 400) {
      return { ok: false, error: { kind: 'validation' } };
    }
    return { ok: false, error: { kind: 'unknown', status: response.status } };
  }

  /**
   * `POST /auth/login` → 200 { accessToken, user }.
   * Maps: 401 → invalid-credentials (generic), 400 → validation, other → unknown.
   * This is an auth endpoint: it is EXEMPT from global 401 handling.
   */
  async login(input: LoginInput): Promise<ApiResult<LoginResult>> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: input.email, password: input.password }),
      });
    } catch {
      return { ok: false, error: { kind: 'network' } };
    }

    if (response.status === 200) {
      const data = (await this.safeJson(response)) as LoginResult | null;
      if (!data || typeof data.accessToken !== 'string') {
        return { ok: false, error: { kind: 'unknown', status: 200 } };
      }
      return { ok: true, data };
    }
    if (response.status === 401) {
      return { ok: false, error: { kind: 'invalid-credentials' } };
    }
    if (response.status === 400) {
      return { ok: false, error: { kind: 'validation' } };
    }
    return { ok: false, error: { kind: 'unknown', status: response.status } };
  }

  /**
   * `POST /auth/password-reset/request` → always 200 with a uniform,
   * non-disclosing body (Design: Decision 5/9). UNAUTHENTICATED and EXEMPT from
   * global 401 handling: it never attaches a token and never calls
   * `onUnauthorized`. The caller always shows the same confirmation, so the
   * only non-success outcomes are a `400` (malformed email) or transport/other.
   * Never logs the email.
   */
  async requestPasswordReset(
    email: string,
    locale?: string,
  ): Promise<PasswordResetOutcome> {
    const body: { email: string; locale?: string } = { email };
    if (locale && locale.trim().length > 0) {
      body.locale = locale.trim();
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/auth/password-reset/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      return { kind: 'network' };
    }

    if (response.status === 200 || response.status === 202) {
      return { kind: 'success' };
    }
    if (response.status === 400) {
      return { kind: 'validation' };
    }
    return { kind: 'unknown', status: response.status };
  }

  /**
   * `POST /auth/password-reset/confirm` → 200 success / generic 400 (Design:
   * Decision 6/9). UNAUTHENTICATED and EXEMPT from global 401 handling (no
   * session is issued; no auto-login). A `400` means the token is
   * invalid/expired/used OR the password violates the policy — intentionally
   * indistinguishable (`rejected`, no oracle). Never logs the token or password.
   */
  async confirmPasswordReset(
    token: string,
    password: string,
  ): Promise<PasswordResetOutcome> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/auth/password-reset/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
    } catch {
      return { kind: 'network' };
    }

    if (response.status === 200 || response.status === 204) {
      return { kind: 'success' };
    }
    if (response.status === 400) {
      return { kind: 'rejected' };
    }
    return { kind: 'unknown', status: response.status };
  }

  /**
   * Authenticated request helper for future features (Req 4.3, 4.4). Attaches
   * `Authorization: Bearer <token>` and routes a 401 through `onUnauthorized()`
   * (Decision E). Returns the raw `Response` so callers map it as they need.
   */
  async authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const token = this.getToken();
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (response.status === 401) {
      // Token expired/invalid mid-session → discard + return to auth screen.
      this.onUnauthorized();
    }

    return response;
  }

  /** Parses JSON defensively; returns null on empty/invalid bodies. */
  private async safeJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
}
