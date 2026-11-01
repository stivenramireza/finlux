import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../../users/entities/user.entity.js';

/**
 * A single-use, time-limited password-reset token (password-reset spec).
 *
 * Only a non-reversible SHA-256 hash of the raw token is stored (never the raw
 * token itself), mirroring how the `sessions` table stores a hashed JWT. The
 * raw token travels to the user only inside the reset link. A token is valid
 * iff `used_at IS NULL AND expires_at > now()`. Requesting a new reset
 * supersedes any outstanding token for the same user (≤1 live token/account).
 */
@Entity({ name: 'password_reset_tokens' })
@Index('idx_password_reset_tokens_user_id', ['userId'])
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  /** SHA-256 hex digest of the raw reset token (never the raw token). */
  @Column({ type: 'varchar', name: 'token_hash', unique: true })
  tokenHash: string;

  /** When the token expires (issue time + configured lifetime, 5 minutes). */
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

  /** Set when the token is consumed; null while the token is still usable. */
  @Column({ type: 'timestamptz', name: 'used_at', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;
}
