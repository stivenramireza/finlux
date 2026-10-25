/**
 * Full-width brand pill submit button, matching the chat send button's
 * treatment (`bg-brand text-brand-foreground rounded-full`, brand focus ring).
 * Shows an in-flight spinner and disables itself to prevent duplicate submits
 * (Req 3.5).
 */
interface AuthSubmitButtonProps {
  label: string;
  isSubmitting: boolean;
  /** Accessible status announced while the request is in flight. */
  pendingLabel: string;
}

export function AuthSubmitButton({
  label,
  isSubmitting,
  pendingLabel,
}: AuthSubmitButtonProps) {
  return (
    <button
      type="submit"
      disabled={isSubmitting}
      aria-busy={isSubmitting}
      className="bg-brand text-brand-foreground focus-visible:ring-brand focus-visible:ring-offset-background flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70 sm:text-base"
    >
      {isSubmitting ? (
        <>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="h-4 w-4 animate-spin"
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
          <span>{pendingLabel}</span>
        </>
      ) : (
        label
      )}
    </button>
  );
}
