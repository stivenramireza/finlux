import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  PasswordResetService,
  parseDurationMs,
} from './password-reset.service.js';
import type { PasswordResetToken } from './entities/password-reset-token.entity.js';
import type { CryptoService } from '../../crypto/crypto.service.js';
import type { UsersService } from '../../users/users.service.js';
import type { HashingService } from '../hashing/hashing.service.js';
import type { PasswordHistoryService } from '../../password-history/password-history.service.js';
import type { MailerPort } from '../../mail/mailer.port.js';
import type { ConfigService } from '@nestjs/config';
import type { DataSource } from 'typeorm';

/** The distinctive reuse message (kept in sync with the service constant). */
const PASSWORD_REUSE_MESSAGE =
  "You've used this password before — please choose a new one.";

/**
 * Flush microtasks so the fire-and-forget email dispatch (`void ...catch`) runs
 * before assertions on the mailer.
 */
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

const sha256 = (v: string): string =>
  createHash('sha256').update(v).digest('hex');

interface FakeState {
  cooldownRecentCount: number;
  token: PasswordResetToken | null;
  consumeAffected: number;
  updateCalls: Array<{ userId: string; usedAt: unknown }>;
  insertCalls: Array<Partial<PasswordResetToken>>;
  consumeCalls: Array<{ id: string }>;
}

/**
 * Builds a DataSource test double whose repository/transaction methods route
 * through a small in-memory `state`, so the service's SQL-building calls
 * (cooldown count, supersede update, insert, atomic consume) are observable
 * without a real DB.
 */
function makeDataSource(state: FakeState): DataSource {
  const makeRepo = () => ({
    createQueryBuilder: () => {
      const qb = {
        _mode: '' as 'select' | 'update' | '',
        _where: {} as Record<string, unknown>,
        where(_c: string, params?: Record<string, unknown>) {
          Object.assign(qb._where, params);
          return qb;
        },
        andWhere(_c: string, params?: Record<string, unknown>) {
          Object.assign(qb._where, params);
          return qb;
        },
        update() {
          qb._mode = 'update';
          return qb;
        },
        set(values: Record<string, unknown>) {
          (qb as unknown as { _set: unknown })._set = values;
          return qb;
        },
        getCount: () => Promise.resolve(state.cooldownRecentCount),
        execute: () => {
          const setVals = (qb as unknown as { _set?: { usedAt?: unknown } })
            ._set;
          if (qb._where.id) {
            // Atomic consume on confirm.
            state.consumeCalls.push({ id: qb._where.id as string });
            return Promise.resolve({ affected: state.consumeAffected });
          }
          // Supersede on request.
          state.updateCalls.push({
            userId: qb._where.userId as string,
            usedAt: setVals?.usedAt,
          });
          return Promise.resolve({ affected: 1 });
        },
      };
      return qb;
    },
    insert: (row: Partial<PasswordResetToken>) => {
      state.insertCalls.push(row);
      return Promise.resolve({ identifiers: [{ id: 'new-token' }] });
    },
    findOne: () => Promise.resolve(state.token),
  });

  return {
    getRepository: () => makeRepo(),
    transaction: (cb: (m: unknown) => Promise<unknown>) =>
      cb({ getRepository: () => makeRepo() }),
  } as unknown as DataSource;
}

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    PASSWORD_RESET_TOKEN_TTL: '5m',
    PASSWORD_RESET_REQUEST_COOLDOWN: '60s',
    APP_BASE_URL: 'http://localhost:3000',
    ...overrides,
  };
  return {
    get: (name: string) => values[name],
  } as unknown as ConfigService;
}

describe('parseDurationMs', () => {
  it('parses units and falls back on malformed input', () => {
    expect(parseDurationMs('5m', 0)).toBe(300000);
    expect(parseDurationMs('60s', 0)).toBe(60000);
    expect(parseDurationMs('1h', 0)).toBe(3600000);
    expect(parseDurationMs('30', 0)).toBe(30000); // bare number = seconds
    expect(parseDurationMs('nonsense', 1234)).toBe(1234);
    expect(parseDurationMs(undefined, 42)).toBe(42);
  });
});

