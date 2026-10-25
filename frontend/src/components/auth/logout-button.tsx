'use client';

/**
 * Logout control (Req 5). A secondary OUTLINE button (so it does not compete
 * with the chat's primary send action), shown in the chat header when
 * authenticated. Calls the provider's client-side `logout` (no backend call).
 */
import { useAuth } from '@/lib/auth/auth-provider';

export function LogoutButton() {
  const { logout } = useAuth();

  return (
    <button
      type="button"
      onClick={logout}
      className="border-brand/60 text-foreground hover:bg-brand-tint focus-visible:ring-brand focus-visible:ring-offset-background shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      Log out
    </button>
  );
}
