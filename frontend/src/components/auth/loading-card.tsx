/**
 * Loading / undetermined state (Req 1.4). The same card frame as `ChatShell`
 * and `AuthScreen` with a centered brand-green spinner, shown while the
 * persisted token is read/validated — so the chat is never flashed to an
 * unauthenticated user.
 */
export function LoadingCard() {
  return (
    <main className="flex flex-1 items-stretch justify-center p-4 sm:p-6">
      <div className="border-brand/60 bg-background flex h-full max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col items-center justify-center gap-4 rounded-2xl border shadow-sm sm:max-h-[calc(100dvh-3rem)]">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="text-brand h-8 w-8 animate-spin"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
            className="opacity-25"
          />
          <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
        <p role="status" className="text-muted-foreground text-sm">
          Loading Finlux…
        </p>
      </div>
    </main>
  );
}
