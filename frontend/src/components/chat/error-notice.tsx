'use client';

/**
 * Safe, non-disclosing error notice (Design: Decisions 6, 8; Req 5). Renders
 * the mapped `ChatError` as generic, status-free copy with a dismiss control,
 * and — for recoverable `unavailable`/`network` errors — a Retry button that
 * resends `lastAttemptedText`. Placed above the input inside the chat. No stack
 * traces, status codes, or internals are shown (Req 5.4).
 */
import { useChat } from '@/lib/chat/chat-provider';
import type { ChatError } from '@/lib/chat/chat-api';

/** Maps a `ChatError` to generic, on-brand copy (no internals, Req 5.4). */
function errorToMessage(error: ChatError): string {
  switch (error.kind) {
    case 'validation':
      return "That message couldn't be sent — please shorten or adjust it.";
    case 'not-found':
      return "That conversation isn't available anymore — starting a new one.";
    case 'unavailable':
    case 'network':
      return 'Finlux is unavailable right now. Your message was kept — try again.';
    case 'unknown':
    default:
      return 'Something went wrong. Please try again.';
  }
}

export function ErrorNotice() {
  const { error, dismissError, sendMessage, lastAttemptedText, status } =
    useChat();

  // `aborted-unauthorized` never reaches here (the provider shows no error for
  // it); guard anyway so nothing renders.
  if (!error || error.kind === 'aborted-unauthorized') {
    return null;
  }

  const canRetry =
    (error.kind === 'unavailable' || error.kind === 'network') &&
    lastAttemptedText !== null;

  function handleRetry() {
    if (lastAttemptedText !== null) {
      dismissError();
      void sendMessage(lastAttemptedText);
    }
  }

  return (
    <div
      role="alert"
      className="border-brand/40 bg-brand-tint text-foreground mx-4 mb-2 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm sm:mx-5"
    >
      <p className="min-w-0 flex-1 leading-relaxed">{errorToMessage(error)}</p>
      <div className="flex shrink-0 items-center gap-2">
        {canRetry ? (
          <button
            type="button"
            onClick={handleRetry}
            disabled={status === 'sending'}
            className="border-brand/60 text-foreground hover:bg-background focus-visible:ring-brand focus-visible:ring-offset-background rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
          >
            Retry
          </button>
        ) : null}
        <button
          type="button"
          onClick={dismissError}
          aria-label="Dismiss"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-brand focus-visible:ring-offset-background rounded-full p-1 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
