import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AGENT_RUNNER } from '../agent/agent-runner.js';
import type { AgentMessage, AgentRunner } from '../agent/agent-runner.js';
import { ConversationService } from './conversation.service.js';
import { Conversation } from './conversation.entity.js';
import { Message, MessageRole } from './message.entity.js';

const DEFAULT_CONTEXT_MAX_MESSAGES = 20;

/** Result of starting a conversation: the conversation and its first turn. */
export interface StartConversationResult {
  conversation: Conversation;
  messages: Message[];
}

/** Result of continuing a conversation: the user + agent messages of the turn. */
export interface SendMessageResult {
  messages: Message[];
}

/**
 * Orchestrates a single chat turn. Loads/owns the conversation (or creates one),
 * assembles the last-N messages plus the new user message as agent context,
 * runs the agent, and persists the user + agent messages TOGETHER only after a
 * successful generate — so a failed turn leaves the conversation unchanged.
 *
 * Ownership is always the authenticated `userId` (passed by the controller from
 * `@CurrentUser('userId')`), never from the body/query/path.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly contextMaxMessages: number;

  constructor(
    private readonly conversationService: ConversationService,
    private readonly configService: ConfigService,
    @Inject(AGENT_RUNNER) private readonly agentRunner: AgentRunner,
  ) {
    const configured = Number(
      this.configService.get<string>('AGENT_CONTEXT_MAX_MESSAGES'),
    );
    this.contextMaxMessages =
      Number.isInteger(configured) && configured > 0
        ? configured
        : DEFAULT_CONTEXT_MAX_MESSAGES;
  }

  /** Starts a new conversation owned by the caller and runs the first turn. */
  async startConversation(
    userId: string,
    accessToken: string,
    message: string,
    title?: string,
  ): Promise<StartConversationResult> {
    const conversation = await this.conversationService.createConversation(
      userId,
      title ?? null,
    );
    const messages = await this.runTurn(
      userId,
      accessToken,
      conversation.id,
      message,
      [],
    );
    return { conversation, messages };
  }

  /** Appends a turn to an existing conversation the caller owns. */
  async sendMessage(
    userId: string,
    accessToken: string,
    conversationId: string,
    message: string,
  ): Promise<SendMessageResult> {
    // Ownership check (throws 404 if not owned/missing) + context load.
    const prior = await this.conversationService.loadRecentContext(
      userId,
      conversationId,
      this.contextMaxMessages,
    );
    const context: AgentMessage[] = prior.map((m) => ({
      role: m.role === MessageRole.AGENT ? 'assistant' : 'user',
      content: m.content,
    }));
    const messages = await this.runTurn(
      userId,
      accessToken,
      conversationId,
      message,
      context,
    );
    return { messages };
  }

  /**
   * Runs the agent for one user message and, on success, persists the user and
   * agent messages together. A provider failure/timeout is mapped to a safe
   * `502` and nothing is persisted (the conversation stays unchanged).
   */
  private async runTurn(
    userId: string,
    accessToken: string,
    conversationId: string,
    userMessage: string,
    priorContext: AgentMessage[],
  ): Promise<Message[]> {
    const agentMessages: AgentMessage[] = [
      ...priorContext,
      { role: 'user', content: userMessage },
    ];

    let reply: string;
    try {
      const result = await this.agentRunner.runTurn(
        userId,
        accessToken,
        agentMessages,
      );
      reply = result.text;
    } catch {
      // Do not persist anything on a failed turn; surface a generic 502.
      this.logger.error('Agent generate failed; turn not persisted');
      throw new BadGatewayException('The agent is temporarily unavailable');
    }

    // Persist both turns only after a successful generate.
    const userRow = await this.conversationService.addMessage(
      conversationId,
      MessageRole.USER,
      userMessage,
    );
    const agentRow = await this.conversationService.addMessage(
      conversationId,
      MessageRole.AGENT,
      reply,
    );
    await this.conversationService.touch(conversationId);
    return [userRow, agentRow];
  }
}
