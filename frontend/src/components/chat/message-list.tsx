'use client';

/**
 * Scrollable message area (Design: Decisions 3, 8). Reads the live `messages`
 * and `status` from `useChat()`: shows the WelcomeState while empty (Req 2.2),
 * otherwise renders the real user/agent turns via `MessageBubble` (Req 2.1).
 * While a turn is in flight it appends the pending bubble (Req 3.1), and it
 * auto-scrolls to the newest turn without breaking keyboard scrollability
 * (Req 2.3). Agent `content` is rendered verbatim as plain text with
 * `whitespace-pre-wrap` — no parsing or money math (Req 2.4).
 */
import { useEffect, useRef } from 'react';
import { useChat } from '@/lib/chat/chat-provider';
import { MessageBubble } from './message-bubble';
import { PendingBubble } from './pending-bubble';
import { WelcomeState } from './welcome-state';

export function MessageList() {
  const { messages, status } = useChat();
  const isSending = status === 'sending';

  // Sentinel at the bottom of the log; scrolled into view on new turns.
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, isSending]);

  const isEmpty = messages.length === 0;

  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Conversation with Finlux"
      tabIndex={0}
      className="focus-visible:ring-brand flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset sm:px-5"
    >
      {isEmpty ? (
        <WelcomeState />
      ) : (
        messages.map((message) => (
          <MessageBubble key={message.id} role={message.role}>
            <span className="whitespace-pre-wrap">{message.text}</span>
          </MessageBubble>
        ))
      )}

      {isSending ? <PendingBubble /> : null}

      <div ref={endRef} aria-hidden="true" />
    </div>
  );
}
