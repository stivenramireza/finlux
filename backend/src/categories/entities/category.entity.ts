import {
  Column,
  CreateDateColumn,
  Entity,
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
 * Classifies transactions. A category is either a system seed category
 * (shared/global, `userId` null) or a user-owned category (`userId` set).
 *
 * Uniqueness is enforced by partial unique indexes defined in the migration:
 *   - one global name: UNIQUE (name) WHERE user_id IS NULL
 *   - one name per user: UNIQUE (user_id, name) WHERE user_id IS NOT NULL
 */
@Entity({ name: 'categories' })
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** `null` = system/global seed; non-null = user-owned. */
  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar' })
  name: string;

  /** Optional hint (e.g. "income" / "expense"). */
  @Column({ type: 'varchar', nullable: true })
  kind: string | null;

  /** Optional UI hint. */
  @Column({ type: 'varchar', nullable: true })
  icon: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.categories, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User> | null;

  @OneToMany(() => Transaction, (transaction) => transaction.category)
  transactions: Relation<Transaction>[];
}
