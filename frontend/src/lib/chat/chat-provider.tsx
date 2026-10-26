'use client';

/**
 * ChatProvider — session chat state (Design: Decisions 4, 5, 6). Holds the
 * active conversation, the ordered turns to render, the in-flight flag, the
 * last error, and the recoverable text, and exposes `sendMessage` +
 * `dismissError` to the chat components via `useChat()`.
 *
 * It builds a `ChatApi` once from `useAuth().getApiClient()` (Decision 1), so
 * every chat call inherits the bearer token and the global `401` handling.
 * One fresh conversation per session (Decision 5): `GET` methods exist on
 * `ChatApi` but are not wired here.
 *
 * Security: renders the agent `content` verbatim as plain text (no money math);
 * never logs the token, message bodies, or agent content (Req 4.4).
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import type { ChatMessage } from '@/components/chat/messages';
import { ChatApi } from './chat-api';
import type { ChatError } from './chat-api';
import type { ChatMessageDto } from './types';

/** Backend message-length bound, mirrored client-side (Req 1.6). */
export const MAX_MESSAGE_LENGTH = 4000;

export type ChatStatus = 'idle' | 'sending';

export interface ChatContextValue {
  conversationId: string | null;
  messages: ChatMessage[];
  status: ChatStatus;
  error: ChatError | null;
  lastAttemptedText: string | null;
  sendMessage(text: string): Promise<void>;
  dismissError(): void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

/** Adapter: backend `ChatMessageDto` → presentational `ChatMessage`. */
function toChatMessage(dto: ChatMessageDto): ChatMessage {
  return { id: dto.id, role: dto.role, text: dto.content };
}

/** Stable, collision-resistant id for the optimistic (client-only) user bubble. */
function optimisticId(): string {
  return `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { getApiClient } = useAuth();

  // Build the ChatApi once from the shared auth client (Decision 1).
  const chatApi = useMemo(() => new ChatApi(getApiClient()), [getApiClient]);

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<ChatError | null>(null);
  const [lastAttemptedText, setLastAttemptedText] = useState<string | null>(
    null,
  );

  // Guard against concurrent/duplicate sends without waiting for a state flush.
  const inFlightRef = useRef(false);

  const dismissError = useCallback(() => setError(null), []);

  const sendMessage = useCallback(
    async (rawText: string): Promise<void> => {
      if (inFlightRef.current) {
        return; // A turn is already in flight (Req 3.2).
      }

      const text = rawText.trim();
      if (text.length === 0) {
        return; // Empty/whitespace-only → no-op; caller keeps focus (Req 1.5).
      }
      if (text.length > MAX_MESSAGE_LENGTH) {
        // Client-side length guard; do not send (Req 1.6).
        setLastAttemptedText(text);
        setError({ kind: 'validation' });
        return;
      }

      // Optimistic user bubble (Decision 6) + enter the sending state.
      inFlightRef.current = true;
      const tempId = optimisticId();
      setError(null);
      setLastAttemptedText(text);
      setMessages((prev) => [...prev, { id: tempId, role: 'user', text }]);
      setStatus('sending');

      try {
        const activeId = conversationId;
        if (activeId === null) {
          const result = await chatApi.startConversation(text);
          if (result.ok) {
            setConversationId(result.data.conversation.id);
            reconcile(tempId, result.data.messages);
            setLastAttemptedText(null);
          } else {
            handleFailure(tempId, result.error);
          }
        } else {
          const result = await chatApi.sendMessage(activeId, text);
          if (result.ok) {
            reconcile(tempId, result.data.messages);
            setLastAttemptedText(null);
          } else {
            handleFailure(tempId, result.error);
          }
        }
      } finally {
        inFlightRef.current = false;
        setStatus('idle');
      }

      /**
       * Replace the optimistic user bubble with the authoritative server turns
       * (user + agent), in order, so ids/timestamps are the server's.
       */
      function reconcile(optimistic: string, dtos: ChatMessageDto[]) {
        const serverMessages = dtos.map(toChatMessage);
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimistic),
          ...serverMessages,
        ]);
      }

      /**
       * On a failed turn, remove the optimistic bubble (no fabricated agent
       * reply) and surface the error. A `401` was already handled globally — we
       * silently drop the bubble and show no chat error (Req 4.3). A `404`
       * resets the conversation so the next send starts fresh (Req 5.3). The
       * attempted text is kept recoverable for retry (Req 5.1).
       */
      function handleFailure(optimistic: string, chatError: ChatError) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic));

        if (chatError.kind === 'aborted-unauthorized') {
          setError(null);
          setLastAttemptedText(null);
          return;
        }
        if (chatError.kind === 'not-found') {
          setConversationId(null);
        }
        setError(chatError);
      }
    },
    [chatApi, conversationId],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      conversationId,
      messages,
      status,
      error,
      lastAttemptedText,
      sendMessage,
      dismissError,
    }),
    [
      conversationId,
      messages,
      status,
      error,
      lastAttemptedText,
      sendMessage,
      dismissError,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

/** Consumes the chat context. Throws if used outside a `ChatProvider`. */
export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return ctx;
}
