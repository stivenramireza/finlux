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
import { User } from '../../users/entities/user.entity.js';

/**
 * Audit record of an issued login session (user-authentication spec).
 *
 * The table is singular (`session`) and audit-only: it records who logged in
 * and when the token expires. The auth guard does NOT read it — token validity
 * is determined statelessly from the JWT signature + expiry. The `token` column
 * stores a SHA-256 hash of the issued JWT, never the raw token.
 */
@Entity({ name: 'session' })
@Index('idx_session_user_id', ['userId'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  /** SHA-256 hash of the issued JWT (never the raw token). */
  @Column({ type: 'varchar' })
  token: string;

  /** When the session's token expires (login time + JWT lifetime). */
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt: Date;

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
