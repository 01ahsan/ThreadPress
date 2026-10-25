import { defineConfig, devices } from '@playwright/test';

// Engine-independent suites (fuzz, stress, long chats) also run in Firefox and WebKit.
const CROSS_ENGINE = /(fuzz|stress|scale|long-chats)\.spec\.ts$/;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { acceptDownloads: true },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testMatch: CROSS_ENGINE },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: CROSS_ENGINE },
  ],
});
