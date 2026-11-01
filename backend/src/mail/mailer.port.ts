/** Supported locales for outbound email copy. Spanish is the product default. */
export type MailLocale = 'es' | 'en';

/** Arguments for the password-reset email. */
export interface SendPasswordResetEmailArgs {
  /** Decrypted recipient address (the located user's email). */
  to: string;
  /** Fully-built reset link (APP_BASE_URL + /reset-password?token=...). */
  resetUrl: string;
  /** Language for the email copy; defaults to Spanish when unset. */
  locale?: MailLocale;
}

/**
 * Provider-agnostic outbound-email port. Implemented by `ResendMailer` in
 * production and by a fake in tests, so the email provider is never exercised
 * in CI. Implementations MUST NOT log the reset token/link or create a
 * plaintext PII record of the recipient.
 */
export interface MailerPort {
  sendPasswordResetEmail(args: SendPasswordResetEmailArgs): Promise<void>;
}

/** DI token for {@link MailerPort}. */
export const MAILER = Symbol('MAILER');
