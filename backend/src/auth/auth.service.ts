import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { QueryFailedError } from 'typeorm';
import { CryptoService } from '../crypto/crypto.service.js';
import { UsersService } from '../users/users.service.js';
import type { User } from '../users/entities/user.entity.js';
import { SessionService } from '../session/session.service.js';
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
   * Registers a new user: normalizes the email, rejects duplicates, bcrypt-hashes
   * the password, persists the user, and returns the public view (no password).
   */
  async register(dto: RegisterDto): Promise<PublicUser> {
    const email = this.normalizeEmail(dto.email);

    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.hashingService.hash(dto.password);

    try {
      const user = await this.usersService.create({
        email,
        displayName: dto.displayName ?? null,
        password: passwordHash,
      });
      return AuthService.toPublicUser(user);
    } catch (error) {
      // Defense against the find-then-create race: the unique constraint on
      // `email_bidx` is the authoritative guard. Map its violation to the same
      // 409 as the pre-check (no disclosure of other details).
      if (AuthService.isUniqueViolation(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  /**
   * Verifies credentials and, on success, signs a 1h JWT and records a session
   * audit row. Any failure (unknown email OR wrong password) yields an identical
   * generic 401 so no field is disclosed (Requirement 3.2).
   */
  async login(dto: LoginDto): Promise<LoginResult> {
    const email = this.normalizeEmail(dto.email);

    const user = await this.usersService.findByEmailWithPassword(email);
    if (!user) {
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
    // Lifetime is configured on JwtModule (JWT_EXPIRES_IN, default 1h); the
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
