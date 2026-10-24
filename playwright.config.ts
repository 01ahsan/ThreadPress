import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { acceptDownloads: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
