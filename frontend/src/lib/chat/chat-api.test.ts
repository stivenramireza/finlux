import { describe, expect, it, vi } from 'vitest';
import { ChatApi } from './chat-api';
import type { AuthedFetchClient } from './chat-api';

/** Builds a JSON `Response` with the given status + body. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** A fake client whose `authedFetch` returns a scripted response (or throws). */
function fakeClient(
  impl: (path: string, init?: RequestInit) => Promise<Response>,
): AuthedFetchClient & { authedFetch: ReturnType<typeof vi.fn> } {
  return { authedFetch: vi.fn(impl) };
}

const conversation = {
  id: '11111111-1111-4111-8111-111111111111',
  title: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};
const userTurn = {
  id: 'm1',
  conversationId: conversation.id,
  role: 'user' as const,
  content: 'hi',
  createdAt: '2025-01-01T00:00:00.000Z',
};
const agentTurn = {
  id: 'm2',
  conversationId: conversation.id,
  role: 'agent' as const,
  content: 'hello',
  createdAt: '2025-01-01T00:00:01.000Z',
};

describe('ChatApi.startConversation', () => {
  it('POSTs /conversations with { message } and adopts the result', async () => {
    const client = fakeClient(async () =>
      jsonResponse(201, { conversation, messages: [userTurn, agentTurn] }),
    );
    const api = new ChatApi(client);

    const result = await api.startConversation('hi');

    expect(client.authedFetch).toHaveBeenCalledWith('/conversations', {
      method: 'POST',
      body: JSON.stringify({ message: 'hi' }),
    });
    expect(result).toEqual({
      ok: true,
      data: { conversation, messages: [userTurn, agentTurn] },
    });
  });

  it('includes a trimmed title only when provided', async () => {
    const client = fakeClient(async () =>
      jsonResponse(201, { conversation, messages: [userTurn, agentTurn] }),
    );
    const api = new ChatApi(client);

    await api.startConversation('hi', '  My budget  ');

    expect(client.authedFetch).toHaveBeenCalledWith('/conversations', {
      method: 'POST',
      body: JSON.stringify({ message: 'hi', title: 'My budget' }),
    });
  });

  it('never sends a user/ownership hint in the body', async () => {
    const client = fakeClient(async () =>
      jsonResponse(201, { conversation, messages: [userTurn, agentTurn] }),
    );
    const api = new ChatApi(client);

    await api.startConversation('hi');

    const [, init] = client.authedFetch.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(Object.keys(body)).toEqual(['message']);
  });
});

describe('ChatApi.sendMessage', () => {
  it('POSTs /conversations/:id/messages with { message }', async () => {
    const client = fakeClient(async () =>
      jsonResponse(201, { messages: [userTurn, agentTurn] }),
    );
    const api = new ChatApi(client);

    const result = await api.sendMessage(conversation.id, 'hi again');

    expect(client.authedFetch).toHaveBeenCalledWith(
      `/conversations/${conversation.id}/messages`,
      { method: 'POST', body: JSON.stringify({ message: 'hi again' }) },
    );
    expect(result).toEqual({
      ok: true,
      data: { messages: [userTurn, agentTurn] },
    });
  });
});

describe('ChatApi status mapping', () => {
  it.each([
    [400, 'validation'],
    [404, 'not-found'],
    [502, 'unavailable'],
    [503, 'unavailable'],
    [401, 'aborted-unauthorized'],
    [500, 'unknown'],
  ] as const)('maps %i → %s', async (status, kind) => {
    const client = fakeClient(async () =>
      jsonResponse(status, { message: 'x' }),
    );
    const api = new ChatApi(client);

    const result = await api.sendMessage(conversation.id, 'hi');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe(kind);
    }
  });

  it('maps a transport failure to a network error', async () => {
    const client = fakeClient(async () => {
      throw new TypeError('Failed to fetch');
    });
    const api = new ChatApi(client);

    const result = await api.sendMessage(conversation.id, 'hi');

    expect(result).toEqual({ ok: false, error: { kind: 'network' } });
  });

  it('treats a malformed success body as unknown', async () => {
    const client = fakeClient(async () => jsonResponse(201, { nope: true }));
    const api = new ChatApi(client);

    const result = await api.sendMessage(conversation.id, 'hi');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('unknown');
    }
  });
});
