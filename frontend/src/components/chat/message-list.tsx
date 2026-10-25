import { MessageBubble } from './message-bubble';
import { sampleMessages } from './messages';
import { WelcomeState } from './welcome-state';

/**
 * Scrollable message area. Shows the WelcomeState as the focal point of the
 * empty chat, followed by static sample bubbles to demonstrate user vs agent
 * styling. Keyboard-scrollable via native overflow and exposed as a polite log.
 */
export function MessageList() {
  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Conversation with Finlux"
      tabIndex={0}
      className="focus-visible:ring-brand focus-visible:ring-inset flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 focus-visible:ring-2 focus-visible:outline-none sm:px-5"
    >
      <WelcomeState />
      {sampleMessages.map((message) => (
        <MessageBubble key={message.id} role={message.role}>
          {message.text}
        </MessageBubble>
      ))}
    </div>
  );
}
