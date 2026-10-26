import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadGatewayException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service.js';
import type { ConversationService } from './conversation.service.js';
import { MessageRole } from './message.entity.js';
import type { Message } from './message.entity.js';
import type { Conversation } from './conversation.entity.js';
import type {
  AgentMessage,
  AgentRunResult,
  AgentRunner,
} from '../agent/agent-runner.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'caller-jwt';
const CONV_ID = '33333333-3333-4333-8333-333333333333';

/**
 * A scripted AgentRunner standing in for the model. It records whether a
 * `create-transaction` tool call happened and returns canned text.
 */
class FakeAgentRunner implements AgentRunner {
  constructor(readonly result: AgentRunResult) {}
  lastMessages: AgentMessage[] = [];
  runTurn = vi.fn(
    (
      _userId: string,
      _accessToken: string,
      messages: AgentMessage[],
    ): Promise<AgentRunResult> => {
      this.lastMessages = messages;
      return Promise.resolve(this.result);
    },
  );
}

class FailingAgentRunner implements AgentRunner {
  runTurn = vi.fn((): Promise<AgentRunResult> => {
    return Promise.reject(new Error('provider timeout'));
  });
}

function makeConversationService() {
  const saved: Message[] = [];
  const service = {
    createConversation: vi.fn((userId: string): Promise<Conversation> =>
      Promise.resolve({ id: CONV_ID, userId, title: null } as Conversation),
    ),
    loadRecentContext: vi.fn((): Promise<Message[]> => Promise.resolve([])),
    addMessage: vi.fn(
      (
        conversationId: string,
        role: MessageRole,
        content: string,
      ): Promise<Message> => {
        const row = {
          id: `m${saved.length}`,
          conversationId,
          role,
          content,
        } as Message;
        saved.push(row);
        return Promise.resolve(row);
      },
    ),
    touch: vi.fn((): Promise<void> => Promise.resolve()),
    findAll: vi.fn(),
    findOneOrFail: vi.fn(),
    listMessages: vi.fn(),
    savedRows: saved,
  };
  return service;
}

const config = {
  get: (key: string) =>
    key === 'AGENT_CONTEXT_MAX_MESSAGES' ? '20' : undefined,
} as unknown as ConfigService;

describe('ChatService capture flow', () => {
  let conversations: ReturnType<typeof makeConversationService>;

  beforeEach(() => {
    conversations = makeConversationService();
  });

  function buildService(runner: AgentRunner): ChatService {
    return new ChatService(
      conversations as unknown as ConversationService,
      config,
      runner,
    );
  }

  it('describe-only turn performs ZERO create calls and persists user+agent turns', async () => {
    const runner = new FakeAgentRunner({
      text: 'Here is the draft: 20.00 COP expense (food). Reply "confirm" to save.',
      toolCalls: [], // describe-only: no create
    });
    const service = buildService(runner);

    const result = await service.startConversation(
      USER_ID,
      TOKEN,
      'I spent 20 on lunch today',
    );

    // The agent ran exactly one turn.
    expect(runner.runTurn).toHaveBeenCalledTimes(1);
    // No create tool call was emitted.
    expect(runner.runTurn).toHaveBeenCalledWith(
      USER_ID,
      TOKEN,
      expect.any(Array),
    );
    const toolNames = runner.result.toolCalls.map((t) => t.toolName);
    expect(toolNames).not.toContain('create-transaction');
    // Both turns persisted after success.
    expect(conversations.addMessage).toHaveBeenCalledTimes(2);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe(MessageRole.USER);
    expect(result.messages[1].role).toBe(MessageRole.AGENT);
  });

  it('explicit confirm turn triggers exactly one create tool call', async () => {
    const runner = new FakeAgentRunner({
      text: 'Saved your expense of 20.00 COP (food).',
      toolCalls: [
        { toolName: 'create-transaction', args: { amount: '20.00' } },
      ],
    });
    const service = buildService(runner);

    await service.sendMessage(USER_ID, TOKEN, CONV_ID, 'confirm');

    const creates = runner.result.toolCalls.filter(
      (t) => t.toolName === 'create-transaction',
    );
    expect(creates).toHaveLength(1);
    expect(conversations.loadRecentContext).toHaveBeenCalledWith(
      USER_ID,
      CONV_ID,
      20,
    );
  });

  it('a declining turn writes no transaction (no create tool call)', async () => {
    const runner = new FakeAgentRunner({
      text: 'Okay, I discarded that draft. Nothing was saved.',
      toolCalls: [],
    });
    const service = buildService(runner);
    await service.sendMessage(USER_ID, TOKEN, CONV_ID, 'no, cancel it');
    expect(
      runner.result.toolCalls.some((t) => t.toolName === 'create-transaction'),
    ).toBe(false);
  });

  it('a money-movement request yields a declining reply and no tool call', async () => {
    const runner = new FakeAgentRunner({
      text: 'I cannot move real money or make transfers. Finlux only records the data you enter.',
      toolCalls: [],
    });
    const service = buildService(runner);
    const result = await service.sendMessage(
      USER_ID,
      TOKEN,
      CONV_ID,
      'transfer 100 USD to my friend',
    );
    const toolCalls = runner.result.toolCalls;
    expect(toolCalls).toHaveLength(0);
    expect(result.messages[1].content).toMatch(/cannot move real money/i);
  });

  it('a model/provider failure persists no agent message and surfaces 502', async () => {
    const runner = new FailingAgentRunner();
    const service = buildService(runner);
    await expect(
      service.sendMessage(USER_ID, TOKEN, CONV_ID, 'anything'),
    ).rejects.toBeInstanceOf(BadGatewayException);
    // Nothing persisted on a failed turn.
    expect(conversations.addMessage).not.toHaveBeenCalled();
  });

  it('forwards the caller token to the agent runner (never derived from the body)', async () => {
    const runner = new FakeAgentRunner({ text: 'ok', toolCalls: [] });
    const service = buildService(runner);
    await service.sendMessage(USER_ID, TOKEN, CONV_ID, 'hello');
    expect(runner.runTurn).toHaveBeenCalledWith(
      USER_ID,
      TOKEN,
      expect.any(Array),
    );
  });
});
