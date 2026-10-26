import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentModule } from '../agent/agent.module.js';
import { Conversation } from './conversation.entity.js';
import { Message } from './message.entity.js';
import { ConversationService } from './conversation.service.js';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';

/**
 * Wires the chat/agent HTTP layer: the conversation/message persistence, the
 * turn orchestration (`ChatService`), and the controller. Imports `AgentModule`
 * for the `AGENT_RUNNER` port and `ConfigModule` for the context-window bound.
 */
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Conversation, Message]),
    AgentModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ConversationService],
})
export class ChatModule {}
