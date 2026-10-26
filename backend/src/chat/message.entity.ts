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
import { Conversation } from './conversation.entity.js';

/** Author of a conversation message (closed enum). */
export enum MessageRole {
  USER = 'user',
  AGENT = 'agent',
}

/**
 * A single immutable turn in a {@link Conversation}, authored by the `user` or
 * the `agent`. Turn order is preserved by `createdAt` (and the supporting
 * index). Messages are never updated, so there is no `updated_at`.
 */
@Entity({ name: 'message' })
@Index('idx_message_conversation_id_created_at', [
  'conversationId',
  'createdAt',
])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'conversation_id' })
  conversationId: string;

  @Column({
    type: 'enum',
    enum: MessageRole,
    enumName: 'message_role',
  })
  role: MessageRole;

  /** The turn text. Treated as sensitive PII; never logged. */
  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Relation<Conversation>;
}
