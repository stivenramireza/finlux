import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AccessToken } from '../auth/decorators/access-token.decorator.js';
import { ChatService } from './chat.service.js';
import type {
  SendMessageResult,
  StartConversationResult,
} from './chat.service.js';
import { ConversationService } from './conversation.service.js';
import type { Conversation } from './conversation.entity.js';
import type { Message } from './message.entity.js';
import { StartConversationDto } from './dto/start-conversation.dto.js';
import { SendMessageDto } from './dto/send-message.dto.js';

/**
 * Authenticated conversational-agent surface. Every handler is scoped to the
 * caller's `userId` (resolved from the JWT via `@CurrentUser('userId')`, never
 * from the body/query/path) and routes through the user-scoped services. The
 * `:id` param is validated as a v4 uuid, so a malformed id is `400` before any
 * service runs; a well-formed but non-owned id is `404`.
 */
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly conversationService: ConversationService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  startConversation(
    @CurrentUser('userId') userId: string,
    @AccessToken() accessToken: string,
    @Body() dto: StartConversationDto,
  ): Promise<StartConversationResult> {
    return this.chatService.startConversation(
      userId,
      accessToken,
      dto.message,
      dto.title,
    );
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  sendMessage(
    @CurrentUser('userId') userId: string,
    @AccessToken() accessToken: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: SendMessageDto,
  ): Promise<SendMessageResult> {
    return this.chatService.sendMessage(userId, accessToken, id, dto.message);
  }

  @Get()
  findAll(@CurrentUser('userId') userId: string): Promise<Conversation[]> {
    return this.conversationService.findAll(userId);
  }

  @Get(':id/messages')
  listMessages(
    @CurrentUser('userId') userId: string,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<Message[]> {
    return this.conversationService.listMessages(userId, id);
  }
}
