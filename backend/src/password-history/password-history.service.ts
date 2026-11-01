import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { HashingService } from '../auth/hashing/hashing.service.js';
import { PasswordHistory } from './entities/password-history.entity.js';

/** Default history depth when `PASSWORD_HISTORY_DEPTH` is unset. */
const DEFAULT_DEPTH = 5;

/**
 * User-facing reason shown ONLY after a valid reset token (post-token step),
 * distinct from the generic invalid/expired/used-token message so the user
 * understands how to proceed. Carries no sensitive detail (no hash, no past
 * value) — Requirement 5.2 / 6.3.
 */
export const PASSWORD_REUSE_MESSAGE =
  "You've used this password before — please choose a new one.";

/**
 * The no-reuse rule for passwords (password-history spec). Keeps a per-user
 * history of bcrypt hashes (never plaintext) and rejects a candidate that
 * matches any of the last N (including the current password, which lives here
 * as the most recent row). Injects ONLY its repository + `HashingService` +
 * `ConfigService` — never `UsersService` — to avoid module cycles.
 */
@Injectable()
export class PasswordHistoryService {
  /** Configured history depth N, clamped to >= 1. */
  private readonly depth: number;

  constructor(
    @InjectRepository(PasswordHistory)
    private readonly history: Repository<PasswordHistory>,
    private readonly hashingService: HashingService,
    private readonly configService: ConfigService,
  ) {
    const configured = this.configService.get<string | number>(
      'PASSWORD_HISTORY_DEPTH',
    );
    const parsed =
      configured === undefined ? NaN : Number.parseInt(String(configured), 10);
    this.depth =
      Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_DEPTH;
  }

  /**
   * Rejects a candidate new password that matches any of the user's last N
   * passwords (the current one plus the most recent prior ones). Loads the N
   * most recent hashes (current first) and bcrypt-compares with a SHORT-CIRCUIT
   * — stopping at the first match — so at most the compares needed are run. On
   * a match throws a `BadRequestException` carrying the distinctive reuse
   * message. A no-op when the history is empty (e.g. at registration).
   *
   * Only hashes are read; the plaintext is never logged.
   */
  async assertNotReused(userId: string, plaintext: string): Promise<void> {
    const recent = await this.history.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: this.depth,
    });

    for (const entry of recent) {
      // Short-circuit at the first match (current-most-recent first).
      if (await this.hashingService.compare(plaintext, entry.passwordHash)) {
        throw new BadRequestException(PASSWORD_REUSE_MESSAGE);
      }
    }
  }

  /**
   * Records a new password hash for the user and prunes the history to the N
   * most recent rows (delete-on-insert). Accepts an optional `EntityManager` so
   * the caller can run the insert + prune inside its own transaction (e.g. the
   * atomic register seed or the reset-confirm update). Stores only the hash —
   * never plaintext.
   */
  async record(
    userId: string,
    passwordHash: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(PasswordHistory)
      : this.history;

    await repo.insert({ userId, passwordHash });

    // Prune: keep only the N most recent rows for this user. The subquery picks
    // the survivors; everything else for the user is deleted. Parameterized —
    // no string-interpolated SQL.
    await repo
      .createQueryBuilder()
      .delete()
      .from(PasswordHistory)
      .where('user_id = :userId', { userId })
      .andWhere(
        `id NOT IN (
          SELECT ph.id FROM password_history ph
          WHERE ph.user_id = :userId
          ORDER BY ph.created_at DESC
          LIMIT :depth
        )`,
        { userId, depth: this.depth },
      )
      .execute();
  }
}
