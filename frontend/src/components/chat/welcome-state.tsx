'use client';

/**
 * Empty-state welcome shown at the top of the conversation. The Finlux brand
 * line is the focal point, followed by a few friendly example prompts the user
 * can tap to start. Copy stays within scope (clarity, agency, trust) and makes
 * no out-of-scope promises (no accounts, money movement, bank connections, or
 * regulated advice) — Finlux only reasons over the user's income and expenses.
 */
import { useChat } from '@/lib/chat/chat-provider';

/** Short, in-scope conversation starters (income/expenses only). */
const SUGGESTIONS = [
  'I spent 20 on lunch today',
  'How much did I spend last month?',
  'Show my recent expenses',
] as const;

export function WelcomeState() {
  const { sendMessage, status } = useChat();
  const isSending = status === 'sending';

  return (
    <section
      aria-labelledby="welcome-heading"
      className="animate-rise-in flex flex-col items-center gap-5 px-6 py-10 text-center sm:py-14"
    >
      <span
        aria-hidden="true"
        className="border-brand text-brand bg-brand-tint ring-brand/15 flex h-16 w-16 items-center justify-center rounded-2xl border-2 text-3xl font-semibold ring-8"
      >
        F
      </span>

      <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
        Welcome to Finlux
      </p>

      {/* Brand line — the focal point of the empty chat. */}
      <h2
        id="welcome-heading"
        className="text-foreground max-w-md text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
      >
        Hi! I bring <span className="text-brand">clarity</span> to your personal
        finances.
      </h2>

      <p className="text-muted-foreground max-w-sm text-sm leading-relaxed text-pretty sm:text-base">
        Tell me about your income and expenses in your own words, and I&apos;ll
        give you clear answers you can trace back to the underlying data.
      </p>

      {/* Friendly conversation starters — a gentle nudge, not a requirement. */}
      <div className="mt-1 flex w-full max-w-sm flex-col items-stretch gap-2.5">
        <p className="text-muted-foreground text-xs font-medium">Try asking</p>
        <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          {SUGGESTIONS.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                onClick={() => void sendMessage(suggestion)}
                disabled={isSending}
                className="border-brand/40 bg-brand-tint text-foreground hover:border-brand/70 hover:bg-brand-tint focus-visible:ring-brand focus-visible:ring-offset-background w-full rounded-full border px-4 py-2 text-sm leading-relaxed transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60 sm:w-auto"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
