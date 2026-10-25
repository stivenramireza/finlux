/**
 * Backend API configuration (Design: Decision F).
 *
 * The backend base URL comes from the `NEXT_PUBLIC_API_BASE_URL` environment
 * variable (it must be `NEXT_PUBLIC_`-prefixed to be readable in the browser
 * under Next.js). There is no hard-coded fallback: a missing value is a
 * configuration error we surface clearly and early.
 */

/**
 * Returns the backend base URL, without a trailing slash. Throws a clear error
 * if `NEXT_PUBLIC_API_BASE_URL` is missing/empty at runtime.
 */
export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!raw || raw.trim().length === 0) {
    throw new Error(
      'Missing NEXT_PUBLIC_API_BASE_URL. Set it in frontend/.env ' +
        '(see frontend/.env.example) to the Finlux backend base URL.',
    );
  }

  // Normalize: drop any trailing slash so callers can join paths with a leading slash.
  return raw.trim().replace(/\/+$/, '');
}
