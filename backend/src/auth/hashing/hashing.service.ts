import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

const DEFAULT_SALT_ROUNDS = 12;

/**
 * Wraps bcrypt for password hashing. The cost factor is read from
 * `BCRYPT_SALT_ROUNDS` (defaults to 12). bcrypt embeds a per-hash salt, so
 * identical passwords produce different hashes. Plaintext is never logged.
 */
@Injectable()
export class HashingService {
  private readonly saltRounds: number;

  /**
   * A dummy bcrypt hash generated once (lazily) at the configured `saltRounds`.
   * Used by `compareWithDummy` so a failed-login path with no matching user
   * still performs an equivalent, constant-cost bcrypt compare — closing the
   * timing side-channel that would otherwise reveal whether an email exists.
   * Generated at the same cost as real hashes so the timing tracks config even
   * when `BCRYPT_SALT_ROUNDS` is overridden.
   */
  private dummyHash?: Promise<string>;

  constructor(private readonly configService: ConfigService) {
    const configured = this.configService.get<string | number>(
      'BCRYPT_SALT_ROUNDS',
    );
    const parsed =
      configured === undefined ? NaN : Number.parseInt(String(configured), 10);
    this.saltRounds =
      Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SALT_ROUNDS;
  }

  /** Hashes a plaintext password into a salted bcrypt hash. */
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.saltRounds);
  }

  /** Verifies a plaintext password against a bcrypt hash. */
  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }

  /**
   * Compares `plain` against a dummy hash generated at the configured cost.
   * Always resolves to `false` (the dummy value is never a valid password), but
   * does the genuine bcrypt work so a caller can spend the same time as a real
   * `compare` when no user was found — defeating an account-enumeration timing
   * oracle. The dummy hash is created once and reused across calls (no
   * per-call `bcrypt.hash`). The plaintext and the dummy are never logged.
   */
  async compareWithDummy(plain: string): Promise<boolean> {
    if (!this.dummyHash) {
      // A fixed, non-secret sentinel; its value is irrelevant since the compare
      // always fails. Hashed once at `saltRounds` so cost tracks configuration.
      this.dummyHash = bcrypt.hash('finlux-dummy-password', this.saltRounds);
    }
    return bcrypt.compare(plain, await this.dummyHash);
  }
}