describe('PasswordResetService.request', () => {
  let state: FakeState;
  let usersService: {
    findByEmail: ReturnType<typeof vi.fn>;
    updatePassword: ReturnType<typeof vi.fn>;
  };
  let hashingService: { hash: ReturnType<typeof vi.fn> };
  let crypto: CryptoService;
  let mailer: { sendPasswordResetEmail: ReturnType<typeof vi.fn> };
  let passwordHistory: {
    assertNotReused: ReturnType<typeof vi.fn>;
    record: ReturnType<typeof vi.fn>;
  };
  let service: PasswordResetService;

  const build = (configOverrides: Record<string, string> = {}) => {
    service = new PasswordResetService(
      makeDataSource(state),
      usersService as unknown as UsersService,
      hashingService as unknown as HashingService,
      crypto,
      makeConfig(configOverrides),
      mailer as unknown as MailerPort,
      passwordHistory as unknown as PasswordHistoryService,
    );
  };

  beforeEach(() => {
    state = {
      cooldownRecentCount: 0,
      token: null,
      consumeAffected: 1,
      updateCalls: [],
      insertCalls: [],
      consumeCalls: [],
    };
    usersService = {
      findByEmail: vi.fn(),
      updatePassword: vi.fn(() => Promise.resolve()),
    };
    hashingService = { hash: vi.fn(() => Promise.resolve('bcrypt-hash')) };
    crypto = {
      normalizeEmail: (e: string) => e.trim().toLowerCase(),
      blindIndex: (n: string) => `bidx-${n}`,
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
    } as unknown as CryptoService;
    mailer = { sendPasswordResetEmail: vi.fn(() => Promise.resolve()) };
    passwordHistory = {
      assertNotReused: vi.fn(() => Promise.resolve()),
      record: vi.fn(() => Promise.resolve()),
    };
    build();
  });

  it('non-existent email → no token created and the mailer is never called', async () => {
    usersService.findByEmail.mockResolvedValue(null);

    await service.request('ghost@example.com');
    await flush();

    expect(usersService.findByEmail).toHaveBeenCalledWith('ghost@example.com');
    expect(state.insertCalls).toHaveLength(0);
    expect(mailer.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('existing email → one hashed, 5-min, single-use token + one send', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });

    const before = Date.now();
    await service.request('User@Example.com', 'en');
    await flush();

    // Exactly one token persisted; only the hash is stored (never the raw).
    expect(state.insertCalls).toHaveLength(1);
    const row = state.insertCalls[0];
    expect(row.userId).toBe('user-1');
    expect(typeof row.tokenHash).toBe('string');
    expect(row.tokenHash).toHaveLength(64); // sha256 hex
    expect(row.usedAt).toBeNull();
    // ~5 minutes expiry.
    const ttl = (row.expiresAt as Date).getTime() - before;
    expect(ttl).toBeGreaterThan(4 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(5 * 60 * 1000 + 2000);

    // Exactly one email, to the decrypted address, with a link from APP_BASE_URL.
    expect(mailer.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const arg = mailer.sendPasswordResetEmail.mock.calls[0][0] as {
      to: string;
      resetUrl: string;
      locale: string;
    };
    expect(arg.to).toBe('user@example.com');
    expect(arg.locale).toBe('en');
    expect(arg.resetUrl).toMatch(
      /^http:\/\/localhost:3000\/reset-password\?token=.+/,
    );
  });

  it('re-request supersedes outstanding tokens (≤1 live) in a transaction', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });

    await service.request('user@example.com');
    await flush();

    // The supersede UPDATE ran for this user before the insert.
    expect(state.updateCalls).toHaveLength(1);
    expect(state.updateCalls[0].userId).toBe('user-1');
    expect(state.insertCalls).toHaveLength(1);
  });

  it('cooldown suppresses a rapid second request (no new token/send)', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    state.cooldownRecentCount = 1; // a recent request exists

    await service.request('user@example.com');
    await flush();

    expect(state.insertCalls).toHaveLength(0);
    expect(mailer.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('does not throw when the email dispatch fails (uniform response preserved)', async () => {
    usersService.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });
    mailer.sendPasswordResetEmail.mockRejectedValue(new Error('resend down'));

    await expect(service.request('user@example.com')).resolves.toBeUndefined();
    await flush();
    expect(state.insertCalls).toHaveLength(1);
  });
});

