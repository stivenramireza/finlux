import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Repository } from 'typeorm';
import { UsersService } from './users.service.js';
import type { CryptoService } from '../crypto/crypto.service.js';
import type { User } from './entities/user.entity.js';

/**
 * Unit tests that the user lookups resolve via the email blind index (the
 * encrypted `email` column is unsearchable) and that `create` persists both the
 * encrypted email and its computed `emailBidx`.
 */

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
    emailBidx: 'bidx-user@example.com',
    displayName: null,
    password: 'hashed',
    createdAt: new Date(),
    updatedAt: new Date(),
    transactions: [],
    ...overrides,
  };
}

/** Deterministic crypto stub: normalize (trim+lowercase) then `bidx-<norm>`. */
function makeCrypto(): CryptoService {
  return {
    encrypt: (v: string) => v,
    decrypt: (v: string) => v,
    normalizeEmail: (email: string) => email.trim().toLowerCase(),
    blindIndex: (normalized: string) => `bidx-${normalized}`,
  } as unknown as CryptoService;
}

describe('UsersService (blind-index lookups)', () => {
  let repo: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    findOne: ReturnType<typeof vi.fn>;
  };
  let service: UsersService;

  beforeEach(() => {
    repo = {
      create: vi.fn((entity: Partial<User>) => entity as User),
      save: vi.fn((entity: User) => Promise.resolve(entity)),
      findOne: vi.fn(),
    };
    service = new UsersService(
      repo as unknown as Repository<User>,
      makeCrypto(),
    );
  });

  it('create persists the email plus its computed emailBidx', async () => {
    await service.create({
      email: '  User@Example.com ',
      displayName: 'Jane',
      password: 'hash',
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: '  User@Example.com ',
        emailBidx: 'bidx-user@example.com',
        displayName: 'Jane',
        password: 'hash',
      }),
    );
    expect(repo.save).toHaveBeenCalled();
  });

  it('findByEmail queries by emailBidx (not email), case-insensitively', async () => {
    repo.findOne.mockResolvedValue(makeUser());

    await service.findByEmail('  USER@Example.COM ');

    expect(repo.findOne).toHaveBeenCalledWith({
      where: { emailBidx: 'bidx-user@example.com' },
    });
  });

  it('findByEmailWithPassword queries by emailBidx and selects the password', async () => {
    repo.findOne.mockResolvedValue(makeUser());

    await service.findByEmailWithPassword('user@example.com');

    const arg = repo.findOne.mock.calls[0][0] as {
      where: { emailBidx: string };
      select: Record<string, boolean>;
    };
    expect(arg.where).toEqual({ emailBidx: 'bidx-user@example.com' });
    expect(arg.select.password).toBe(true);
  });
});
