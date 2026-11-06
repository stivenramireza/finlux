import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource, QueryFailedError } from 'typeorm';
import { CryptoService } from '../crypto/crypto.service.js';
import { UsersService } from '../users/users.service.js';
import type { User } from '../users/entities/user.entity.js';
import { SessionService } from '../session/session.service.js';
import { PasswordHistoryService } from '../password-history/password-history.service.js';
import { HashingService } from './hashing/hashing.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import type { JwtPayload } from './strategies/jwt.strategy.js';

/** Public view of a user (never exposes the password hash). */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Successful-login response: the access token plus the public user. */
export interface LoginResult {
  accessToken: string;
  user: PublicUser;
}

/**
 * Authentication flows: registration (with password policy + hashing) and login
 * (credential verification, JWT issuance, and session audit). Credentials are
 * never logged and the password hash is never returned.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly hashingService: HashingService,
    private readonly jwtService: JwtService,
    private readonly sessionService: SessionService,
    private readonly crypto: CryptoService,
    private readonly dataSource: DataSource,
    private readonly passwordHistory: PasswordHistoryService,
  ) {}

  /**
   * Normalizes an email for storage/lookup (trim + lowercase). Delegates to the
   * crypto module so auth normalization and the blind index never diverge.
   */
  private normalizeEmail(email: string): string {
    return this.crypto.normalizeEmail(email);
  }

  /** Strips the password hash from a user before returning it. */
  private static toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Registers a new user — **non-disclosing** (Requirement 1 / Decision 1). The
   * response is identical whether the email is new or already registered, with
   * no timing side-channel, so the endpoint is not an account-existence oracle.
   *
   * Flow:
   * - Normalize the email and **always** bcrypt-hash the submitted password, so
   *   the work (and timing) is the same regardless of whether the email exists.
   * - If the email is new → create the user and seed the first password-history
   *   row in one transaction.
   * - If the email already exists (pre-check OR the `uq_users_email_bidx`
   *   unique-violation on insert) → create/modify nothing and swallow the
   *   violation; still pay the equivalent bcrypt cost (via `compareWithDummy`)
   *   so the timing matches the created-new path.
   *
   * Returns nothing: the caller/controller emits an identical generic response
   * in both cases, never exposing the created record, its id, or `password`.
   */
  async register(dto: RegisterDto): Promise<void> {
    const email = this.normalizeEmail(dto.email);

    // Hash unconditionally so the created-new and already-registered paths do
    // the same bcrypt work (no timing oracle), before any branching on
    // existence. The password policy is enforced by the DTO/ValidationPipe,
    // identically regardless of email existence.
    const passwordHash = await this.hashingService.hash(dto.password);

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      // Already registered: persist nothing and do not disclose it. Pay an
      // equivalent constant-cost bcrypt compare so the response time matches
      // the create path, then fall through to the generic response.
      await this.hashingService.compareWithDummy(dto.password);
      return;
    }

    try {
      // Atomic: the user row and its first password-history entry are created
      // together. On a unique-violation rollback, no orphan history remains.
      await this.dataSource.transaction(async (manager) => {
        const created = await this.usersService.create(
          {
            email,
            displayName: dto.displayName ?? null,
            password: passwordHash,
          },
          manager,
        );
        await this.passwordHistory.record(created.id, passwordHash, manager);
      });
    } catch (error) {
      // Find-then-create race: the `uq_users_email_bidx` unique constraint is
      // the authoritative guard (it stays for data integrity). Swallow its
      // violation and respond identically to the created-new case — no `409`,
      // no disclosure that the email already exists. Any other error surfaces.
      if (AuthService.isUniqueViolation(error)) {
        return;
      }
      throw error;
    }
  }

  /**
   * Verifies credentials and, on success, signs a 1h JWT and records a session
   * audit row. Any failure (unknown email OR wrong password) yields an identical
   * generic 401 so no field is disclosed (Requirement 3.2). Both branches run
   * an equivalent constant-cost bcrypt compare before returning — on an unknown
   * email against a dummy hash generated at the configured cost — so the
   * response timing does not reveal whether the email is registered (no
   * account-enumeration oracle).
   */
  async login(dto: LoginDto): Promise<LoginResult> {
    const email = this.normalizeEmail(dto.email);

    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user) {
      // Spend the same bcrypt time as the found path so timing is symmetric,
      // then fail with the identical generic 401.
      await this.hashingService.compareWithDummy(dto.password);
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await this.hashingService.compare(
      dto.password,
      user.password,
    );
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = { sub: user.id, email: user.email };
    // Lifetime is configured on JwtModule (JWT_EXPIRES_IN, default 5m); the
    // issued token's `exp` claim is the source of truth for the audit expiry.
    const accessToken = await this.jwtService.signAsync(payload);

    await this.sessionService.record(
      user.id,
      accessToken,
      AuthService.decodeExpiry(this.jwtService, accessToken),
    );

    return { accessToken, user: AuthService.toPublicUser(user) };
  }

  /**
   * Derives the token's expiry (`exp`) as a Date. Falls back to now + 1h if the
   * token somehow lacks an `exp` claim.
   */
  private static decodeExpiry(jwtService: JwtService, token: string): Date {
    const decoded = jwtService.decode<{ exp?: number } | null>(token);
    if (decoded && typeof decoded.exp === 'number') {
      return new Date(decoded.exp * 1000);
    }
    return new Date(Date.now() + 60 * 60 * 1000);
  }

  /**
   * Detects a PostgreSQL unique-constraint violation (SQLSTATE 23505) surfaced
   * by TypeORM, used to map an `email_bidx` collision to a 409.
   */
  private static isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { code?: string }).code === '23505'
    );
  }
}
