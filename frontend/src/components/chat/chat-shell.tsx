import type { ReactNode } from 'react';
import { ChatHeader } from './chat-header';
import { MessageInput } from './message-input';
import { MessageList } from './message-list';

interface ChatShellProps {
  /** Optional header control slot (e.g. the logout button when authenticated). */
  headerAction?: ReactNode;
}

/**
 * Outer chat container: a green-bordered, rounded, centered, full-height flex
 * column composing the header, scrollable message area, and input row. Accepts
 * an optional `headerAction` forwarded to the header's right-aligned slot.
 */
export function ChatShell({ headerAction }: ChatShellProps) {
  return (
    <main className="flex flex-1 items-stretch justify-center p-4 sm:p-6">
      <div className="border-brand/60 bg-background flex h-full max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-sm sm:max-h-[calc(100dvh-3rem)]">
        <ChatHeader action={headerAction} />
        <MessageList />
        <MessageInput />
      </div>
    </main>
  );
}
