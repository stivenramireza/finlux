/**
 * Process-level holder for the two at-rest encryption secrets, decoded once at
 * startup and reused for every encrypt/decrypt/blind-index operation.
 *
 * Why a singleton (not DI): the TypeORM `ValueTransformer` that encrypts entity
 * columns is instantiated at entity-module load — before Nest's DI container
 * and `ConfigService` exist — so it cannot receive the keys through a
 * constructor. Instead the keys are initialized once from the environment at
 * each bootstrap path (`main.ts` and the CLI `data-source.ts`) and read lazily
 * by the transformer via {@link getKeys}.
 *
 * Fail-fast: initialization throws a clear error if a key is missing or does
 * not base64-decode to exactly 32 bytes (AES-256 / HMAC-SHA-256 key size), so a
 * misconfiguration stops the process rather than silently weakening security.
 *
 * Security: this module never logs key material.
 */

/** Expected length (bytes) of each key: 32 bytes for AES-256 and HMAC-SHA-256. */
const KEY_LENGTH_BYTES = 32;

/** The decoded 32-byte keys. */
export interface CryptoKeys {
  /** AES-256-GCM encryption key. */
  encryptionKey: Buffer;
  /** HMAC-SHA-256 key for the deterministic email blind index. */
  emailBidxKey: Buffer;
}

/** Reads a configuration value by key name (e.g. `process.env` or ConfigService). */
export type EnvReader = (name: string) => string | undefined;

let keys: CryptoKeys | null = null;

/**
 * Base64-decodes a key and asserts it is exactly 32 bytes. Throws a clear,
 * value-free error on any problem (missing, not base64, or wrong length).
 */
function decodeKey(name: string, raw: string | undefined): Buffer {
  if (!raw || raw.trim().length === 0) {
    throw new Error(
      `${name} is not set. Define it in backend/.env (base64-encoded 32 bytes). See .env.example.`,
    );
  }
  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw.trim(), 'base64');
  } catch {
    throw new Error(`${name} is not valid base64.`);
  }
  if (decoded.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `${name} must base64-decode to exactly ${KEY_LENGTH_BYTES} bytes (got ${decoded.length}).`,
    );
  }
  return decoded;
}

/**
 * Initializes the process-level keys from the environment. Idempotent: the
 * first successful call wins and later calls are no-ops, so it is safe to call
 * from multiple bootstrap paths (Nest `main.ts` and the TypeORM CLI). Throws
 * on a missing or malformed key (fail-fast).
 */
export function initCryptoKeys(read: EnvReader): CryptoKeys {
  if (keys) {
    return keys;
  }
  const encryptionKey = decodeKey('ENCRYPTION_KEY', read('ENCRYPTION_KEY'));
  const emailBidxKey = decodeKey('BIDX_KEY', read('BIDX_KEY'));
  keys = { encryptionKey, emailBidxKey };
  return keys;
}

/**
 * Returns the initialized keys, or throws if {@link initCryptoKeys} has not run
 * yet. (Only reachable if the bootstrap wiring is wrong.)
 */
export function getKeys(): CryptoKeys {
  if (!keys) {
    throw new Error(
      'Crypto keys are not initialized. Call initCryptoKeys() at startup before any encrypt/decrypt.',
    );
  }
  return keys;
}

/**
 * Test-only hook to reset the singleton so a suite can initialize fixed test
 * keys deterministically. Not used by application code.
 */
export function resetCryptoKeysForTest(): void {
  keys = null;
}
