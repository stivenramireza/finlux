/**
 * Message input row: a labeled text input and a send button with an accessible
 * name and icon. Visual only — there is no submission behavior in this spec,
 * so the form does not submit.
 */
export function MessageInput() {
  return (
    <div className="border-brand/30 bg-surface/60 border-t px-4 py-4 sm:px-5">
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
          type="text"
          name="message"
          placeholder="Ask Finlux about your finances…"
          autoComplete="off"
          className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent px-3 py-1.5 text-sm focus-visible:outline-none sm:text-base"
        />
        <button
          type="button"
          aria-label="Send message"
          className="bg-brand text-brand-foreground focus-visible:ring-brand focus-visible:ring-offset-background flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
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
        </button>
      </div>
    </div>
  );
}
