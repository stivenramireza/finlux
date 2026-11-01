import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CryptoService } from '../../crypto/crypto.service.js';
import { UsersService } from '../../users/users.service.js';
import { PasswordHistoryService } from '../../password-history/password-history.service.js';
import { HashingService } from '../hashing/hashing.service.js';
import {
  MAILER,
  type MailLocale,
  type MailerPort,
} from '../../mail/mailer.port.js';
import { PasswordResetToken } from './entities/password-reset-token.entity.js';

/** Defaults (overridable via env, by key name). */
const DEFAULT_TOKEN_TTL = '5m';
const DEFAULT_REQUEST_COOLDOWN = '60s';
const DEFAULT_APP_BASE_URL = 'http://localhost:3000';
/** Raw-token entropy: 32 bytes → base64url (Requirement 3.1). */
const TOKEN_BYTES = 32;

/**
 * Parses a short duration string (`5m`, `60s`, `1h`, or a bare number of
 * seconds) into milliseconds. Falls back to {@link fallbackMs} on malformed
 * input so a misconfiguration never silently disables expiry/cooldown.
 */
export function parseDurationMs(
  value: string | undefined,
  fallbackMs: number,
): number {
  if (!value) {
    return fallbackMs;
  }
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(value.trim());
  if (!match) {
    return fallbackMs;
  }
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2] ?? 's';
  const unitMs: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * unitMs[unit];
}

