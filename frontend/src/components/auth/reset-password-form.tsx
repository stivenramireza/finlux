'use client';

/**
 * Reset-password form (Req 7; Design: Decision 9). Rendered on the dedicated
 * `/reset-password` landing. Reads the `token` from the URL query, collects and
 * confirms a new password (`type="password"`, accessible labels), validates the
 * existing policy client-side (reusing `lib/auth/validation.ts`), and submits
 * `{ token, password }` via the unauthenticated `confirmPasswordReset`.
 *
 * On success: a clear success state with a path to the login view (Req 7.3).
 * On failure (`400`): a generic, safe message — it never reveals which token
 * condition failed or that the password was the problem (Req 7.4) — plus a
 * "request a new link" path. Never logs the token or the password (Req 7.5).
 */
import { useId, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-provider';
import { PASSWORD_POLICY_HINT, validatePassword } from '@/lib/auth/validation';
import { AuthField } from './auth-field';
import { AuthSubmitButton } from './auth-submit-button';

/**
 * Generic, non-disclosing failure copy (Req 7.4): identical whether the token
 * is invalid/expired/used or the password was rejected server-side.
 */
const GENERIC_FAILURE_MESSAGE =
  'We couldn’t reset your password. The link may have expired or already been used. Request a new link and try again.';

interface ResetPasswordFormProps {
  /** Navigate to the login view (home route) after success / for a new link. */
  onGoToLogin: () => void;
}

export function ResetPasswordForm({ onGoToLogin }: ResetPasswordFormProps) {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const { getApiClient } = useAuth();
  const statusId = useId();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return; // Prevent duplicate submits (Req 7, consistent with auth forms).
    }

    setFormError(null);

    // Client-side validation (fast feedback; backend remains the authority).
    let valid = true;
    const pwError = validatePassword(password);
    if (pwError) {
      setPasswordError(pwError);
      valid = false;
    } else {
      setPasswordError(undefined);
    }
    if (confirmPassword !== password) {
      setConfirmError('Passwords do not match.');
      valid = false;
    } else {
      setConfirmError(undefined);
    }
    if (!valid) {
      return;
    }

    // A missing token can't succeed; surface the same generic failure + path.
    if (token.length === 0) {
      setFormError(GENERIC_FAILURE_MESSAGE);
      return;
    }

    setIsSubmitting(true);
    const outcome = await getApiClient().confirmPasswordReset(token, password);
    setIsSubmitting(false);

    if (outcome.kind === 'success') {
      // Clear the sensitive input and show the success state (Req 7.3).
      setPassword('');
      setConfirmPassword('');
      setSucceeded(true);
      return;
    }
    if (outcome.kind === 'network') {
      setPassword('');
      setConfirmPassword('');
      setFormError(
        'Could not reach the server. Check your connection and try again.',
      );
      return;
    }
    // `rejected` (400) and `unknown` both get the generic, non-disclosing copy.
    setPassword('');
    setConfirmPassword('');
    setFormError(GENERIC_FAILURE_MESSAGE);
  }

  if (succeeded) {
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
                d="m5 13 4 4L19 7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <p className="text-foreground text-sm leading-relaxed text-pretty">
            Your password has been updated. You can now log in with your new
            password.
          </p>
        </div>

        <button
          type="button"
          onClick={onGoToLogin}
          className="bg-brand text-brand-foreground focus-visible:ring-brand focus-visible:ring-offset-background flex w-full items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none sm:text-base"
        >
          Go to log in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
        Choose a new password for your account.
      </p>

      <AuthField
        id="reset-password"
        label="New password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        required
        disabled={isSubmitting}
        error={passwordError}
        hint={PASSWORD_POLICY_HINT}
      />

      <AuthField
        id="reset-password-confirm"
        label="Confirm new password"
        type="password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        required
        disabled={isSubmitting}
        error={confirmError}
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
        label="Set new password"
        pendingLabel="Saving…"
        isSubmitting={isSubmitting}
      />

      {/* On failure the user can start over and request a fresh link (Req 7.4). */}
      {formError && (
        <button
          type="button"
          onClick={onGoToLogin}
          disabled={isSubmitting}
          className="text-brand focus-visible:ring-brand focus-visible:ring-offset-background self-center rounded-full px-3 py-1.5 text-sm font-medium underline-offset-4 transition-opacity hover:underline hover:opacity-80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
        >
          Request a new link
        </button>
      )}
    </form>
  );
}
