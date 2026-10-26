import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import {
  TransactionApiClient,
  isAllowedOrigin,
} from './transaction-api.client.js';
import {
  TransactionCurrency,
  TransactionType,
} from '../transactions/entities/transaction.entity.js';

const BASE = 'http://localhost:3000';
const TOKEN = 'caller-jwt-token';

function configWith(baseUrl?: string): ConfigService {
  return {
    get: (key: string) =>
      key === 'TRANSACTION_API_BASE_URL' ? baseUrl : undefined,
  } as unknown as ConfigService;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('TransactionApiClient (Layer 3)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds the URL from the configured base + path and sends the bearer token', async () => {
    const client = new TransactionApiClient(configWith(BASE));
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await client.list(
      {
        type: TransactionType.EXPENSE,
        dateFrom: '2025-01-01',
        dateTo: '2025-01-31',
      },
      TOKEN,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.origin).toBe('http://localhost:3000');
    expect(url.pathname).toBe('/transactions');
    expect(url.searchParams.get('type')).toBe('expense');
    expect(url.searchParams.get('dateFrom')).toBe('2025-01-01');
    expect(url.searchParams.get('dateTo')).toBe('2025-01-31');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('builds the item path from a validated uuid', async () => {
    const client = new TransactionApiClient(configWith(BASE));
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'x' }));
    const id = '22222222-2222-4222-8222-222222222222';
    await client.getOne(id, TOKEN);
    const [url] = fetchMock.mock.calls[0] as [URL];
    expect(url.pathname).toBe(`/transactions/${id}`);
  });

  it('refuses a non-uuid id before sending (Layer 3 param validation)', async () => {
    const client = new TransactionApiClient(configWith(BASE));
    await expect(client.getOne('not-a-uuid', TOKEN)).rejects.toMatchObject({
      kind: 'invalid-field',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps statuses: 404 → not-found, 400 → invalid-field, 5xx/401 → service-unavailable', async () => {
    const client = new TransactionApiClient(configWith(BASE));
    const id = '22222222-2222-4222-8222-222222222222';

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(client.getOne(id, TOKEN)).rejects.toMatchObject({
      kind: 'not-found',
    });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    await expect(client.getOne(id, TOKEN)).rejects.toMatchObject({
      kind: 'invalid-field',
    });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(client.getOne(id, TOKEN)).rejects.toMatchObject({
      kind: 'service-unavailable',
    });

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(client.getOne(id, TOKEN)).rejects.toMatchObject({
      kind: 'service-unavailable',
    });
  });

  it('maps a transport failure to service-unavailable (no token leaked)', async () => {
    const client = new TransactionApiClient(configWith(BASE));
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(
      client.create(
        {
          amount: '20.00',
          type: TransactionType.EXPENSE,
          currency: TransactionCurrency.COP,
          date: '2025-02-10',
          description: null,
        },
        TOKEN,
      ),
    ).rejects.toMatchObject({ kind: 'service-unavailable' });
  });

  it('DELETE maps 204 to void', async () => {
    const client = new TransactionApiClient(configWith(BASE));
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      client.remove('22222222-2222-4222-8222-222222222222', TOKEN),
    ).resolves.toBeUndefined();
  });

  it('isAllowedOrigin only accepts the exact configured origin', () => {
    const base = new URL(BASE);
    expect(
      isAllowedOrigin(new URL('http://localhost:3000/transactions'), base),
    ).toBe(true);
    expect(
      isAllowedOrigin(new URL('http://evil.example/transactions'), base),
    ).toBe(false);
    expect(
      isAllowedOrigin(new URL('http://localhost:4000/transactions'), base),
    ).toBe(false);
  });

  it('refuses to send (no fetch, no Authorization header) when the resolved origin is outside the allowlist', async () => {
    // Subclass forces a foreign origin to exercise the host-allowlist branch.
    class EscapingClient extends TransactionApiClient {
      protected override buildUrl(): URL {
        return new URL('http://evil.example/transactions');
      }
    }
    const client = new EscapingClient(configWith(BASE));
    await expect(client.list({}, TOKEN)).rejects.toMatchObject({
      kind: 'service-unavailable',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
