import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';
import { Transaction } from '../../transactions/entities/transaction.entity.js';

/**
 * A user-named financial account/wallet (e.g. "cash", "payroll").
 * Belongs to exactly one user; account names are unique per user.
 */
@Entity({ name: 'accounts' })
@Index('uq_accounts_user_id_name', ['userId', 'name'], { unique: true })
@Index('idx_accounts_user_id', ['userId'])
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ type: 'varchar' })
  name: string;

  /** Optional free/typed classifier (e.g. "cash", "bank"). */
  @Column({ type: 'varchar', nullable: true })
  type: string | null;

  /** ISO 4217; falls back to `User.defaultCurrency` when null. */
  @Column({ type: 'char', length: 3, nullable: true })
  currency: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.accounts, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @OneToMany(() => Transaction, (transaction) => transaction.account)
  transactions: Relation<Transaction>[];
}
