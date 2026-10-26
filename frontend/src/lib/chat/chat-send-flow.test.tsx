import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the auth provider so `useChat()` gets a fake shared client whose
// `authedFetch` we script per test. This keeps the send flow deterministic and
// independent of env / a live model.
const authedFetch =
  vi.fn<(path: string, init?: RequestInit) => Promise<Response>>();
const onUnauthorized = vi.fn();

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ getApiClient: () => ({ authedFetch }) }),
}));

import { ChatProvider } from './chat-provider';
import { MessageInput } from '@/components/chat/message-input';
import { MessageList } from '@/components/chat/message-list';
import { ErrorNotice } from '@/components/chat/error-notice';

const CONVO_ID = '11111111-1111-4111-8111-111111111111';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function dto(role: 'user' | 'agent', content: string, id: string) {
  return {
    id,
    conversationId: CONVO_ID,
    role,
    content,
    createdAt: '2025-01-01T00:00:00.000Z',
  };
}

function renderChat() {
  return render(
    <ChatProvider>
      <MessageList />
      <ErrorNotice />
      <MessageInput />
    </ChatProvider>,
  );
}

async function type(text: string) {
  const input = screen.getByLabelText('Message Finlux');
  await userEvent.type(input, text);
  return input;
}

beforeEach(() => {
  authedFetch.mockReset();
  onUnauthorized.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('chat send flow', () => {
  it('first send starts a conversation and renders user + agent turns', async () => {
    authedFetch.mockResolvedValueOnce(
      jsonResponse(201, {
        conversation: {
          id: CONVO_ID,
          title: null,
          createdAt: 'x',
          updatedAt: 'x',
        },
        messages: [dto('user', 'hello', 's1'), dto('agent', 'hi there', 's2')],
      }),
    );

    renderChat();
    await type('hello');
    await userEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(screen.getByText('hi there')).toBeInTheDocument();
    });
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(authedFetch).toHaveBeenCalledWith('/conversations', {
      method: 'POST',
      body: JSON.stringify({ message: 'hello' }),
    });
  });

  it('second send continues the adopted conversation', async () => {
    authedFetch
      .mockResolvedValueOnce(
        jsonResponse(201, {
          conversation: {
            id: CONVO_ID,
            title: null,
            createdAt: 'x',
            updatedAt: 'x',
          },
          messages: [dto('user', 'one', 's1'), dto('agent', 'reply one', 's2')],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          messages: [dto('user', 'two', 's3'), dto('agent', 'reply two', 's4')],
        }),
      );

    renderChat();
    await type('one');
    await userEvent.click(screen.getByLabelText('Send message'));
    await waitFor(() =>
      expect(screen.getByText('reply one')).toBeInTheDocument(),
    );

    await type('two');
    await userEvent.click(screen.getByLabelText('Send message'));
    await waitFor(() =>
      expect(screen.getByText('reply two')).toBeInTheDocument(),
    );

    expect(authedFetch).toHaveBeenNthCalledWith(
      2,
      `/conversations/${CONVO_ID}/messages`,
      { method: 'POST', body: JSON.stringify({ message: 'two' }) },
    );
  });

  it('empty / whitespace-only input sends no request', async () => {
    renderChat();
    await type('   ');
    await userEvent.click(screen.getByLabelText('Send message'));
    expect(authedFetch).not.toHaveBeenCalled();
  });

  it('over-limit input is rejected client-side with no request', async () => {
    renderChat();
    // Bypass the maxLength attribute by setting the value directly, then submit.
    const input = screen.getByLabelText('Message Finlux') as HTMLInputElement;
    const longText = 'a'.repeat(4001);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input, longText);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      input.form?.requestSubmit();
    });

    expect(authedFetch).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /couldn't be sent/i,
    );
  });

  it('disables the send control while a turn is in flight (no duplicate submit)', async () => {
    let resolve!: (r: Response) => void;
    authedFetch.mockImplementationOnce(
      () => new Promise<Response>((r) => (resolve = r)),
    );

    renderChat();
    await type('hi');
    const sendButton = screen.getByLabelText('Send message');
    await userEvent.click(sendButton);

    // Mid-flight: button + input disabled, pending bubble shown.
    expect(sendButton).toBeDisabled();
    expect(screen.getByLabelText('Message Finlux')).toBeDisabled();
    expect(screen.getByText('Finlux is thinking…')).toBeInTheDocument();

    // A repeat click does not trigger a second request.
    await userEvent.click(sendButton);
    expect(authedFetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(
        jsonResponse(201, {
          conversation: {
            id: CONVO_ID,
            title: null,
            createdAt: 'x',
            updatedAt: 'x',
          },
          messages: [dto('user', 'hi', 's1'), dto('agent', 'done', 's2')],
        }),
      );
    });
    await waitFor(() => expect(screen.getByText('done')).toBeInTheDocument());
  });

  it('502 shows a retryable notice, keeps the text, and drops the optimistic bubble', async () => {
    authedFetch
      .mockResolvedValueOnce(jsonResponse(502, { message: 'upstream' }))
      .mockResolvedValueOnce(
        jsonResponse(201, {
          conversation: {
            id: CONVO_ID,
            title: null,
            createdAt: 'x',
            updatedAt: 'x',
          },
          messages: [dto('user', 'hi', 's1'), dto('agent', 'recovered', 's2')],
        }),
      );

    renderChat();
    await type('hi');
    await userEvent.click(screen.getByLabelText('Send message'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/unavailable/i);
    // No fabricated agent reply; optimistic user bubble removed on failure.
    expect(screen.queryByText('hi')).not.toBeInTheDocument();

    // Retry resends the preserved text.
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.getByText('recovered')).toBeInTheDocument(),
    );
    expect(authedFetch).toHaveBeenCalledTimes(2);
  });

  it('network failure shows a retryable notice and preserves the text', async () => {
    authedFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    renderChat();
    await type('hi');
    await userEvent.click(screen.getByLabelText('Send message'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/unavailable/i);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('401 aborts the turn silently (global handler owns it; no chat error)', async () => {
    authedFetch.mockResolvedValueOnce(jsonResponse(401, { message: 'nope' }));

    renderChat();
    await type('hi');
    await userEvent.click(screen.getByLabelText('Send message'));

    await waitFor(() => {
      expect(screen.getByLabelText('Send message')).not.toBeDisabled();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Optimistic bubble removed; nothing fabricated.
    expect(screen.queryByText('hi')).not.toBeInTheDocument();
  });

  it('404 resets the conversation so the next send starts fresh', async () => {
    authedFetch
      .mockResolvedValueOnce(
        jsonResponse(201, {
          conversation: {
            id: CONVO_ID,
            title: null,
            createdAt: 'x',
            updatedAt: 'x',
          },
          messages: [dto('user', 'one', 's1'), dto('agent', 'reply one', 's2')],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(404, { message: 'gone' }))
      .mockResolvedValueOnce(
        jsonResponse(201, {
          conversation: {
            id: '22222222-2222-4222-8222-222222222222',
            title: null,
            createdAt: 'x',
            updatedAt: 'x',
          },
          messages: [
            dto('user', 'three', 's5'),
            dto('agent', 'fresh reply', 's6'),
          ],
        }),
      );

    renderChat();
    await type('one');
    await userEvent.click(screen.getByLabelText('Send message'));
    await waitFor(() =>
      expect(screen.getByText('reply one')).toBeInTheDocument(),
    );

    await type('two');
    await userEvent.click(screen.getByLabelText('Send message'));
    await screen.findByRole('alert');

    // Next send must start a fresh conversation (POST /conversations).
    await type('three');
    await userEvent.click(screen.getByLabelText('Send message'));
    await waitFor(() =>
      expect(screen.getByText('fresh reply')).toBeInTheDocument(),
    );

    expect(authedFetch).toHaveBeenNthCalledWith(3, '/conversations', {
      method: 'POST',
      body: JSON.stringify({ message: 'three' }),
    });
  });
});
