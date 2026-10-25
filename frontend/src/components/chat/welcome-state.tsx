/**
 * Empty-state welcome shown at the top of the conversation. The Finlux brand
 * line is the focal point. Copy stays within scope (clarity, agency, trust)
 * and makes no out-of-scope promises (no money movement, no regulated advice).
 */
export function WelcomeState() {
  return (
    <section
      aria-labelledby="welcome-heading"
      className="flex flex-col items-center gap-5 px-6 py-10 text-center sm:py-14"
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
        Your AI agent that brings <span className="text-brand">clarity</span> to
        your personal finances.
      </h2>

      <p className="text-muted-foreground max-w-sm text-sm leading-relaxed text-pretty sm:text-base">
        Ask about your spending and accounts, and get clear answers you can
        trace back to the underlying data.
      </p>
    </section>
  );
}
