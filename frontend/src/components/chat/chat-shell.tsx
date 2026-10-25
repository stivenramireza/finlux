import { ChatHeader } from './chat-header';
import { MessageInput } from './message-input';
import { MessageList } from './message-list';

/**
 * Outer chat container: a green-bordered, rounded, centered, full-height flex
 * column composing the header, scrollable message area, and input row.
 */
export function ChatShell() {
  return (
    <main className="flex flex-1 items-stretch justify-center p-4 sm:p-6">
      <div className="border-brand/60 bg-background flex h-full max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-sm sm:max-h-[calc(100dvh-3rem)]">
        <ChatHeader />
        <MessageList />
        <MessageInput />
      </div>
    </main>
  );
}
