import { defineConfig } from '@playwright/test';

const portOffset = Number(process.env.E2E_PORT_OFFSET ?? 0);
const webPort = 5173 + portOffset;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  outputDir: 'output/playwright/test-results',
  reporter: [['list'], ['html', { outputFolder: 'output/playwright/report', open: 'never' }]],
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    { command: 'npx dotenv -e .env -- tsx scripts/e2e-services.ts', url: `http://127.0.0.1:${3003 + portOffset}/health`, reuseExistingServer: true, timeout: 120_000 },
    { command: `npm run dev --workspace @khoaluantn/web -- --host 127.0.0.1 --port ${webPort}`, url: `http://127.0.0.1:${webPort}`, reuseExistingServer: true, timeout: 120_000 },
  ],
});
