import type { ReactNode } from 'react';
import type { ChatRole } from './messages';

interface MessageBubbleProps {
  role: ChatRole;
  children: ReactNode;
}

/**
 * Presentational chat bubble. User messages align right with a neutral filled
 * style; agent messages align left and carry a soft green brand border over a
 * brand tint, so the green reads as the agent's identity. New turns fade and
 * rise in gently (motion is disabled under `prefers-reduced-motion`).
 */
export function MessageBubble({ role, children }: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div
      className={`animate-rise-in flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={
          isUser
            ? 'bg-foreground text-background max-w-[85%] rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed sm:max-w-[80%] sm:text-base'
            : 'border-brand/70 bg-brand-tint text-foreground max-w-[85%] rounded-2xl rounded-bl-md border px-4 py-3 text-sm leading-relaxed sm:max-w-[80%] sm:text-base'
        }
      >
        {children}
      </div>
    </div>
  );
}
