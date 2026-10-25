import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionsService } from './transactions.service.js';
import { Transaction, TransactionType } from './entities/transaction.entity.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { CategoriesService } from '../categories/categories.service.js';

const USER_A = 'user-a';
const USER_B = 'user-b';

function makeRepo(rows: Partial<Transaction>[]) {
  return {
    create: vi.fn((data: Partial<Transaction>) => data as Transaction),
    save: vi.fn((data: Partial<Transaction>) =>
      Promise.resolve(data as Transaction),
    ),
    softDelete: vi.fn(() => Promise.resolve({ affected: 1 })),
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

describe('TransactionsService (isolation + ownership validation)', () => {
  let service: TransactionsService;
  let repo: ReturnType<typeof makeRepo>;
  let accounts: { findOne: ReturnType<typeof vi.fn> };
  let categories: { findOne: ReturnType<typeof vi.fn> };

  const rows: Partial<Transaction>[] = [
    { id: 'tx-a', userId: USER_A, accountId: 'acc-a', amount: '20.0000' },
    { id: 'tx-b', userId: USER_B, accountId: 'acc-b', amount: '5.0000' },
  ];

  beforeEach(async () => {
    repo = makeRepo(rows);
    // Account belongs to USER_A only; category 'cat-a' visible to USER_A only.
    accounts = {
      findOne: vi.fn((userId: string, accountId: string) =>
        Promise.resolve(
          userId === USER_A && accountId === 'acc-a'
            ? { id: 'acc-a', userId: USER_A }
            : null,
        ),
      ),
    };
    categories = {
      findOne: vi.fn((userId: string, categoryId: string) =>
        Promise.resolve(
          userId === USER_A && categoryId === 'cat-a'
            ? { id: 'cat-a', userId: USER_A }
            : null,
        ),
      ),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getRepositoryToken(Transaction), useValue: repo },
        { provide: AccountsService, useValue: accounts },
        { provide: CategoriesService, useValue: categories },
      ],
    }).compile();
    service = moduleRef.get(TransactionsService);
  });

  const baseCreate = {
    accountId: 'acc-a',
    amount: '20.0000',
    currency: 'COP',
    type: TransactionType.EXPENSE,
    date: '2024-01-15',
  };

  it('create persists when the account belongs to the user', async () => {
    await expect(service.create(USER_A, baseCreate)).resolves.toMatchObject({
      userId: USER_A,
      accountId: 'acc-a',
      amount: '20.0000',
    });
    expect(repo.save).toHaveBeenCalledOnce();
  });

  it('create rejects an account owned by another user', async () => {
    await expect(service.create(USER_B, baseCreate)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('create rejects a category not visible to the user', async () => {
    await expect(
      service.create(USER_A, { ...baseCreate, categoryId: 'cat-b' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
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

  it('softDelete refuses another user transaction and never calls the repo', async () => {
    await expect(service.softDelete(USER_A, 'tx-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.softDelete).not.toHaveBeenCalled();
  });

  it('softDelete scopes the delete by userId for an owned transaction', async () => {
    await service.softDelete(USER_A, 'tx-a');
    expect(repo.softDelete).toHaveBeenCalledWith({
      id: 'tx-a',
      userId: USER_A,
    });
  });
});
