import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Flow tests for the password-reset frontend (Tasks 10 + 11). The API client is
 * faked via a mocked `useAuth().getApiClient()`, so no real request is made and
 * the flow is deterministic. Covers: the non-disclosing request confirmation,
 * client-side email validation gating the request, a successful confirm routing
 * to login, and the generic failure copy + "request a new link" path on `400`.
 */

const requestPasswordReset =
  vi.fn<(email: string, locale?: string) => Promise<unknown>>();
const confirmPasswordReset =
  vi.fn<(token: string, password: string) => Promise<unknown>>();

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    getApiClient: () => ({ requestPasswordReset, confirmPasswordReset }),
  }),
}));

// `useSearchParams` / `useRouter` for the reset form.
const replace = vi.fn();
let tokenParam: string | null = 'raw-token';
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => tokenParam }),
  useRouter: () => ({ replace }),
}));

import { ForgotPasswordForm } from './forgot-password-form';
import { ResetPasswordForm } from './reset-password-form';

beforeEach(() => {
  requestPasswordReset.mockReset();
  confirmPasswordReset.mockReset();
  replace.mockReset();
  tokenParam = 'raw-token';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ForgotPasswordForm', () => {
  it('shows the non-disclosing confirmation on a successful request', async () => {
    requestPasswordReset.mockResolvedValueOnce({ kind: 'success' });
    render(<ForgotPasswordForm onBackToLogin={() => {}} />);

    await userEvent.type(screen.getByLabelText('Email'), 'you@example.com');
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/if an account exists for that email/i),
      ).toBeInTheDocument(),
    );
    expect(requestPasswordReset).toHaveBeenCalledWith('you@example.com');
  });

  it('does not send a request for an invalid email', async () => {
    render(<ForgotPasswordForm onBackToLogin={() => {}} />);

    await userEvent.type(screen.getByLabelText('Email'), 'not-an-email');
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' }),
    );

    expect(requestPasswordReset).not.toHaveBeenCalled();
    expect(
      screen.getByText('Enter a valid email address.'),
    ).toBeInTheDocument();
  });

  it('does not send a request for an empty email', async () => {
    render(<ForgotPasswordForm onBackToLogin={() => {}} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Send reset link' }),
    );
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });
});

describe('ResetPasswordForm', () => {
  it('on a successful confirm shows the success state and can route to login', async () => {
    confirmPasswordReset.mockResolvedValueOnce({ kind: 'success' });
    render(<ResetPasswordForm onGoToLogin={() => replace('/')} />);

    await userEvent.type(screen.getByLabelText('New password'), 'S3cur3P@ss');
    await userEvent.type(
      screen.getByLabelText('Confirm new password'),
      'S3cur3P@ss',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Set new password' }),
    );

    await waitFor(() =>
      expect(
        screen.getByText(/your password has been updated/i),
      ).toBeInTheDocument(),
    );
    expect(confirmPasswordReset).toHaveBeenCalledWith(
      'raw-token',
      'S3cur3P@ss',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Go to log in' }));
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('shows a generic failure with a new-link path on a 400 (no disclosure)', async () => {
    confirmPasswordReset.mockResolvedValueOnce({ kind: 'rejected' });
    render(<ResetPasswordForm onGoToLogin={() => {}} />);

    await userEvent.type(screen.getByLabelText('New password'), 'S3cur3P@ss');
    await userEvent.type(
      screen.getByLabelText('Confirm new password'),
      'S3cur3P@ss',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Set new password' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/couldn’t reset your password/i);
    expect(
      screen.getByRole('button', { name: 'Request a new link' }),
    ).toBeInTheDocument();
  });

  it('does not submit when the passwords do not match', async () => {
    render(<ResetPasswordForm onGoToLogin={() => {}} />);

    await userEvent.type(screen.getByLabelText('New password'), 'S3cur3P@ss');
    await userEvent.type(
      screen.getByLabelText('Confirm new password'),
      'Different1!',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Set new password' }),
    );

    expect(confirmPasswordReset).not.toHaveBeenCalled();
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
  });

  it('does not submit a password that violates the policy', async () => {
    render(<ResetPasswordForm onGoToLogin={() => {}} />);

    await userEvent.type(screen.getByLabelText('New password'), 'weak');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'weak');
    await userEvent.click(
      screen.getByRole('button', { name: 'Set new password' }),
    );

    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });
});
