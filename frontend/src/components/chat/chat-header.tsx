/**
 * Chat header displaying the Finlux brand line (name + tagline), separated
 * from the message area by a green divider. The small brand mark keeps the
 * Finlux identity consistent with the welcome state.
 */
export function ChatHeader() {
  return (
    <header className="border-brand/30 bg-surface/60 flex items-center gap-3 border-b px-5 py-4">
      <span
        aria-hidden="true"
        className="border-brand/70 text-brand bg-brand-tint flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-base font-semibold"
      >
        F
      </span>
      <div className="min-w-0">
        <h1 className="text-foreground text-lg leading-tight font-semibold tracking-tight">
          Finlux
        </h1>
        <p className="text-muted-foreground truncate text-sm leading-tight">
          Your AI agent that brings clarity to your personal finances.
        </p>
      </div>
    </header>
  );
}
