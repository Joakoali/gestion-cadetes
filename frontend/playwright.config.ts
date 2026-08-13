import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

// Loads frontend/.env.test (gitignored, disposable e2e-only VAPID keypair —
// see .env.test for how it was generated). Does not override variables
// already present in the environment (e.g. set by CI), matching dotenv's
// default behavior.
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error(
    'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set to run the e2e smoke test. ' +
      'Generate a disposable keypair with `npx web-push generate-vapid-keys` (from backend/) ' +
      'and put it in frontend/.env.test — do NOT reuse the real key from backend/.env.test.',
  );
}

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  use: { baseURL: 'http://localhost:3000' },
  webServer: [
    {
      command: 'npm run start:dev',
      cwd: '../backend',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        DATABASE_URL:
          process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/cadetes_test',
        JWT_SECRET: 'e2e-secret',
        VAPID_SUBJECT: 'mailto:test@example.com',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY,
        FRONTEND_ORIGIN: 'http://localhost:3000',
        RESEND_API_KEY: 'test-key-unused',
        MAIL_FROM: 'Test <test@example.com>',
        PORT: '3001',
      },
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { NEXT_PUBLIC_API_URL: 'http://localhost:3001' },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
