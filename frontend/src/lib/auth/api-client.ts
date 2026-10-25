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
