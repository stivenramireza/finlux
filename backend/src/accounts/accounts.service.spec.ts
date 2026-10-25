import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountsService } from './accounts.service.js';
import { Account } from './entities/account.entity.js';

const USER_A = 'user-a';
const USER_B = 'user-b';

/**
 * Minimal in-memory repository that honours `where: { id, userId }` so we can
 * assert user-scoped isolation at the service boundary.
 */
function makeRepo(rows: Partial<Account>[]) {
  return {
    create: vi.fn((data: Partial<Account>) => data as Account),
    save: vi.fn((data: Partial<Account>) => Promise.resolve(data as Account)),
    remove: vi.fn((data: Account) => Promise.resolve(data)),
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

describe('AccountsService (per-user isolation)', () => {
  let service: AccountsService;
  let repo: ReturnType<typeof makeRepo>;

  const rows: Partial<Account>[] = [
    { id: 'acc-a', userId: USER_A, name: 'cash' },
    { id: 'acc-b', userId: USER_B, name: 'payroll' },
  ];

  beforeEach(async () => {
    repo = makeRepo(rows);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AccountsService,
        { provide: getRepositoryToken(Account), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(AccountsService);
  });

  it('findOne returns the row only for its owner', async () => {
    await expect(service.findOne(USER_A, 'acc-a')).resolves.toMatchObject({
      id: 'acc-a',
    });
  });

  it('findOne does not return another user row', async () => {
    await expect(service.findOne(USER_A, 'acc-b')).resolves.toBeNull();
  });

  it('update throws NotFound when targeting another user row', async () => {
    await expect(
      service.update(USER_A, 'acc-b', { name: 'hacked' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('remove throws NotFound when targeting another user row', async () => {
    await expect(service.remove(USER_A, 'acc-b')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.remove).not.toHaveBeenCalled();
  });

  it('findAll is scoped to the owner', async () => {
    const result = await service.findAll(USER_A);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('acc-a');
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_A } }),
    );
  });
});
