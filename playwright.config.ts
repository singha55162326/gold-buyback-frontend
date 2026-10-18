import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  workers: 4,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Production server: faster and more stable than `next dev` for 100+ page loads.
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // NEXT_DIST_DIR keeps e2e builds out of `.next` so they never disturb a running dev
    // server or dirty tracked files. Consequence: the generated route types land in
    // `.next-e2e/types`, which is why tsconfig.json `include` lists that glob too (JSON
    // cannot carry a comment, so the explanation lives here).
    // Every API call goes to a host the tests intercept (see e2e/fixtures/api-mock.ts).
    env: { NEXT_PUBLIC_API_URL: 'http://api.mock', NEXT_DIST_DIR: '.next-e2e' },
  },
});
