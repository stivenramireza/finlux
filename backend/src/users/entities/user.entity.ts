import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { encryptedColumnTransformer } from '../../crypto/encrypted-column.transformer.js';
import { Transaction } from '../../transactions/entities/transaction.entity.js';

/**
 * A Finlux user: the identity that anchors and isolates all financial data.
 *
 * This spec owns the base `users` table (identity + ownership only).
 * Credential/session columns are added additively by the `user-authentication`
 * spec via its own migration on the same table.
 *
 * PII encryption at rest: `email` and `displayName` are stored encrypted
 * (transparent AES-256-GCM via the transformer) and are therefore NOT unique or
 * searchable in SQL. Uniqueness and login lookup move to the deterministic
 * `emailBidx` blind index (`email_bidx`), which carries the unique constraint.
 */
@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * The user's email, stored ENCRYPTED at rest (ciphertext envelope). No longer
   * unique at the column level — uniqueness is enforced on {@link emailBidx}.
   */
  @Column({ type: 'varchar', transformer: encryptedColumnTransformer })
  email: string;

  /**
   * Deterministic, keyed HMAC of the normalized email (lowercase hex). Used to
   * look up a user by email and to enforce uniqueness without storing the
   * plaintext email. NO transformer (the HMAC is stored as-is).
   */
  @Column({ type: 'varchar', name: 'email_bidx', unique: true })
  emailBidx: string;

  /** Optional friendly name, stored ENCRYPTED at rest. */
  @Column({
    type: 'varchar',
    name: 'display_name',
    nullable: true,
    transformer: encryptedColumnTransformer,
  })
  displayName: string | null;

  /**
   * bcrypt hash of the user's password (never plaintext). Added by the
   * `user-authentication` spec. Mapped with `select: false` so it is never
   * returned or serialized unless a query explicitly selects it.
   */
  @Column({ type: 'varchar', select: false })
  password: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Transaction, (transaction) => transaction.user)
  transactions: Relation<Transaction>[];
}