describe('PasswordResetService.confirm', () => {
  let state: FakeState;
  let usersService: {
    findByEmail: ReturnType<typeof vi.fn>;
    updatePassword: ReturnType<typeof vi.fn>;
  };
  let hashingService: { hash: ReturnType<typeof vi.fn> };
  let crypto: CryptoService;
  let mailer: { sendPasswordResetEmail: ReturnType<typeof vi.fn> };
  let passwordHistory: {
    assertNotReused: ReturnType<typeof vi.fn>;
    record: ReturnType<typeof vi.fn>;
  };
  let service: PasswordResetService;

  const rawToken = 'raw-reset-token';
  const validToken = (
    overrides: Partial<PasswordResetToken> = {},
  ): PasswordResetToken =>
    ({
      id: 'token-1',
      userId: 'user-1',
      tokenHash: sha256(rawToken),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as PasswordResetToken;

  beforeEach(() => {
    state = {
      cooldownRecentCount: 0,
      token: null,
      consumeAffected: 1,
      updateCalls: [],
      insertCalls: [],
      consumeCalls: [],
    };
    usersService = {
      findByEmail: vi.fn(),
      updatePassword: vi.fn(() => Promise.resolve()),
    };
    hashingService = { hash: vi.fn(() => Promise.resolve('bcrypt-hash')) };
    crypto = {
      normalizeEmail: (e: string) => e.trim().toLowerCase(),
      blindIndex: (n: string) => `bidx-${n}`,
      encrypt: (v: string) => v,
      decrypt: (v: string) => v,
    } as unknown as CryptoService;
    mailer = { sendPasswordResetEmail: vi.fn(() => Promise.resolve()) };
    passwordHistory = {
      assertNotReused: vi.fn(() => Promise.resolve()),
      record: vi.fn(() => Promise.resolve()),
    };
    service = new PasswordResetService(
      makeDataSource(state),
      usersService as unknown as UsersService,
      hashingService as unknown as HashingService,
      crypto,
      makeConfig(),
      mailer as unknown as MailerPort,
      passwordHistory as unknown as PasswordHistoryService,
    );
  });

  it('valid token + valid password → password updated, history recorded, token consumed', async () => {
    state.token = validToken();

    await service.confirm(rawToken, 'N3w!Password');

    expect(passwordHistory.assertNotReused).toHaveBeenCalledWith(
      'user-1',
      'N3w!Password',
    );
    expect(state.consumeCalls).toHaveLength(1);
    expect(state.consumeCalls[0].id).toBe('token-1');
    expect(hashingService.hash).toHaveBeenCalledWith('N3w!Password');
    expect(usersService.updatePassword).toHaveBeenCalledWith(
      'user-1',
      'bcrypt-hash',
      expect.anything(),
    );
    expect(passwordHistory.record).toHaveBeenCalledWith(
      'user-1',
      'bcrypt-hash',
      expect.anything(),
    );
  });

  it('reused new password → 400 reuse message, token NOT consumed, nothing changes', async () => {
    state.token = validToken();
    passwordHistory.assertNotReused.mockRejectedValue(
      new BadRequestException(PASSWORD_REUSE_MESSAGE),
    );

    let error: unknown;
    try {
      await service.confirm(rawToken, 'R3used!Pass');
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(PASSWORD_REUSE_MESSAGE);
    // The token is left live for a retry (reuse-check runs BEFORE consume).
    expect(state.consumeCalls).toHaveLength(0);
    expect(usersService.updatePassword).not.toHaveBeenCalled();
    expect(passwordHistory.record).not.toHaveBeenCalled();
  });

  it('invalid-token 400 message is generic and distinct from the reuse message', async () => {
    state.token = null;

    let error: unknown;
    try {
      await service.confirm('does-not-exist', 'N3w!Password');
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).not.toBe(
      PASSWORD_REUSE_MESSAGE,
    );
    // Reuse-check is never reached for an invalid token.
    expect(passwordHistory.assertNotReused).not.toHaveBeenCalled();
  });

  it('unknown token → generic 400, no password change', async () => {
    state.token = null;

    await expect(
      service.confirm('does-not-exist', 'N3w!Password'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usersService.updatePassword).not.toHaveBeenCalled();
  });

  it('expired token → generic 400, no password change', async () => {
    state.token = validToken({ expiresAt: new Date(Date.now() - 1000) });

    await expect(
      service.confirm(rawToken, 'N3w!Password'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usersService.updatePassword).not.toHaveBeenCalled();
  });

  it('already-used token → generic 400, no password change', async () => {
    state.token = validToken({ usedAt: new Date() });

    await expect(
      service.confirm(rawToken, 'N3w!Password'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usersService.updatePassword).not.toHaveBeenCalled();
  });

  it('lost the atomic consume race → generic 400, no password change', async () => {
    state.token = validToken();
    state.consumeAffected = 0; // another request consumed it first

    await expect(
      service.confirm(rawToken, 'N3w!Password'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usersService.updatePassword).not.toHaveBeenCalled();
  });
});
