'use client';

/**
 * Login form (Req 3). Semantic `<form>` with email + password, client-side
 * validation, an in-flight disabled submit (Req 3.5), and a form-level
 * `aria-live` region that renders the mapped `AuthError` copy — a single
 * generic message for invalid credentials (Req 3.4). Non-password input is
 * preserved on error (Req 3.4).
 */
import { useId, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import { authErrorToMessage, isValidEmail } from '@/lib/auth/validation';
import { AuthField } from './auth-field';
import { AuthSubmitButton } from './auth-submit-button';

interface LoginFormProps {
  /** Opens the "Forgot your password?" request step (Req 6.1). */
  onForgotPassword: () => void;
}

export function LoginForm({ onForgotPassword }: LoginFormProps) {
  const { login } = useAuth();
  const statusId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return; // Prevent duplicate submits (Req 3.5).
    }

    setFormError(null);

    // Client-side validation (fast feedback; backend remains the authority).
    let valid = true;
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email address.');
      valid = false;
    } else {
      setEmailError(undefined);
    }
    if (password.length === 0) {
      setPasswordError('Enter your password.');
      valid = false;
    } else {
      setPasswordError(undefined);
    }
    if (!valid) {
      return;
    }

    setIsSubmitting(true);
    const error = await login({ email: email.trim(), password });
    setIsSubmitting(false);

    if (error) {
      // Clear the password on failure; keep the (non-password) email (Req 3.4).
      setPassword('');
      setFormError(authErrorToMessage(error));
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <AuthField
        id="login-email"
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

      <AuthField
        id="login-password"
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        required
        disabled={isSubmitting}
        error={passwordError}
      />

      <div className="-mt-1 flex justify-end">
        <button
          type="button"
          onClick={onForgotPassword}
          disabled={isSubmitting}
          className="text-brand focus-visible:ring-brand focus-visible:ring-offset-background rounded-full px-2 py-1 text-sm font-medium underline-offset-4 transition-opacity hover:underline hover:opacity-80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60"
        >
          Forgot your password?
        </button>
      </div>

      <p
        id={statusId}
        role="alert"
        aria-live="polite"
        className="text-brand min-h-[1.25rem] text-sm font-medium"
      >
        {formError}
      </p>

      <AuthSubmitButton
        label="Log in"
        pendingLabel="Logging in…"
        isSubmitting={isSubmitting}
      />
    </form>
  );
}
