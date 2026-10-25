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
}
