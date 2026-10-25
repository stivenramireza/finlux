/**
 * Shared Finlux brand block for the auth screen: the rounded "F" mark plus the
 * brand line, presented like the chat's `WelcomeState` focal copy so auth and
 * chat read as one product (Req 7.2/7.3). Reuses only existing tokens
 * (`--brand`, `--brand-tint`, `text-brand`) — no new design tokens.
 *
 * The mark is decorative (`aria-hidden`); the accessible name of the screen
 * comes from the real `<h1>` heading rendered here.
 */
export function AuthBrand() {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span
        aria-hidden="true"
        className="border-brand text-brand bg-brand-tint ring-brand/15 flex h-14 w-14 items-center justify-center rounded-2xl border-2 text-2xl font-semibold ring-8"
      >
        F
      </span>

      <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
        Welcome to Finlux
      </p>

      {/* Brand line — the accessible name / focal copy of the auth screen. */}
      <h1 className="text-foreground max-w-sm text-2xl font-semibold tracking-tight text-balance sm:text-[1.75rem]">
        Your AI agent that brings <span className="text-brand">clarity</span> to
        your personal finances.
      </h1>
    </div>
  );
}
