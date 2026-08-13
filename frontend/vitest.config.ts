import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true,
    exclude: ['**/node_modules/**', '**/e2e/**'],
    // lib/api/client.ts throws at module load time if this is unset (see
    // frontend/.env.local.example) — MSW intercepts every request in tests
    // regardless of the base URL's value, so this just needs to be a
    // syntactically valid, non-empty origin.
    env: { NEXT_PUBLIC_API_URL: 'http://localhost:3001' },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
