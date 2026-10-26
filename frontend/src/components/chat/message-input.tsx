'use client';

/**
 * Message input row (Design: Decisions 7, 8). A real `<form>` whose submit
 * sends the message through `useChat()`: Enter submits, the send button is a
 * `type="submit"`. Empty/whitespace submits keep focus and send nothing
 * (Req 1.5); the length is bounded to the backend limit (Req 1.6); the input
 * and button are disabled while a turn is in flight (Req 3.2). Preserves the
 * existing label, aria, brand styling, and placeholder copy.
 */
import { useRef, useState } from 'react';
import { MAX_MESSAGE_LENGTH, useChat } from '@/lib/chat/chat-provider';

export function MessageInput() {
  const { sendMessage, status } = useChat();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isSending = status === 'sending';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSending) {
      return; // Ignore repeat submits while a turn is in flight (Req 3.2).
    }

    const text = value;
    if (text.trim().length === 0) {
      // No send; keep focus for correction (Req 1.5).
      inputRef.current?.focus();
      return;
    }

    // Clear optimistically on the success path; the provider owns the turn.
    setValue('');
    await sendMessage(text);
    inputRef.current?.focus();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-brand/30 bg-surface/60 border-t px-4 py-4 sm:px-5"
    >
      <div
        role="group"
        aria-label="Message input"
        className="border-brand focus-within:ring-brand/40 bg-background flex items-center gap-2 rounded-full border py-1.5 pr-1.5 pl-2 focus-within:ring-4"
      >
        <label htmlFor="chat-message" className="sr-only">
          Message Finlux
        </label>
        <input
          id="chat-message"
          ref={inputRef}
          type="text"
          name="message"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Ask Finlux about your finances…"
          autoComplete="off"
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={isSending}
          className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent px-3 py-1.5 text-sm focus-visible:outline-none disabled:opacity-60 sm:text-base"
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={isSending}
          className="bg-brand text-brand-foreground focus-visible:ring-brand focus-visible:ring-offset-background flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
        >
          {isSending ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px] animate-spin"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[18px] w-[18px]"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </form>
  );
}
