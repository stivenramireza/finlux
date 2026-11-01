import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

/**
 * A single past-password record for the no-reuse rule (password-history spec).
 *
 * The table (`password_history`) stores ONLY a bcrypt hash of a previously-used
 * password — never plaintext — together with the owning user and a creation
 * timestamp. Rows are immutable (no `updated_at`): a set-password event inserts
 * a new row and prunes older ones beyond the configured depth N.
 *
 * The current password lives here too (as the most recent row), so the
 * effective N-window is read solely from this table
 * (`ORDER BY created_at DESC LIMIT N`). The hash is NOT `select: false` — it is
 * never exposed through any API, but the service must read it to bcrypt-compare
 * a candidate against it.
 */
@Entity({ name: 'password_history' })
@Index('idx_password_history_user_id_created_at', ['userId', 'createdAt'])
export class PasswordHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  /** bcrypt hash of a past password (never plaintext). */
  @Column({ type: 'varchar', name: 'password_hash' })
  passwordHash: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;
}
