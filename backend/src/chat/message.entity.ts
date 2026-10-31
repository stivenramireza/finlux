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
import { encryptedColumnTransformer } from '../crypto/encrypted-column.transformer.js';
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
@Entity({ name: 'messages' })
@Index('idx_messages_conversation_id_created_at', [
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

  /**
   * The turn text. Treated as sensitive PII; stored ENCRYPTED at rest
   * (transparent AES-256-GCM) and never logged. The column stays `text` and now
   * holds the ciphertext envelope.
   */
  @Column({ type: 'text', transformer: encryptedColumnTransformer })
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
