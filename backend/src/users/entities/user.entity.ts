import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Transaction } from '../../transactions/entities/transaction.entity.js';

/**
 * A Finlux user: the identity that anchors and isolates all financial data.
 *
 * This spec owns the base `user` table (identity + ownership only).
 * Credential/session columns are added additively by the `user-authentication`
 * spec via its own migration on the same table.
 */
@Entity({ name: 'user' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar', name: 'display_name', nullable: true })
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
