import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionsService } from './transactions.service.js';
import {
  Transaction,
  TransactionCurrency,
  TransactionType,
} from './entities/transaction.entity.js';

const USER_A = 'user-a';
const USER_B = 'user-b';

function makeRepo(rows: Partial<Transaction>[]) {
  return {
    create: vi.fn((data: Partial<Transaction>) => data as Transaction),
    save: vi.fn((data: Partial<Transaction>) =>
      Promise.resolve(data as Transaction),
    ),
    delete: vi.fn(() => Promise.resolve({ affected: 1 })),
    find: vi.fn((opts: { where: { userId: string } }) =>
      Promise.resolve(rows.filter((r) => r.userId === opts.where.userId)),
    ),
    findOne: vi.fn((opts: { where: { id: string; userId: string } }) =>
      Promise.resolve(
        rows.find(
          (r) => r.id === opts.where.id && r.userId === opts.where.userId,
        ) ?? null,
      ),
    ),
  };
}

describe('TransactionsService (per-user isolation)', () => {
  let service: TransactionsService;
  let repo: ReturnType<typeof makeRepo>;

  const rows: Partial<Transaction>[] = [
    { id: 'tx-a', userId: USER_A, amount: '20.0000' },
    { id: 'tx-b', userId: USER_B, amount: '5.0000' },
  ];

  beforeEach(async () => {
    repo = makeRepo(rows);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getRepositoryToken(Transaction), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(TransactionsService);
  });

  const baseCreate = {
    amount: '20.0000',
    currency: TransactionCurrency.COP,
    type: TransactionType.EXPENSE,
    date: '2024-01-15',
  };

  it('create persists a user-scoped transaction', async () => {
    await expect(service.create(USER_A, baseCreate)).resolves.toMatchObject({
      userId: USER_A,
      amount: '20.0000',
      currency: TransactionCurrency.COP,
    });
    expect(repo.save).toHaveBeenCalledOnce();
  });

  it('findAll only returns the calling user transactions', async () => {
    await expect(service.findAll(USER_A)).resolves.toEqual([
      expect.objectContaining({ id: 'tx-a', userId: USER_A }),
    ]);
  });

  it('findOne does not return another user transaction', async () => {
    await expect(service.findOne(USER_A, 'tx-b')).resolves.toBeNull();
  });

  it('update throws NotFound for another user transaction', async () => {
    await expect(
      service.update(USER_A, 'tx-b', { description: 'x' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('remove refuses another user transaction and never calls the repo', async () => {
    await expect(service.remove(USER_A, 'tx-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('remove scopes the delete by userId for an owned transaction', async () => {
    await service.remove(USER_A, 'tx-a');
    expect(repo.delete).toHaveBeenCalledWith({
      id: 'tx-a',
      userId: USER_A,
    });
  });
});

describe('TransactionCurrency (closed set)', () => {
  it('only accepts COP and USD', () => {
    expect(Object.values(TransactionCurrency)).toEqual(['COP', 'USD']);
  });

  it('persists the currency chosen on create', async () => {
    const repo = makeRepo([]);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getRepositoryToken(Transaction), useValue: repo },
      ],
    }).compile();
    const service = moduleRef.get(TransactionsService);

    await expect(
      service.create(USER_A, {
        amount: '10.0000',
        currency: TransactionCurrency.USD,
        type: TransactionType.INCOME,
        date: '2024-02-01',
      }),
    ).resolves.toMatchObject({ currency: TransactionCurrency.USD });
  });
});
