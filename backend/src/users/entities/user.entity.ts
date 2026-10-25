import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { Account } from '../../accounts/entities/account.entity.js';
import { Category } from '../../categories/entities/category.entity.js';
import { Transaction } from '../../transactions/entities/transaction.entity.js';

/**
 * A Finlux user: the identity that anchors and isolates all financial data.
 *
 * This spec owns the base `users` table (identity + ownership only).
 * Credential/session columns are added additively by the `user-authentication`
 * spec via its own migration on the same table.
 */
@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar', name: 'display_name', nullable: true })
  displayName: string | null;

  /** ISO 4217 currency code (e.g. "COP", "USD"). */
  @Column({ type: 'char', length: 3, name: 'default_currency' })
  defaultCurrency: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => Account, (account) => account.user)
  accounts: Relation<Account>[];

  @OneToMany(() => Category, (category) => category.user)
  categories: Relation<Category>[];

  @OneToMany(() => Transaction, (transaction) => transaction.user)
  transactions: Relation<Transaction>[];
}
