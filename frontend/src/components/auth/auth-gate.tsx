'use client';

/**
 * Gated home render (Design: Decisions D, E; Req 1). Switches on the provider's
 * `status`:
 * - `undetermined`    → LoadingCard (never the chat, Req 1.4)
 * - `unauthenticated` → AuthScreen (login / registration only, Req 1.1)
 * - `authenticated`   → ChatShell + LogoutButton in the header (Req 1.2, 5.1)
 */
import { useAuth } from '@/lib/auth/auth-provider';
import { ChatShell } from '@/components/chat/chat-shell';
import { AuthScreen } from './auth-screen';
import { LoadingCard } from './loading-card';
import { LogoutButton } from './logout-button';

export function AuthGate() {
  const { status } = useAuth();

  if (status === 'undetermined') {
    return <LoadingCard />;
  }

  if (status === 'unauthenticated') {
    return <AuthScreen />;
  }

  return <ChatShell headerAction={<LogoutButton />} />;
}
