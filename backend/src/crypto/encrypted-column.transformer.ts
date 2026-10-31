import { ValueTransformer } from 'typeorm';
import { decrypt, encrypt } from './crypto.js';

/**
 * Transparently encrypts a column at rest with AES-256-GCM (see
 * {@link encrypt}) and decrypts it on read, so services and the API keep
 * working with plaintext while the stored value is an opaque ciphertext
 * envelope.
 *
 * `null`/`undefined` are preserved unchanged (a null column stays null; we
 * never encrypt or fabricate a value for null).
 *
 * Key handling: the keys are read LAZILY inside `to`/`from` via the crypto
 * primitives (which call `getKeys()`), never in the constructor — this
 * transformer is instantiated at entity-module load, before Nest DI /
 * `ConfigService` exist, so reading keys early would throw. The keys are
 * initialized once at startup (`main.ts` / `data-source.ts`).
 */
export class EncryptedColumnTransformer implements ValueTransformer {
  /** entity → DB: encrypt a present value; pass null/undefined through. */
  to(value?: string | null): string | null | undefined {
    if (value === null || value === undefined) {
      return value;
    }
    return encrypt(value);
  }

  /** DB → entity: decrypt a present envelope; pass null/undefined through. */
  from(value?: string | null): string | null | undefined {
    if (value === null || value === undefined) {
      return value;
    }
    return decrypt(value);
  }
}

/** Shared singleton instance for use in `@Column({ transformer })`. */
export const encryptedColumnTransformer = new EncryptedColumnTransformer();
