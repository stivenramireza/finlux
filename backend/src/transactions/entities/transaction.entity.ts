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
import { columnNumericTransformer } from '../../database/column-numeric.transformer.js';
import { User } from '../../users/entities/user.entity.js';

/** Closed domain of transaction kinds. */
export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

/** Closed set of supported ISO 4217 currency codes. */
export enum TransactionCurrency {
  COP = 'COP',
  USD = 'USD',
}

/**
 * A single recorded income or expense. Amounts are stored as a precise
 * `numeric(19,4)` decimal (never a float) and exposed as a decimal string via
 * the numeric transformer.
 */
@Entity({ name: 'transactions' })
@Index('idx_transactions_user_id_date', ['userId', 'date'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

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

  @Column({
    type: 'enum',
    enum: TransactionType,
    enumName: 'transaction_type',
  })
  type: TransactionType;

  /** Supported ISO 4217 currency code (closed enum: COP | USD). */
  @Column({
    type: 'enum',
    enum: TransactionCurrency,
    enumName: 'transaction_currency',
  })
  currency: TransactionCurrency;

  /** Calendar day the money moved (no time-of-day). */
  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.transactions, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;
}
