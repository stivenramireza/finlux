import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the frontend's unit/component tests (dev-only tooling added
 * for the frontend-chat-integration send-flow tests). jsdom environment + RTL,
 * with the `@/` path alias mirroring tsconfig. The hard quality gate remains
 * `lint` + `build`; these tests cover the testable seams (`ChatApi` +
 * `ChatProvider`) with a mocked `authedFetch` (no live model).
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
