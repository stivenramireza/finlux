import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import {
  TransactionCurrency,
  TransactionType,
} from '../../transactions/entities/transaction.entity.js';
import type {
  TransactionApiClient,
  TransactionDto,
} from '../transaction-api.client.js';
import { buildTransactionTools } from './index.js';
import { ACCESS_TOKEN_KEY, USER_ID_KEY } from './request-context.js';

const TOKEN = 'caller-jwt-token';
const USER_ID = '11111111-1111-4111-8111-111111111111';

/** A real Mastra RequestContext carrying the server-side-only userId + token. */
function fakeContext(values: Record<string, unknown> = {}) {
  const ctx = new RequestContext();
  const merged: Record<string, unknown> = {
    [USER_ID_KEY]: USER_ID,
    [ACCESS_TOKEN_KEY]: TOKEN,
    ...values,
  };
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined) {
      ctx.set(k, v);
    }
  }
  return { requestContext: ctx };
}

function makeTx(overrides: Partial<TransactionDto> = {}): TransactionDto {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    userId: USER_ID,
    amount: '20.0000',
    type: TransactionType.EXPENSE,
    currency: TransactionCurrency.COP,
    date: '2025-02-10',
    description: 'lunch',
    createdAt: '2025-02-10T00:00:00.000Z',
    updatedAt: '2025-02-10T00:00:00.000Z',
    ...overrides,
  };
}

type MockClient = {
  [K in keyof TransactionApiClient]: ReturnType<typeof vi.fn>;
};

describe('MCP transaction tools', () => {
  let client: MockClient;
  let tools: ReturnType<typeof buildTransactionTools>;

  beforeEach(() => {
    client = {
      list: vi.fn(),
      getOne: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
    tools = buildTransactionTools(client as unknown as TransactionApiClient);
  });

  it('exposes exactly the closed allowlist of tools (no money movement)', () => {
    expect(Object.keys(tools).sort()).toEqual(
      [
        'create-transaction',
        'delete-transaction',
        'get-transaction',
        'list-transactions',
        'summarize-transactions',
        'update-transaction',
      ].sort(),
    );
  });

  it('no tool inputSchema accepts a userId or token (Layer 1)', () => {
    for (const tool of Object.values(tools)) {
      // zod object → shape keys
      const shape = (
        tool.inputSchema as unknown as { shape?: Record<string, unknown> }
      ).shape;
      const keys = shape ? Object.keys(shape) : [];
      expect(keys).not.toContain('userId');
      expect(keys).not.toContain('accessToken');
      expect(keys).not.toContain('token');
    }
  });

  it('list-transactions reads the token from context and forwards filters', async () => {
    client.list.mockResolvedValue([makeTx()]);
    const result = await tools['list-transactions'].execute!(
      { type: TransactionType.EXPENSE, dateFrom: '2025-01-01' },
      fakeContext(),
    );
    expect(client.list).toHaveBeenCalledWith(
      {
        type: TransactionType.EXPENSE,
        dateFrom: '2025-01-01',
        dateTo: undefined,
      },
      TOKEN,
    );
    expect(result).toEqual({
      transactions: [
        {
          id: makeTx().id,
          amount: '20.0000',
          type: TransactionType.EXPENSE,
          currency: TransactionCurrency.COP,
          date: '2025-02-10',
          description: 'lunch',
        },
      ],
    });
    // Layer 1: neither the token nor the userId appears in the tool result.
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(JSON.stringify(result)).not.toContain(USER_ID);
  });

  it('get-transaction forwards id + token', async () => {
    const tx = makeTx();
    client.getOne.mockResolvedValue(tx);
    await tools['get-transaction'].execute!({ id: tx.id }, fakeContext());
    expect(client.getOne).toHaveBeenCalledWith(tx.id, TOKEN);
  });

  it('create-transaction forwards the body + token and folds description', async () => {
    const tx = makeTx();
    client.create.mockResolvedValue(tx);
    await tools['create-transaction'].execute!(
      {
        amount: '20.00',
        type: TransactionType.EXPENSE,
        currency: TransactionCurrency.COP,
        date: '2025-02-10',
        description: 'lunch (food)',
      },
      fakeContext(),
    );
    expect(client.create).toHaveBeenCalledWith(
      {
        amount: '20.00',
        type: TransactionType.EXPENSE,
        currency: TransactionCurrency.COP,
        date: '2025-02-10',
        description: 'lunch (food)',
      },
      TOKEN,
    );
  });

  it('update-transaction forwards a full replacement + token', async () => {
    const tx = makeTx();
    client.update.mockResolvedValue(tx);
    await tools['update-transaction'].execute!(
      {
        id: tx.id,
        amount: '30.00',
        type: TransactionType.EXPENSE,
        currency: TransactionCurrency.COP,
        date: '2025-02-11',
      },
      fakeContext(),
    );
    expect(client.update).toHaveBeenCalledWith(
      tx.id,
      {
        amount: '30.00',
        type: TransactionType.EXPENSE,
        currency: TransactionCurrency.COP,
        date: '2025-02-11',
        description: null,
      },
      TOKEN,
    );
  });

  it('delete-transaction forwards id + token', async () => {
    client.remove.mockResolvedValue(undefined);
    const tx = makeTx();
    const result = await tools['delete-transaction'].execute!(
      { id: tx.id },
      fakeContext(),
    );
    expect(client.remove).toHaveBeenCalledWith(tx.id, TOKEN);
    expect(result).toEqual({ id: tx.id, deleted: true });
  });

  it('summarize groups by currency, never summing across currencies, with string precision', async () => {
    client.list.mockResolvedValue([
      makeTx({ amount: '10.5000', currency: TransactionCurrency.COP }),
      makeTx({ amount: '0.1000', currency: TransactionCurrency.COP }),
      makeTx({ amount: '2.2500', currency: TransactionCurrency.USD }),
    ]);
    const result = (await tools['summarize-transactions'].execute!(
      {},
      fakeContext(),
    )) as {
      byCurrency: Array<{ currency: string; total: string; count: number }>;
    };

    const cop = result.byCurrency.find((g) => g.currency === 'COP');
    const usd = result.byCurrency.find((g) => g.currency === 'USD');
    expect(cop).toEqual({ currency: 'COP', total: '10.6000', count: 2 });
    expect(usd).toEqual({ currency: 'USD', total: '2.2500', count: 1 });
    // No combined cross-currency total exists.
    expect(result.byCurrency).toHaveLength(2);
  });

  it('the runtime blocks a tool call (no API call) when the token is missing from context (Layer 1)', async () => {
    // Context without the access token → the request-context schema fails and
    // the tool body never runs, so the client is never called.
    const ctx = fakeContext({ [ACCESS_TOKEN_KEY]: undefined });
    const result = (await tools['list-transactions'].execute!({}, ctx)) as {
      error?: boolean;
    };
    expect(result.error).toBe(true);
    expect(client.list).not.toHaveBeenCalled();
    // The token value is never echoed in the blocking error.
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});
