import { beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  PASSWORD_REUSE_MESSAGE,
  PasswordHistoryService,
} from './password-history.service.js';
import type { PasswordHistory } from './entities/password-history.entity.js';
import type { HashingService } from '../auth/hashing/hashing.service.js';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';

/** In-memory capture of what the repository double was asked to do. */
interface RepoState {
  /** Rows returned by `find` (already ordered newest-first by the caller). */
  rows: PasswordHistory[];
  findCalls: Array<{ take?: number; order?: unknown; where?: unknown }>;
  insertCalls: Array<Partial<PasswordHistory>>;
  pruneCalls: Array<{ userId?: string; depth?: number }>;
}

/**
 * A `Repository<PasswordHistory>` double. `find` returns `state.rows` and
 * records the query options (so we can assert `take === N` and newest-first
 * ordering). `insert` and the delete-query-builder (prune) are observable.
 */
function makeRepo(state: RepoState): Repository<PasswordHistory> {
  return {
    find: (options: { take?: number; order?: unknown; where?: unknown }) => {
      state.findCalls.push(options);
      return Promise.resolve(state.rows);
    },
    insert: (row: Partial<PasswordHistory>) => {
      state.insertCalls.push(row);
      return Promise.resolve({ identifiers: [{ id: 'new' }] });
    },
    createQueryBuilder: () => {
      const params: Record<string, unknown> = {};
      const qb = {
        delete: () => qb,
        from: () => qb,
        where: (_c: string, p?: Record<string, unknown>) => {
          Object.assign(params, p);
          return qb;
        },
        andWhere: (_c: string, p?: Record<string, unknown>) => {
          Object.assign(params, p);
          return qb;
        },
        execute: () => {
          state.pruneCalls.push({
            userId: params.userId as string,
            depth: params.depth as number,
          });
          return Promise.resolve({ affected: 0 });
        },
      };
      return qb;
    },
  } as unknown as Repository<PasswordHistory>;
}

/**
 * A `HashingService` double whose `compare(plain, hash)` matches iff the hash
 * equals `hash-of:<plain>`. Counts calls so the short-circuit can be asserted.
 */
function makeHashing(): HashingService & { compareCalls: number } {
  const svc = {
    compareCalls: 0,
    hash: (plain: string) => Promise.resolve(`hash-of:${plain}`),
    compare: (plain: string, hash: string) => {
      svc.compareCalls += 1;
      return Promise.resolve(hash === `hash-of:${plain}`);
    },
  };
  return svc as unknown as HashingService & { compareCalls: number };
}

function makeConfig(depth?: string | number): ConfigService {
  return {
    get: (key: string) =>
      key === 'PASSWORD_HISTORY_DEPTH' ? depth : undefined,
  } as unknown as ConfigService;
}

/** Builds a history row for `plaintext` (newest-first ordering is the array). */
function row(plaintext: string): PasswordHistory {
  return { passwordHash: `hash-of:${plaintext}` } as PasswordHistory;
}

describe('PasswordHistoryService.assertNotReused', () => {
  let state: RepoState;
  let hashing: HashingService & { compareCalls: number };

  const build = (depth?: string | number) =>
    new PasswordHistoryService(makeRepo(state), hashing, makeConfig(depth));

  beforeEach(() => {
    state = { rows: [], findCalls: [], insertCalls: [], pruneCalls: [] };
    hashing = makeHashing();
  });

  it('is a no-op when the history is empty (e.g. at registration)', async () => {
    const service = build();
    await expect(
      service.assertNotReused('user-1', 'Any!Pass1'),
    ).resolves.toBeUndefined();
    expect(hashing.compareCalls).toBe(0);
  });

  it('loads the N most recent entries, newest-first', async () => {
    const service = build(5);
    state.rows = [row('p5'), row('p4'), row('p3')];
    await service.assertNotReused('user-1', 'Fresh!Pass1');
    expect(state.findCalls).toHaveLength(1);
    expect(state.findCalls[0].take).toBe(5);
    expect(state.findCalls[0].order).toEqual({ createdAt: 'DESC' });
    expect(state.findCalls[0].where).toEqual({ userId: 'user-1' });
  });

  it('rejects a match against the current (most recent) password', async () => {
    const service = build(5);
    state.rows = [row('current'), row('older1')];
    let error: unknown;
    try {
      await service.assertNotReused('user-1', 'current');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).message).toBe(PASSWORD_REUSE_MESSAGE);
    // Short-circuit: the current (first) match stops after one compare.
    expect(hashing.compareCalls).toBe(1);
  });

  it('rejects a match against a prior password within the window', async () => {
    const service = build(5);
    state.rows = [row('current'), row('older1'), row('older2')];
    await expect(
      service.assertNotReused('user-1', 'older2'),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Compared current, older1, older2 (match on the 3rd) → short-circuit.
    expect(hashing.compareCalls).toBe(3);
  });

  it('accepts a password older than N (fell out of the window)', async () => {
    // Depth 3: only the 3 newest are loaded; the 4th-oldest is reusable.
    const service = build(3);
    // The repo `find` with take:3 would return only these 3 (simulated).
    state.rows = [row('p3'), row('p2'), row('p1')];
    await expect(
      service.assertNotReused('user-1', 'veryOld'),
    ).resolves.toBeUndefined();
    expect(hashing.compareCalls).toBe(3);
  });

  it('short-circuits at the first match (does not compare the rest)', async () => {
    const service = build(5);
    state.rows = [row('current'), row('older1'), row('older2'), row('older3')];
    await expect(
      service.assertNotReused('user-1', 'current'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(hashing.compareCalls).toBe(1);
  });

  it('clamps the depth to >= 1 when misconfigured, defaulting to 5 otherwise', async () => {
    // 0/negative/NaN fall back to the default (5); the take reflects it.
    const zero = build(0);
    await zero.assertNotReused('user-1', 'x');
    expect(state.findCalls[0].take).toBe(5);

    state.findCalls = [];
    const negative = build(-3);
    await negative.assertNotReused('user-1', 'x');
    expect(state.findCalls[0].take).toBe(5);

    state.findCalls = [];
    const explicit = build(2);
    await explicit.assertNotReused('user-1', 'x');
    expect(state.findCalls[0].take).toBe(2);
  });
});

describe('PasswordHistoryService.record', () => {
  let state: RepoState;
  let hashing: HashingService & { compareCalls: number };

  const build = (depth?: string | number) =>
    new PasswordHistoryService(makeRepo(state), hashing, makeConfig(depth));

  beforeEach(() => {
    state = { rows: [], findCalls: [], insertCalls: [], pruneCalls: [] };
    hashing = makeHashing();
  });

  it('inserts the hash and prunes to the N most recent for the user', async () => {
    const service = build(5);
    await service.record('user-1', 'hash-of:newpass');

    expect(state.insertCalls).toHaveLength(1);
    expect(state.insertCalls[0]).toEqual({
      userId: 'user-1',
      passwordHash: 'hash-of:newpass',
    });
    // Prune ran scoped to the user with the configured depth.
    expect(state.pruneCalls).toHaveLength(1);
    expect(state.pruneCalls[0].userId).toBe('user-1');
    expect(state.pruneCalls[0].depth).toBe(5);
  });

  it('stores only the provided hash (never plaintext)', async () => {
    const service = build(5);
    await service.record('user-1', 'hash-of:secret');
    expect(state.insertCalls[0].passwordHash).toBe('hash-of:secret');
    // No plaintext leaks into the stored row.
    expect(JSON.stringify(state.insertCalls[0])).not.toContain('secret-plain');
  });
});
