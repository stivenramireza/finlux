import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApiClient } from './api-client';

/**
 * Tests for the password-reset API client methods (Task 9). They are
 * unauthenticated and EXEMPT from the global `401 → logout` handling: a `401`
 * never invokes `onUnauthorized`. The raw token/password are never logged.
 */

const BASE_URL = 'https://api.example.test';

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const getToken = vi.fn<() => string | null>(() => null);
const onUnauthorized = vi.fn();
const fetchMock = vi.fn<typeof fetch>();

function makeClient(): AuthApiClient {
  return new AuthApiClient({ baseUrl: BASE_URL, getToken, onUnauthorized });
}

beforeEach(() => {
  getToken.mockReset().mockReturnValue(null);
  onUnauthorized.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('requestPasswordReset', () => {
  it('POSTs the email to the request route and maps 200 → success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: 'ok' }));

    const outcome = await makeClient().requestPasswordReset('you@example.com');

    expect(outcome).toEqual({ kind: 'success' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/auth/password-reset/request`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'you@example.com' }),
      },
    );
  });

  it('includes a trimmed locale only when provided', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await makeClient().requestPasswordReset('you@example.com', '  en  ');

    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/auth/password-reset/request`,
      expect.objectContaining({
        body: JSON.stringify({ email: 'you@example.com', locale: 'en' }),
      }),
    );
  });

  it('never attaches an Authorization header (unauthenticated)', async () => {
    getToken.mockReturnValue('a.jwt.token');
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await makeClient().requestPasswordReset('you@example.com');

    const headers = (fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<
      string,
      string
    >;
    expect(headers).toEqual({ 'Content-Type': 'application/json' });
    expect(getToken).not.toHaveBeenCalled();
  });

  it('maps 400 → validation', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { message: 'bad' }));
    const outcome = await makeClient().requestPasswordReset('nope');
    expect(outcome).toEqual({ kind: 'validation' });
  });

  it('maps a transport failure → network', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const outcome = await makeClient().requestPasswordReset('you@example.com');
    expect(outcome).toEqual({ kind: 'network' });
  });

  it('a 401 does NOT trigger the global unauthorized handler', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    const outcome = await makeClient().requestPasswordReset('you@example.com');
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: 'unknown', status: 401 });
  });
});

describe('confirmPasswordReset', () => {
  it('POSTs { token, password } to the confirm route and maps 200 → success', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: 'ok' }));

    const outcome = await makeClient().confirmPasswordReset(
      'raw-token',
      'S3cur3P@ss',
    );

    expect(outcome).toEqual({ kind: 'success' });
    expect(fetchMock).toHaveBeenCalledWith(
      `${BASE_URL}/auth/password-reset/confirm`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'raw-token', password: 'S3cur3P@ss' }),
      },
    );
  });

  it('maps 400 → rejected (indistinguishable token/password failure)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { message: 'bad' }));
    const outcome = await makeClient().confirmPasswordReset('t', 'weak');
    expect(outcome).toEqual({ kind: 'rejected' });
  });

  it('maps a transport failure → network', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const outcome = await makeClient().confirmPasswordReset('t', 'S3cur3P@ss');
    expect(outcome).toEqual({ kind: 'network' });
  });

  it('a 401 does NOT trigger the global unauthorized handler', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, {}));
    const outcome = await makeClient().confirmPasswordReset('t', 'S3cur3P@ss');
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: 'unknown', status: 401 });
  });
});
