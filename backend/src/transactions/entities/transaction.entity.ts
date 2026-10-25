import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { columnNumericTransformer } from '../../database/column-numeric.transformer.js';
import { Account } from '../../accounts/entities/account.entity.js';
import { Category } from '../../categories/entities/category.entity.js';
import { User } from '../../users/entities/user.entity.js';

/** Closed domain of transaction kinds. */
export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

/**
 * A single recorded income or expense. Amounts are stored as a precise
 * `numeric(19,4)` decimal (never a float) and exposed as a decimal string via
 * the numeric transformer. Soft-deleted via `deletedAt`.
 */
@Entity({ name: 'transactions' })
@Index('idx_transactions_user_id_date', ['userId', 'date'])
@Index('idx_transactions_user_id_account_id', ['userId', 'accountId'])
@Index('idx_transactions_user_id_category_id', ['userId', 'categoryId'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'uuid', name: 'account_id' })
  accountId: string;

  @Column({ type: 'uuid', name: 'category_id', nullable: true })
  categoryId: string | null;

  /**
   * Monetary amount as a precise decimal. Stored as `numeric(19,4)` and
   * represented as a decimal string in the domain layer (never a JS number).
   */
  @Column({
    type: 'numeric',
    precision: 19,
    scale: 4,
    transformer: columnNumericTransformer,
  })
  amount: string;

  /** ISO 4217 currency code. */
  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
    enumName: 'transaction_type',
  })
  type: TransactionType;

  /** Calendar day the money moved (no time-of-day). */
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => User, (user) => user.transactions, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @ManyToOne(() => Account, (account) => account.transactions, {
    onDelete: 'RESTRICT',
    nullable: false,
  })
  @JoinColumn({ name: 'account_id' })
  account: Relation<Account>;

  @ManyToOne(() => Category, (category) => category.transactions, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'category_id' })
  category: Relation<Category> | null;
}
