import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { blindIndex, decrypt, encrypt, normalizeEmail } from './crypto.js';
import {
  type EnvReader,
  initCryptoKeys,
  resetCryptoKeysForTest,
} from './crypto-keys.js';

/**
 * Deterministic crypto tests using FIXED test keys (never reads `.env`). Two
 * distinct, valid 32-byte base64 keys so AES and the blind index are exercised
 * independently.
 */
const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
const TEST_BIDX_KEY = Buffer.alloc(32, 9).toString('base64');

const reader =
  (env: Record<string, string | undefined>): EnvReader =>
  (name) =>
    env[name];

beforeAll(() => {
  resetCryptoKeysForTest();
  initCryptoKeys(
    reader({
      ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
      BIDX_KEY: TEST_BIDX_KEY,
    }),
  );
});

describe('encrypt/decrypt round-trip', () => {
  it.each([
    ['ascii', 'hello world'],
    ['unicode', 'café ☕ — 日本語 — Ñoño'],
    ['long', 'x'.repeat(10_000)],
    ['empty', ''],
  ])('round-trips %s plaintext', (_label, plaintext) => {
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });
});

describe('randomized IV', () => {
  it('produces different ciphertext for equal plaintext, both decrypt to x', () => {
    const x = 'same plaintext value';
    const a = encrypt(x);
    const b = encrypt(x);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(x);
    expect(decrypt(b)).toBe(x);
  });
});

describe('envelope shape', () => {
  it('is v1:<iv_b64>:<tag_b64>:<ciphertext_b64> with 12-byte IV and 16-byte tag', () => {
    const envelope = encrypt('shape check');
    const parts = envelope.split(':');
    expect(parts).toHaveLength(4);
    const [version, ivB64, tagB64] = parts;
    expect(version).toBe('v1');
    expect(Buffer.from(ivB64, 'base64')).toHaveLength(12);
    expect(Buffer.from(tagB64, 'base64')).toHaveLength(16);
  });
});

describe('tamper detection', () => {
  it('throws when the ciphertext is flipped', () => {
    const envelope = encrypt('tamper target');
    const parts = envelope.split(':');
    const ct = Buffer.from(parts[3], 'base64');
    ct[0] = ct[0] ^ 0xff;
    parts[3] = ct.toString('base64');
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  it('throws when the auth tag is flipped', () => {
    const envelope = encrypt('tamper tag');
    const parts = envelope.split(':');
    const tag = Buffer.from(parts[2], 'base64');
    tag[0] = tag[0] ^ 0xff;
    parts[2] = tag.toString('base64');
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  it('throws on an unsupported version prefix (v2:)', () => {
    const envelope = encrypt('version check');
    const parts = envelope.split(':');
    parts[0] = 'v2';
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  it('throws on a malformed shape (wrong number of parts)', () => {
    expect(() => decrypt('v1:only:three')).toThrow();
  });
});

describe('blind index', () => {
  it('is deterministic for the same normalized input', () => {
    expect(blindIndex('user@example.com')).toBe(blindIndex('user@example.com'));
  });

  it('is case-insensitive after normalization', () => {
    const a = blindIndex(normalizeEmail('  User@Example.COM '));
    const b = blindIndex(normalizeEmail('user@example.com'));
    expect(a).toBe(b);
  });

  it('differs for a different email', () => {
    expect(blindIndex('a@example.com')).not.toBe(blindIndex('b@example.com'));
  });

  it('is a stable 64-char lowercase hex string', () => {
    const idx = blindIndex('user@example.com');
    expect(idx).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Foo.Bar@Example.COM ')).toBe(
      'foo.bar@example.com',
    );
  });
});

describe('key validation (fail-fast)', () => {
  beforeEach(() => {
    resetCryptoKeysForTest();
  });

  it('throws when a key is missing', () => {
    expect(() => initCryptoKeys(reader({ BIDX_KEY: TEST_BIDX_KEY }))).toThrow(
      /ENCRYPTION_KEY/,
    );
  });

  it('throws when a key is the wrong length', () => {
    const shortKey = Buffer.alloc(16, 1).toString('base64');
    expect(() =>
      initCryptoKeys(
        reader({
          ENCRYPTION_KEY: shortKey,
          BIDX_KEY: TEST_BIDX_KEY,
        }),
      ),
    ).toThrow(/32 bytes/);
  });

  // Restore the shared fixed keys for any later-ordered suites in this file.
  it('re-initializes the fixed keys for subsequent tests', () => {
    resetCryptoKeysForTest();
    expect(() =>
      initCryptoKeys(
        reader({
          ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
          BIDX_KEY: TEST_BIDX_KEY,
        }),
      ),
    ).not.toThrow();
  });
});
