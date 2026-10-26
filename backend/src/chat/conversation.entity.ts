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
import { User } from '../users/entities/user.entity.js';
import { Message } from './message.entity.js';

/**
 * A conversation between a user and the Finlux agent. Owned by exactly one user
 * (FK to `user`, cascade on delete) and scoped like all financial data. Holds
 * an ordered set of {@link Message} turns.
 */
@Entity({ name: 'conversation' })
@Index('idx_conversation_user_id', ['userId'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  /** Optional human-readable title (may be derived from the first message). */
  @Column({ type: 'varchar', nullable: true })
  title: string | null;

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

  @OneToMany(() => Message, (message) => message.conversation)
  messages: Relation<Message>[];
}
