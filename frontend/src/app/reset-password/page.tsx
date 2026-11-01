'use client';

/**
 * Reset-password landing (Req 7; Design: Decision 9).
 *
 * A dedicated route, SEPARATE from the `AuthGate` — it is reachable while
 * unauthenticated and never renders the chat. It reuses the auth card frame and
 * brand block so it reads as one product with the auth screen (no new design
 * tokens). The token-reading form (`ResetPasswordForm`, which calls
 * `useSearchParams`) is wrapped in `<Suspense>` as required for client URL
 * hooks under Cache Components.
 *
 * On success / "request a new link" it routes to `/` — the home route renders
 * the gated auth screen (login view) for an unauthenticated user.
 */
import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { AuthBrand } from '@/components/auth/auth-brand';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export default function ResetPasswordPage() {
  const router = useRouter();
  const goToLogin = () => router.replace('/');

  return (
    <main className="flex flex-1 items-stretch justify-center p-4 sm:p-6">
      <div className="border-brand/60 bg-background flex h-full max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-y-auto rounded-2xl border px-6 py-8 shadow-sm sm:max-h-[calc(100dvh-3rem)] sm:px-8 sm:py-10">
        <div className="flex flex-col gap-8">
          <AuthBrand />

          <Suspense fallback={<ResetFormFallback />}>
            <ResetPasswordForm onGoToLogin={goToLogin} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

/** Neutral, brand-tinted placeholder while the client form hydrates. */
function ResetFormFallback() {
  return (
    <p
      role="status"
      aria-live="polite"
      className="text-muted-foreground text-sm"
    >
      Loading…
    </p>
  );
}
