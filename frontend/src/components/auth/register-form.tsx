'use client';

/**
 * Registration form (Req 2). Semantic `<form>` with email, password, and an
 * optional display name. Client-side validation enforces a valid email and the
 * full backend password policy (Req 2.2). On success the provider auto-logs the
 * user in (Req 2.4). Errors render in a form-level `aria-live` region —
 * specific copy for duplicate-email (Req 2.5); non-password input is preserved
 * on error (Req 2.6).
 */
import { useId, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-provider';
import {
  authErrorToMessage,
  isValidEmail,
  PASSWORD_POLICY_HINT,
  validatePassword,
} from '@/lib/auth/validation';
import { AuthField } from './auth-field';
import { AuthSubmitButton } from './auth-submit-button';

export function RegisterForm() {
  const { register } = useAuth();
  const statusId = useId();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
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

    let valid = true;
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email address.');
      valid = false;
    } else {
      setEmailError(undefined);
    }

    const pwError = validatePassword(password);
    if (pwError) {
      setPasswordError(pwError);
      valid = false;
    } else {
      setPasswordError(undefined);
    }

    if (!valid) {
      return;
    }

    setIsSubmitting(true);
    const error = await register({
      email: email.trim(),
      password,
      displayName: displayName.trim() || undefined,
    });
    setIsSubmitting(false);

    if (error) {
      // Keep non-password input (email, display name); clear the password (Req 2.6).
      setPassword('');
      setFormError(authErrorToMessage(error));
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <AuthField
        id="register-email"
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
        id="register-password"
        label="Password"
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
        id="register-display-name"
        label="Display name (optional)"
        type="text"
        value={displayName}
        onChange={setDisplayName}
        autoComplete="name"
        disabled={isSubmitting}
        placeholder="How should we greet you?"
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
        label="Create account"
        pendingLabel="Creating account…"
        isSubmitting={isSubmitting}
      />
    </form>
  );
}
