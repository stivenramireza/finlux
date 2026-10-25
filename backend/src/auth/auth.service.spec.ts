import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import type { UsersService } from '../users/users.service.js';
import type { HashingService } from './hashing/hashing.service.js';
import type { SessionService } from '../session/session.service.js';
import type { User } from '../users/entities/user.entity.js';

function makeUser(overrides: Partial<User> = {}): User {
  const base: User = {
    id: 'user-1',
    email: 'user@example.com',
    displayName: null,
    password: 'hashed',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    transactions: [],
  };
  return { ...base, ...overrides };
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
  };
  let sessionService: { record: ReturnType<typeof vi.fn> };
  let jwtService: {
    signAsync: ReturnType<typeof vi.fn>;
    decode: ReturnType<typeof vi.fn>;
  };
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
    };
    sessionService = { record: vi.fn(() => Promise.resolve({})) };
    jwtService = {
      signAsync: vi.fn(() => Promise.resolve('signed.jwt.token')),
      decode: vi.fn(),
    };

    service = new AuthService(
      usersService as unknown as UsersService,
      hashingService as unknown as HashingService,
      jwtService as never,
      sessionService as unknown as SessionService,
    );
  });

  it('normalizes the email, hashes the password, and omits the hash from the response', async () => {
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
    );
    expect(result).not.toHaveProperty('password');
    expect(result.email).toBe('user@example.com');
  });

  it('rejects a duplicate email with a conflict', async () => {
    usersService.findByEmail.mockResolvedValue(makeUser());

    await expect(
      service.register({ email: 'user@example.com', password: 'Str0ng!Pass' }),
    ).rejects.toBeInstanceOf(ConflictException);
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
  };
  let sessionService: { record: ReturnType<typeof vi.fn> };
  let jwtService: {
    signAsync: ReturnType<typeof vi.fn>;
    decode: ReturnType<typeof vi.fn>;
  };
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
    };
    sessionService = { record: vi.fn(() => Promise.resolve({})) };
    jwtService = {
      signAsync: vi.fn(() => Promise.resolve('signed.jwt.token')),
      decode: vi.fn(),
    };

    service = new AuthService(
      usersService as unknown as UsersService,
      hashingService as unknown as HashingService,
      jwtService as never,
      sessionService as unknown as SessionService,
    );
  });

  it('returns a generic 401 for an unknown email (no field disclosure)', async () => {
    usersService.findByEmailWithPassword.mockResolvedValue(null);

    await expect(
      service.login({ email: 'ghost@example.com', password: 'whatever' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
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

  it('signs a token and records a session with expires_at ~= now + 1h', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
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
    const deltaMs = Math.abs(expiresAt.getTime() - (Date.now() + 3600 * 1000));
    // within ~2s of login + 1h
    expect(deltaMs).toBeLessThan(2000);
  });
});
