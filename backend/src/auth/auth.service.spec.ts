import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AuthService } from './auth.service.js';
import type { CryptoService } from '../crypto/crypto.service.js';
import type { UsersService } from '../users/users.service.js';
import type { HashingService } from './hashing/hashing.service.js';
import type { SessionService } from '../session/session.service.js';
import type { PasswordHistoryService } from '../password-history/password-history.service.js';
import type { DataSource } from 'typeorm';
import type { User } from '../users/entities/user.entity.js';

function makeUser(overrides: Partial<User> = {}): User {
  const base: User = {
    id: 'user-1',
    email: 'user@example.com',
    emailBidx: 'bidx-user@example.com',
    displayName: null,
    password: 'hashed',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    transactions: [],
  };
  return { ...base, ...overrides };
}

/**
 * A crypto stub whose `normalizeEmail` matches the real behavior (trim +
 * lowercase) so AuthService normalization is exercised; `blindIndex` is a
 * deterministic stand-in (not needed by these mocked-repo tests).
 */
function makeCrypto(): CryptoService {
  return {
    encrypt: (v: string) => v,
    decrypt: (v: string) => v,
    blindIndex: (normalized: string) => `bidx-${normalized}`,
    normalizeEmail: (email: string) => email.trim().toLowerCase(),
  } as unknown as CryptoService;
}

/**
 * A DataSource test double whose `transaction(cb)` runs the callback with a
 * fake EntityManager. `register` creates the user and seeds history inside this
 * transaction; the double lets the mocked `usersService.create` /
 * `passwordHistory.record` run and surfaces any error (so the 23505→409
 * rollback path is exercised).
 */
function makeDataSource(): DataSource {
  const manager = {} as unknown;
  return {
    transaction: (cb: (m: unknown) => Promise<unknown>) => cb(manager),
  } as unknown as DataSource;
}

/** A unique-violation error mimicking what TypeORM surfaces for SQLSTATE 23505. */
function uniqueViolation(): QueryFailedError {
  const error = new QueryFailedError('insert', [], new Error('duplicate'));
  (error as QueryFailedError & { code?: string }).code = '23505';
  return error;
}

describe('AuthService.register', () => {
  let usersService: {
    findByEmail: ReturnType<typeof vi.fn>;
    findByEmailWithPassword: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let hashingService: {
    hash: ReturnType<typeof vi.fn>;
    compare: ReturnType<typeof vi.fn>;
    compareWithDummy?: ReturnType<typeof vi.fn>;
  };
  let sessionService: { record: ReturnType<typeof vi.fn> };
  let jwtService: {
    signAsync: ReturnType<typeof vi.fn>;
    decode: ReturnType<typeof vi.fn>;
  };
  let passwordHistory: { record: ReturnType<typeof vi.fn> };
  let service: AuthService;

  beforeEach(() => {
    usersService = {
      findByEmail: vi.fn(),
      findByEmailWithPassword: vi.fn(),
      create: vi.fn(),
    };
    hashingService = {
      hash: vi.fn(() => Promise.resolve('bcrypt-hash')),
      compare: vi.fn(),
      compareWithDummy: vi.fn(() => Promise.resolve(false)),
    };
    sessionService = { record: vi.fn(() => Promise.resolve({})) };
    jwtService = {
      signAsync: vi.fn(() => Promise.resolve('signed.jwt.token')),
      decode: vi.fn(),
    };
    passwordHistory = { record: vi.fn(() => Promise.resolve()) };

    service = new AuthService(
      usersService as unknown as UsersService,
      hashingService as unknown as HashingService,
      jwtService as never,
      sessionService as unknown as SessionService,
      makeCrypto(),
      makeDataSource(),
      passwordHistory as unknown as PasswordHistoryService,
    );
  });

  it('normalizes the email and hashes the password when the email is new', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockResolvedValue(
      makeUser({ email: 'user@example.com', password: 'bcrypt-hash' }),
    );

    const result = await service.register({
      email: '  User@Example.COM ',
      password: 'Str0ng!Pass',
    });

    expect(usersService.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(hashingService.hash).toHaveBeenCalledWith('Str0ng!Pass');
    expect(usersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        password: 'bcrypt-hash',
      }),
      expect.anything(),
    );
    // Non-disclosing: the service returns nothing (no created record / id /
    // password) so the controller can emit an identical generic response.
    expect(result).toBeUndefined();
  });

  it('records a first password-history entry on successful registration', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.create.mockResolvedValue(
      makeUser({ id: 'user-1', password: 'bcrypt-hash' }),
    );

    await service.register({
      email: 'user@example.com',
      password: 'Str0ng!Pass',
    });

    expect(passwordHistory.record).toHaveBeenCalledOnce();
    expect(passwordHistory.record).toHaveBeenCalledWith(
      'user-1',
      'bcrypt-hash',
      expect.anything(),
    );
  });

  it('swallows a 23505 unique violation (find-then-create race) with no 409 and no orphan history', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    // The find-then-create race: the pre-check passed but the insert collides.
    usersService.create.mockRejectedValue(uniqueViolation());

    // Non-disclosing: resolves normally (no ConflictException surfaced).
    await expect(
      service.register({ email: 'user@example.com', password: 'Str0ng!Pass' }),
    ).resolves.toBeUndefined();
    // History is only recorded after a successful create, so none is written.
    expect(passwordHistory.record).not.toHaveBeenCalled();
  });

  it('does not create or modify anything, and does not throw, for an already-registered email', async () => {
    usersService.findByEmail.mockResolvedValue(makeUser());

    await expect(
      service.register({ email: 'user@example.com', password: 'Str0ng!Pass' }),
    ).resolves.toBeUndefined();
    expect(usersService.create).not.toHaveBeenCalled();
    expect(passwordHistory.record).not.toHaveBeenCalled();
  });

  it('pays the equivalent bcrypt cost on the already-registered path (timing symmetry, no oracle)', async () => {
    usersService.findByEmail.mockResolvedValue(makeUser());

    await service.register({
      email: 'user@example.com',
      password: 'Str0ng!Pass',
    });

    // The submitted password is hashed on BOTH paths, and the already-registered
    // path additionally runs a constant-cost dummy compare — so neither the work
    // nor the timing reveals that the email already exists.
    expect(hashingService.hash).toHaveBeenCalledWith('Str0ng!Pass');
    expect(hashingService.compareWithDummy).toHaveBeenCalledWith('Str0ng!Pass');
  });

  it('treats a case-insensitive existing email as already-registered (normalized lookup), non-disclosing', async () => {
    // The normalized email is what reaches findByEmail; a differently-cased
    // registration resolves to the existing normalized record.
    usersService.findByEmail.mockResolvedValue(makeUser());

    await expect(
      service.register({
        email: '  USER@Example.com ',
        password: 'Str0ng!Pass',
      }),
    ).resolves.toBeUndefined();
    expect(usersService.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(usersService.create).not.toHaveBeenCalled();
  });
});