/**
 * Forgot-password flows for the unauthenticated user. Only a non-reversible
 * hash of the reset token is persisted; the raw token travels only in the reset
 * link. The request step is non-disclosing (uniform response, no token/send for
 * unknown emails, email dispatched after the response commits). The confirm
 * step is single-use (atomic consume) and maps every token/password failure to
 * a generic `400`.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly tokenTtlMs: number;
  private readonly cooldownMs: number;
  private readonly appBaseUrl: string;

  constructor(
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly hashingService: HashingService,
    private readonly crypto: CryptoService,
    private readonly configService: ConfigService,
    @Inject(MAILER) private readonly mailer: MailerPort,
    private readonly passwordHistory: PasswordHistoryService,
  ) {
    this.tokenTtlMs = parseDurationMs(
      this.configService.get<string>('PASSWORD_RESET_TOKEN_TTL'),
      parseDurationMs(DEFAULT_TOKEN_TTL, 5 * 60 * 1000),
    );
    this.cooldownMs = parseDurationMs(
      this.configService.get<string>('PASSWORD_RESET_REQUEST_COOLDOWN'),
      parseDurationMs(DEFAULT_REQUEST_COOLDOWN, 60 * 1000),
    );
    this.appBaseUrl =
      this.configService.get<string>('APP_BASE_URL') ?? DEFAULT_APP_BASE_URL;
  }

  /** SHA-256 hex of a raw token (mirrors how `sessions` hashes the JWT). */
  private static hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Starts a password-reset request. Always resolves (the caller returns a
   * uniform non-disclosing response regardless of the outcome here):
   *  - unknown email → no token created, no email sent;
   *  - within the per-account cooldown → no new token/send;
   *  - otherwise → supersede outstanding tokens and insert a fresh single-use
   *    token in one transaction, then dispatch the email AFTER the HTTP
   *    response is committed (fire-and-forget) so timing doesn't disclose
   *    existence.
   */
  async request(email: string, locale?: MailLocale): Promise<void> {
    const normalized = this.crypto.normalizeEmail(email);
    const user = await this.usersService.findByEmail(normalized);
    if (!user) {
      // Non-existent account: no token, no email (Requirement 2.2).
      return;
    }

    const repo = this.dataSource.getRepository(PasswordResetToken);

    // Per-account cooldown: suppress a rapid second request (abuse / quota),
    // without disclosing anything (the caller's response is unchanged).
    if (this.cooldownMs > 0) {
      const since = new Date(Date.now() - this.cooldownMs);
      const recent = await repo
        .createQueryBuilder('t')
        .where('t.user_id = :userId', { userId: user.id })
        .andWhere('t.created_at > :since', { since })
        .getCount();
      if (recent > 0) {
        return;
      }
    }

    const rawToken = randomBytes(TOKEN_BYTES).toString('base64url');
    const tokenHash = PasswordResetService.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.tokenTtlMs);

    // Single transaction: invalidate any outstanding tokens for this user, then
    // insert the new one, so at most one live token per account exists.
    await this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(PasswordResetToken);
      await txRepo
        .createQueryBuilder()
        .update(PasswordResetToken)
        .set({ usedAt: () => 'now()' })
        .where('user_id = :userId', { userId: user.id })
        .andWhere('used_at IS NULL')
        .execute();
      await txRepo.insert({
        userId: user.id,
        tokenHash,
        expiresAt,
        usedAt: null,
      });
    });

    // The recipient address exists only after decrypting the located row.
    const to = user.email;
    const resetUrl = this.buildResetUrl(rawToken);

    // Dispatch AFTER the response is committed so the variable-latency send
    // never leaks existence via timing. Failures are logged generically.
    this.dispatchEmailAfterResponse({ to, resetUrl, locale });
  }

  /**
   * Completes a reset. Order (password-history Decision 1):
   *  (a) look up the token by its SHA-256 hash;
   *  (b) read-only validity check (does NOT consume): unknown/expired/used →
   *      generic `400`, indistinguishable from each other as before;
   *  (c) reuse check BEFORE consuming — if the new password matches one of the
   *      user's last N, throw a `400` with the distinctive reuse message; the
   *      token stays live so the user can retry a different password on the same
   *      link (the token is not burned on a reuse rejection);
   *  (d) atomic, anti-race consume (`used_at NULL → now()`) — the serialization
   *      point; a lost race → generic `400`;
   *  (e) in one transaction, update the password AND record the new hash in the
   *      history (insert + prune).
   * No session is issued (Requirement 4.5).
   */
  async confirm(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = PasswordResetService.hashToken(rawToken);
    const repo = this.dataSource.getRepository(PasswordResetToken);

    // (a) + (b) look up and validate WITHOUT consuming.
    const token = await repo.findOne({ where: { tokenHash } });
    if (
      !token ||
      token.usedAt !== null ||
      token.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // (c) reuse check before consuming the token. On reuse this throws a 400
    // with the distinctive message and leaves the token live for a retry.
    await this.passwordHistory.assertNotReused(token.userId, newPassword);

    // (d) atomic, anti-race consume: only one caller flips used_at from NULL.
    const consume = await repo
      .createQueryBuilder()
      .update(PasswordResetToken)
      .set({ usedAt: () => 'now()' })
      .where('id = :id', { id: token.id })
      .andWhere('used_at IS NULL')
      .execute();
    if (!consume.affected || consume.affected < 1) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Policy is enforced by the DTO; hash and store (never log the plaintext).
    const passwordHash = await this.hashingService.hash(newPassword);

    // (e) update the password and record the new hash in one transaction, so
    // users.password and the newest history row are written atomically.
    await this.dataSource.transaction(async (manager) => {
      await this.usersService.updatePassword(
        token.userId,
        passwordHash,
        manager,
      );
      await this.passwordHistory.record(token.userId, passwordHash, manager);
    });
  }

  /** Builds the reset link from APP_BASE_URL + /reset-password?token=<raw>. */
  private buildResetUrl(rawToken: string): string {
    const base = this.appBaseUrl.replace(/\/+$/, '');
    return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
  }

  /**
   * Fire-and-forget email dispatch. Kept as a separate method (not awaited by
   * `request`) so the HTTP response is not blocked on the provider call; send
   * failures are logged without PII and never change the caller's response.
   */
  private dispatchEmailAfterResponse(args: {
    to: string;
    resetUrl: string;
    locale?: MailLocale;
  }): void {
    void this.mailer.sendPasswordResetEmail(args).catch(() => {
      // Generic: no recipient, no link/token, no provider internals.
      this.logger.error('Password-reset email dispatch failed.');
    });
  }
}
