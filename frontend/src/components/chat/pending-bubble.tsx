/**
 * Pending ("typing") indicator (Design: Decision 7). An agent-aligned bubble
 * reusing the agent `MessageBubble` styling (green border over the brand tint)
 * with three animated dots, shown while a turn is in flight. Carries an
 * accessible label so assistive tech announces that the agent is responding.
 * No new design tokens — existing Tailwind utilities only.
 */
export function PendingBubble() {
  return (
    <div className="flex w-full justify-start">
      <div className="border-brand bg-brand-tint text-foreground max-w-[85%] rounded-2xl rounded-bl-md border px-4 py-3 sm:max-w-[80%]">
        <span className="sr-only">Finlux is thinking…</span>
        <span aria-hidden="true" className="flex items-center gap-1.5">
          <span className="bg-brand h-2 w-2 animate-bounce rounded-full [animation-delay:-0.3s]" />
          <span className="bg-brand h-2 w-2 animate-bounce rounded-full [animation-delay:-0.15s]" />
          <span className="bg-brand h-2 w-2 animate-bounce rounded-full" />
        </span>
      </div>
    </div>
  );
}