describe('AuthService.login', () => {
  let usersService: {
    findByEmail: ReturnType<typeof vi.fn>;
    findByEmailWithPassword: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let hashingService: {
    hash: ReturnType<typeof vi.fn>;
    compare: ReturnType<typeof vi.fn>;
    compareWithDummy?: ReturnType<typeof vi.fn>;
  };
  let sessionService: { record: ReturnType<typeof vi.fn> };
  let jwtService: {
    signAsync: ReturnType<typeof vi.fn>;
    decode: ReturnType<typeof vi.fn>;
  };
  let passwordHistory: { record: ReturnType<typeof vi.fn> };
  let service: AuthService;

  beforeEach(() => {
    usersService = {
      findByEmail: vi.fn(),
      findByEmailWithPassword: vi.fn(),
      create: vi.fn(),
    };
    hashingService = {
      hash: vi.fn(),
      compare: vi.fn(),
      compareWithDummy: vi.fn(() => Promise.resolve(false)),
    };
    sessionService = { record: vi.fn(() => Promise.resolve({})) };
    jwtService = {
      signAsync: vi.fn(() => Promise.resolve('signed.jwt.token')),
      decode: vi.fn(),
    };
    passwordHistory = { record: vi.fn(() => Promise.resolve()) };

    service = new AuthService(
      usersService as unknown as UsersService,
      hashingService as unknown as HashingService,
      jwtService as never,
      sessionService as unknown as SessionService,
      makeCrypto(),
      makeDataSource(),
      passwordHistory as unknown as PasswordHistoryService,
    );
  });

  it('runs a constant-cost dummy compare and returns a generic 401 for an unknown email (no field disclosure, no timing oracle)', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue(null);

    await expect(
      service.login({ email: 'ghost@example.com', password: 'whatever' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // The null branch MUST still perform an equivalent bcrypt compare so its
    // timing matches the found path; it uses the dummy-hash compare, not the
    // real-user compare.
    expect(hashingService.compareWithDummy).toHaveBeenCalledWith('whatever');
    expect(hashingService.compare).not.toHaveBeenCalled();
  });

  it('returns the same generic 401 for a wrong password', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue(makeUser());
    hashingService.compare.mockResolvedValue(false);

    let unknownEmailMessage = '';
    try {
      await service.login({ email: 'ghost@example.com', password: 'x' });
    } catch (e) {
      unknownEmailMessage = (e as UnauthorizedException).message;
    }

    usersService.findByEmailWithPassword.mockResolvedValue(makeUser());
    let wrongPasswordError: unknown;
    try {
      await service.login({ email: 'user@example.com', password: 'wrong' });
    } catch (e) {
      wrongPasswordError = e;
    }

    expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
    expect((wrongPasswordError as UnauthorizedException).message).toBe(
      unknownEmailMessage,
    );
    expect(sessionService.record).not.toHaveBeenCalled();
  });

  it('signs a token and records a session with expires_at ~= now + 5m', async () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    usersService.findByEmailWithPassword.mockResolvedValue(makeUser());
    hashingService.compare.mockResolvedValue(true);
    jwtService.decode.mockReturnValue({ exp });

    const result = await service.login({
      email: 'user@example.com',
      password: 'Str0ng!Pass',
    });

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.user).not.toHaveProperty('password');
    expect(sessionService.record).toHaveBeenCalledOnce();

    const [userId, rawToken, expiresAt] = sessionService.record.mock
      .calls[0] as [string, string, Date];
    expect(userId).toBe('user-1');
    expect(rawToken).toBe('signed.jwt.token');
    const deltaMs = Math.abs(expiresAt.getTime() - (Date.now() + 300 * 1000));
    // within ~2s of login + 5m
    expect(deltaMs).toBeLessThan(2000);
  });
});
