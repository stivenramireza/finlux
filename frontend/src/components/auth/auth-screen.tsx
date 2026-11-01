'use client';

/**
 * AuthScreen (Design: Decision B, UI/UX "AuthScreen"). A single centered,
 * green-bordered card mirroring `ChatShell`'s frame, composing the brand block,
 * a `bg-surface/60` login/registration mode toggle, and the active form. The
 * mode is a client-side toggle — NOT separate routes.
 */
import { useId, useState } from 'react';
import { AuthBrand } from './auth-brand';
import { ForgotPasswordForm } from './forgot-password-form';
import { LoginForm } from './login-form';
import { RegisterForm } from './register-form';

type Mode = 'login' | 'register' | 'forgot-password';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const tablistLabelId = useId();

  const isForgotPassword = mode === 'forgot-password';

  return (
    <main className="flex flex-1 items-stretch justify-center p-4 sm:p-6">
      <div className="border-brand/60 bg-background flex h-full max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-y-auto rounded-2xl border px-6 py-8 shadow-sm sm:max-h-[calc(100dvh-3rem)] sm:px-8 sm:py-10">
        <div className="flex flex-col gap-8">
          <AuthBrand />

          {/*
            The login/registration mode toggle is hidden on the forgot-password
            step: that step is a focused sub-flow of the login view, reached via
            the "Forgot your password?" affordance and left via "Back to log in".
          */}
          {!isForgotPassword && (
            <>
              {/* Mode toggle — mirrors the chat's header/input-bar treatment. */}
              <div
                role="tablist"
                aria-label="Choose login or registration"
                aria-labelledby={tablistLabelId}
                className="border-brand/30 bg-surface/60 flex gap-1 rounded-full border p-1"
              >
                <span id={tablistLabelId} className="sr-only">
                  Choose login or registration
                </span>
                <ModeTab
                  label="Log in"
                  active={mode === 'login'}
                  onSelect={() => setMode('login')}
                  controls="auth-login-panel"
                />
                <ModeTab
                  label="Create account"
                  active={mode === 'register'}
                  onSelect={() => setMode('register')}
                  controls="auth-register-panel"
                />
              </div>

              {/* Announce the active mode for assistive tech. */}
              <p aria-live="polite" className="sr-only">
                {mode === 'login'
                  ? 'Showing the log in form.'
                  : 'Showing the create account form.'}
              </p>
            </>
          )}

          {mode === 'login' && (
            <div id="auth-login-panel" role="tabpanel">
              <LoginForm onForgotPassword={() => setMode('forgot-password')} />
            </div>
          )}

          {mode === 'register' && (
            <div id="auth-register-panel" role="tabpanel">
              <RegisterForm />
            </div>
          )}

          {isForgotPassword && (
            <div>
              {/* Announce the focused sub-flow for assistive tech. */}
              <p aria-live="polite" className="sr-only">
                Showing the reset your password form.
              </p>
              <ForgotPasswordForm onBackToLogin={() => setMode('login')} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

interface ModeTabProps {
  label: string;
  active: boolean;
  onSelect: () => void;
  controls: string;
}

function ModeTab({ label, active, onSelect, controls }: ModeTabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onSelect}
      className={
        active
          ? 'bg-brand text-brand-foreground focus-visible:ring-brand focus-visible:ring-offset-background flex-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
          : 'text-foreground hover:bg-brand-tint focus-visible:ring-brand focus-visible:ring-offset-background flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
      }
    >
      {label}
    </button>
  );
}
