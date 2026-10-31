import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { getKeys } from './crypto-keys.js';

/**
 * Framework-free primitives for application-level, at-rest PII encryption.
 *
 * - {@link encrypt} / {@link decrypt}: AES-256-GCM authenticated encryption with
 *   a fresh random IV per value, serialized into a single self-describing
 *   envelope string.
 * - {@link blindIndex}: a deterministic keyed HMAC used to look up / enforce
 *   uniqueness of the email without storing it in the clear.
 * - {@link normalizeEmail}: the single source of truth for email normalization
 *   (trim + lowercase) shared by auth and the blind index.
 *
 * Security: this module never logs plaintext, keys, or envelopes.
 */

/** Envelope version tag; reserved for forward-compat (rotation is out of scope). */
const VERSION = 'v1';
/** AES-GCM standard nonce size. */
const IV_BYTES = 12;
/** AES-GCM authentication tag size. */
const TAG_BYTES = 16;

/**
 * Encrypts a plaintext string with AES-256-GCM and returns the envelope
 * `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>` (standard base64). A fresh random
 * 12-byte IV is generated per call, so equal plaintext yields different
 * ciphertext (randomized encryption).
 */
export function encrypt(plaintext: string): string {
  const { encryptionKey } = getKeys();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${tag.toString(
    'base64',
  )}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypts an envelope produced by {@link encrypt}. Throws on an unrecognized
 * version prefix, a malformed shape, or a failed GCM authentication tag (so
 * tampered ciphertext is rejected rather than returned corrupted).
 */
export function decrypt(envelope: string): string {
  const parts = envelope.split(':');
  if (parts.length !== 4) {
    throw new Error('Invalid ciphertext envelope: expected 4 parts.');
  }
  const [version, ivB64, tagB64, ciphertextB64] = parts;
  if (version !== VERSION) {
    throw new Error(
      `Invalid ciphertext envelope: unsupported version "${version}".`,
    );
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  if (iv.length !== IV_BYTES) {
    throw new Error('Invalid ciphertext envelope: bad IV length.');
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error('Invalid ciphertext envelope: bad auth tag length.');
  }

  const { encryptionKey } = getKeys();
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(tag);
  // `final()` throws if the auth tag does not verify (tamper detection).
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/**
 * Computes the deterministic email blind index: a lowercase-hex HMAC-SHA-256 of
 * the already-normalized value, keyed with the separate blind-index key. Equal
 * normalized emails always yield the same index (enabling a unique constraint
 * and login lookup) without revealing the plaintext.
 */
export function blindIndex(normalized: string): string {
  const { emailBidxKey } = getKeys();
  return createHmac('sha256', emailBidxKey).update(normalized).digest('hex');
}

/** Normalizes an email for storage/lookup: trim + lowercase. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
