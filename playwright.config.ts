import { defineConfig, devices } from '@playwright/test';

// Engine-independent suites (fuzz, stress, long chats) also run in Firefox and WebKit.
const CROSS_ENGINE = /(fuzz|stress|scale|long-chats|layouts)\.spec\.ts$/;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // On GitHub: failures and flaky tests also appear as annotations on the run, and a failing test
  // gets one retry (a pass on retry is still reported as "flaky", never hidden).
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  retries: process.env.CI ? 1 : 0,
  use: { acceptDownloads: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: CROSS_ENGINE },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: CROSS_ENGINE },
  ],
});
