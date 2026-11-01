'use client';

/**
 * Forgot-password request step (Req 6; Design: Decision 9). An email-entry form
 * reached from the "Forgot your password?" affordance on the login view. On
 * submit it calls the unauthenticated `requestPasswordReset` and shows the
 * SAME non-disclosing confirmation whether or not the email is registered
 * (Req 6.2) — it never reveals account existence.
 *
 * Reuses the existing building blocks (`AuthField`, `AuthSubmitButton`, brand
 * tokens); introduces no new design tokens. Validates the email client-side,
 * indicates progress, and prevents duplicate submits while in flight (Req 6.3).
 * Never logs the email.
 */
import { useId, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { isValidEmail } from '@/lib/auth/validation';
import { AuthField } from './auth-field';
import { AuthSubmitButton } from './auth-submit-button';

/**
 * Non-disclosing confirmation copy — matches the backend's uniform response
 * (Req 2.1): it does NOT tell the user whether the email was registered.
 */
const CONFIRMATION_MESSAGE =
  'If an account exists for that email, we’ve sent instructions to reset your password. Check your inbox — the link expires in 5 minutes.';

interface ForgotPasswordFormProps {
  /** Return to the login view (used by the "Back to log in" affordance). */
  onBackToLogin: () => void;
}

export function ForgotPasswordForm({ onBackToLogin }: ForgotPasswordFormProps) {
  const { getApiClient } = useAuth();
  const statusId = useId();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return; // Prevent duplicate submits (Req 6.3).
    }

    setFormError(null);

    // Client-side validation (fast feedback; backend remains the authority).
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError(undefined);

    setIsSubmitting(true);
    const outcome = await getApiClient().requestPasswordReset(email.trim());
    setIsSubmitting(false);

    if (outcome.kind === 'success') {
      // Show the uniform, non-disclosing confirmation (Req 6.2).
      setSubmitted(true);
      return;
    }
    if (outcome.kind === 'validation') {
      setEmailError('Enter a valid email address.');
      return;
    }
    // network / unknown — a generic, retryable message (no disclosure).
    setFormError(
      'Could not reach the server. Check your connection and try again.',
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-6">
        <div
          role="status"
          aria-live="polite"
          className="border-brand/40 bg-brand-tint flex flex-col gap-2 rounded-2xl border p-5"
        >
          <span
            aria-hidden="true"
            className="text-brand border-brand bg-background flex h-9 w-9 items-center justify-center rounded-full border"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
              <path
                d="M4 7.5 12 13l8-5.5M5 5.5h14a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <p className="text-foreground text-sm leading-relaxed text-pretty">
            {CONFIRMATION_MESSAGE}
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToLogin}
          className="text-brand hover:text-brand focus-visible:ring-brand focus-visible:ring-offset-background self-center rounded-full px-3 py-1.5 text-sm font-medium underline-offset-4 transition-opacity hover:underline hover:opacity-80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          Back to log in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
        Enter the email for your account and we’ll send you a link to set a new
        password.
      </p>

      <AuthField
        id="forgot-email"
        label="Email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        required
        disabled={isSubmitting}
        placeholder="you@example.com"
        error={emailError}
      />

      <p
        id={statusId}
        role="alert"
        aria-live="polite"
        className="text-brand min-h-[1.25rem] text-sm font-medium"
      >
        {formError}
      </p>

      <AuthSubmitButton
        label="Send reset link"
        pendingLabel="Sending…"
        isSubmitting={isSubmitting}
      />

      <button
        type="button"
        onClick={onBackToLogin}
        disabled={isSubmitting}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-brand focus-visible:ring-offset-background self-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
      >
        Back to log in
      </button>
    </form>
  );
}
