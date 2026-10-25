'use client';

/**
 * AuthProvider — the single source of truth for auth state (Design: Decisions
 * C, D, E). A React Context Client Component that:
 * - holds `status`, `user`, and the in-memory access token (mirrored to
 *   sessionStorage for reload survival, Req 4.1);
 * - starts `undetermined` and only resolves after reading/validating the
 *   persisted token on mount, so the chat never flashes (Req 1.4);
 * - exposes `login`, `register` (auto-logs in on success, Req 2.4), `logout`
 *   (client-side only — no backend call, Req 5.3/5.4), and `getToken`;
 * - owns the shared API client and wires its `onUnauthorized` to clear state
 *   back to `unauthenticated` (Decision E, Req 4.4).
 *
 * The token is never written to `console.*` or any telemetry (Req 4.5).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { getApiBaseUrl } from './config';
import { AuthApiClient } from './api-client';
import { isExpired } from './jwt';
import { clearToken, readToken, writeToken } from './token-storage';
import type { AuthError, LoginInput, PublicUser, RegisterInput } from './types';

export type AuthStatus = 'undetermined' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  login(input: LoginInput): Promise<AuthError | null>;
  register(input: RegisterInput): Promise<AuthError | null>;
  logout(): void;
  getToken(): string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('undetermined');
  const [user, setUser] = useState<PublicUser | null>(null);

  // In-memory token is the source of truth; a ref keeps `getToken()` stable and
  // current for the API client without re-creating it on every token change.
  const tokenRef = useRef<string | null>(null);

  const getToken = useCallback((): string | null => tokenRef.current, []);

  /** Clears all auth state (in-memory + storage) → unauthenticated. */
  const clearSession = useCallback(() => {
    tokenRef.current = null;
    clearToken();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  /** Establishes an authenticated session from a token + user. */
  const setSession = useCallback((token: string, nextUser: PublicUser) => {
    tokenRef.current = token;
    writeToken(token);
    setUser(nextUser);
    setStatus('authenticated');
  }, []);

  // `onUnauthorized` (Decision E) must always call the latest `clearSession`;
  // route it through a ref so the API client (created once in the effect below)
  // never needs rebuilding.
  const clearSessionRef = useRef(clearSession);
  useEffect(() => {
    clearSessionRef.current = clearSession;
  }, [clearSession]);

  // Shared API client. Created once in an effect (not during render, so no ref
  // is read during render), kept in a ref, and used by login/register.
  const apiRef = useRef<AuthApiClient | null>(null);

  /** Lazily returns the shared API client, creating it on first use. */
  const getApi = useCallback((): AuthApiClient => {
    if (!apiRef.current) {
      apiRef.current = new AuthApiClient({
        baseUrl: getApiBaseUrl(),
        getToken: () => tokenRef.current,
        onUnauthorized: () => clearSessionRef.current(),
      });
    }
    return apiRef.current;
  }, []);

  // Rehydrate from sessionStorage on mount (client-only). A missing, malformed,
  // or expired token resolves to `unauthenticated` and is cleared (Req 4.2).
  // This is the intended one-time sync of an external store (sessionStorage)
  // into React state; it must run in an effect to stay SSR-safe and avoid a
  // hydration mismatch (server always renders `undetermined`).
  useEffect(() => {
    const persisted = readToken();
    if (!persisted || isExpired(persisted)) {
      if (persisted) {
        clearToken();
      }
      tokenRef.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional one-time sync of an external store (sessionStorage) into React on mount; SSR-safe (server renders `undetermined`).
      setStatus('unauthenticated');
      return;
    }
    tokenRef.current = persisted;
    setStatus('authenticated');
  }, []);

  const login = useCallback(
    async (input: LoginInput): Promise<AuthError | null> => {
      const result = await getApi().login(input);
      if (!result.ok) {
        return result.error;
      }
      setSession(result.data.accessToken, result.data.user);
      return null;
    },
    [getApi, setSession],
  );

  const register = useCallback(
    async (input: RegisterInput): Promise<AuthError | null> => {
      const result = await getApi().register(input);
      if (!result.ok) {
        return result.error;
      }
      // Auto-login after a successful registration (Req 2.4) so the user is not
      // asked to re-type credentials.
      const loginError = await login({
        email: input.email,
        password: input.password,
      });
      return loginError;
    },
    [getApi, login],
  );

  const logout = useCallback(() => {
    // Client-side only: discard the token. No backend call (Req 5.4).
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, register, logout, getToken }),
    [status, user, login, register, logout, getToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Consumes the auth context. Throws if used outside an `AuthProvider`. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
