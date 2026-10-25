import type { ReactNode } from 'react';

interface ChatHeaderProps {
  /**
   * Optional right-aligned slot for a header control (e.g. the logout button
   * when authenticated). With no `action`, the header is identical to before.
   */
  action?: ReactNode;
}

/**
 * Chat header displaying the Finlux brand line (name + tagline), separated
 * from the message area by a green divider. The small brand mark keeps the
 * Finlux identity consistent with the welcome state. An optional `action` slot
 * hosts a right-aligned control such as the logout button.
 */
export function ChatHeader({ action }: ChatHeaderProps) {
  return (
    <header className="border-brand/30 bg-surface/60 flex items-center gap-3 border-b px-5 py-4">
      <span
        aria-hidden="true"
        className="border-brand/70 text-brand bg-brand-tint flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-base font-semibold"
      >
        F
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-foreground text-lg leading-tight font-semibold tracking-tight">
          Finlux
        </h1>
        <p className="text-muted-foreground truncate text-sm leading-tight">
          Your AI agent that brings clarity to your personal finances.
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
