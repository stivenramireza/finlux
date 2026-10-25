import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Session } from './entities/session.entity.js';

/**
 * Records audit rows for issued login sessions. The table is audit-only; it is
 * never consulted to authorize requests (token validity is stateless).
 */
@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private readonly sessions: Repository<Session>,
  ) {}

  /**
   * Inserts an audit row for a freshly issued JWT. Stores the SHA-256 hash of
   * the token (never the raw token) alongside its expiry.
   */
  record(userId: string, rawToken: string, expiresAt: Date): Promise<Session> {
    const session = this.sessions.create({
      userId,
      token: SessionService.hashToken(rawToken),
      expiresAt,
    });
    return this.sessions.save(session);
  }

  /** Computes the SHA-256 hex digest of a raw JWT. */
  static hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
