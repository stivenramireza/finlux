import { Test, type TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { FindOperator, IsNull } from 'typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoriesService } from './categories.service.js';
import { Category } from './entities/category.entity.js';

const USER_A = 'user-a';
const USER_B = 'user-b';

type WhereClause = { id?: string; userId?: string | FindOperator<unknown> };

function matches(row: Partial<Category>, clause: WhereClause): boolean {
  if (clause.id !== undefined && row.id !== clause.id) {
    return false;
  }
  if (clause.userId !== undefined) {
    if (clause.userId instanceof FindOperator) {
      // Only IsNull() is used in this service.
      if (row.userId !== null) {
        return false;
      }
    } else if (row.userId !== clause.userId) {
      return false;
    }
  }
  return true;
}

function makeRepo(rows: Partial<Category>[]) {
  const query = (where: WhereClause | WhereClause[]) => {
    const clauses = Array.isArray(where) ? where : [where];
    return rows.filter((r) => clauses.some((c) => matches(r, c)));
  };
  return {
    create: vi.fn((data: Partial<Category>) => data as Category),
    save: vi.fn((data: Partial<Category>) => Promise.resolve(data as Category)),
    remove: vi.fn((data: Category) => Promise.resolve(data)),
    find: vi.fn((opts: { where: WhereClause | WhereClause[] }) =>
      Promise.resolve(query(opts.where)),
    ),
    findOne: vi.fn((opts: { where: WhereClause | WhereClause[] }) =>
      Promise.resolve(query(opts.where)[0] ?? null),
    ),
  };
}

describe('CategoriesService (global vs user-owned)', () => {
  let service: CategoriesService;
  let repo: ReturnType<typeof makeRepo>;

  const rows: Partial<Category>[] = [
    { id: 'glob-food', userId: null, name: 'Food' },
    { id: 'glob-income', userId: null, name: 'Income' },
    { id: 'a-custom', userId: USER_A, name: 'Coffee' },
    { id: 'b-custom', userId: USER_B, name: 'Gym' },
  ];

  beforeEach(async () => {
    repo = makeRepo(rows);
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: getRepositoryToken(Category), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(CategoriesService);
  });

  it('findAllForUser returns the user own rows plus global seeds, not other users', async () => {
    const result = await service.findAllForUser(USER_A);
    const ids = result.map((c) => c.id).sort();
    expect(ids).toEqual(['a-custom', 'glob-food', 'glob-income']);
    expect(ids).not.toContain('b-custom');
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [{ userId: USER_A }, { userId: IsNull() }],
      }),
    );
  });

  it('findOne exposes a global seed to any user', async () => {
    await expect(service.findOne(USER_A, 'glob-food')).resolves.toMatchObject({
      id: 'glob-food',
    });
  });

  it('findOne does not expose another user category', async () => {
    await expect(service.findOne(USER_A, 'b-custom')).resolves.toBeNull();
  });

  it('update refuses to mutate a global seed', async () => {
    await expect(
      service.update(USER_A, 'glob-food', { name: 'Hacked' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('update refuses to mutate another user category', async () => {
    await expect(
      service.update(USER_A, 'b-custom', { name: 'Hacked' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('remove refuses to delete a global seed', async () => {
    await expect(service.remove(USER_A, 'glob-food')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.remove).not.toHaveBeenCalled();
  });
});
