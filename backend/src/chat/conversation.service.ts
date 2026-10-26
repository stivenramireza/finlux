import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './conversation.entity.js';
import { Message, MessageRole } from './message.entity.js';

/**
 * User-scoped persistence for conversations and their messages. Every read and
 * write is scoped by `userId`, so one user can never reach another user's
 * conversation; a non-owned or missing id is indistinguishable from
 * non-existent (both `NotFoundException` → `404`).
 */
@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messages: Repository<Message>,
  ) {}

  createConversation(
    userId: string,
    title?: string | null,
  ): Promise<Conversation> {
    const conversation = this.conversations.create({
      userId,
      title: title ?? null,
    });
    return this.conversations.save(conversation);
  }

  /** Lists the caller's conversations, most recently updated first. */
  findAll(userId: string): Promise<Conversation[]> {
    return this.conversations.find({
      where: { userId },
      order: { updatedAt: 'DESC', createdAt: 'DESC' },
    });
  }

  async findOneOrFail(userId: string, id: string): Promise<Conversation> {
    const conversation = await this.conversations.findOne({
      where: { id, userId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  /** Appends a message to a conversation (ownership checked by the caller). */
  addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
  ): Promise<Message> {
    const message = this.messages.create({ conversationId, role, content });
    return this.messages.save(message);
  }

  /** Lists a conversation's messages in turn order (ownership checked). */
  async listMessages(
    userId: string,
    conversationId: string,
  ): Promise<Message[]> {
    await this.findOneOrFail(userId, conversationId);
    return this.messages.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Loads the last `limit` messages of a conversation (ownership checked),
   * returned in chronological order for use as agent context.
   */
  async loadRecentContext(
    userId: string,
    conversationId: string,
    limit: number,
  ): Promise<Message[]> {
    await this.findOneOrFail(userId, conversationId);
    const recent = await this.messages.find({
      where: { conversationId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return recent.reverse();
  }

  /** Touches `updatedAt` so a conversation sorts to the top after a new turn. */
  async touch(conversationId: string): Promise<void> {
    await this.conversations.update(
      { id: conversationId },
      { updatedAt: new Date() },
    );
  }
}
