import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node --import tsx scripts/dev.ts',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    timeout: 45000,
    env: {
      NODE_ENV: 'test',
      PGLITE_PATH: 'memory://',
      DEMO_MODE: 'true',
      APP_URL: 'http://127.0.0.1:5174',
      VITE_PORT: '5174',
      PORT: '3002',
      DATABASE_URL: '',
    },
  },
});
