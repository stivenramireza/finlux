/**
 * Client-side input validation and `AuthError` → copy mapping.
 *
 * Client validation mirrors the backend policy (Req 2.2) to give fast feedback;
 * the backend remains the authority. The error copy follows the Designer's
 * approved microcopy (Req 7.3) and Decision A (generic for invalid-credentials;
 * specific for duplicate-email; distinct retryable message for network).
 */
import type { AuthError } from './types';

/** Minimal, pragmatic email shape check (backend uses class-validator IsEmail). */
export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 320) {
    return false;
  }
  // Simple RFC-pragmatic check: non-space local @ domain with a dot.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Validates a password against the backend policy (Req 2.2): ≥ 8 chars with at
 * least one uppercase, one lowercase, one digit, and one special character.
 * Returns an error message, or `null` if valid.
 */
export function validatePassword(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include an uppercase letter.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include a lowercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include a digit.';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include a special character.';
  }
  return null;
}

/** Human-readable password policy hint shown under the register password field. */
export const PASSWORD_POLICY_HINT =
  'At least 8 characters, with an uppercase letter, a lowercase letter, a digit, and a special character.';

/**
 * Maps an `AuthError` to form-level copy. Login `401` is a single generic
 * message (no field disclosure, Req 3.4); duplicate-email is specific
 * (Req 2.5); network is distinct and retryable (never "invalid credentials").
 */
export function authErrorToMessage(error: AuthError): string {
  switch (error.kind) {
    case 'invalid-credentials':
      return 'Invalid email or password.';
    case 'duplicate-email':
      return 'That email is already registered. Try logging in instead.';
    case 'validation':
      return error.message ?? 'Please check your details and try again.';
    case 'network':
      return 'Could not reach the server. Check your connection and try again.';
    case 'unknown':
    default:
      return 'Something went wrong. Please try again.';
  }
}
