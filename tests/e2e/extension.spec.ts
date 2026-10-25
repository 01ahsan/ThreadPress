// Loads the built extension into Chromium and exports from a fixture served at the real
// ChatGPT address, with the same kind of strict security policy ChatGPT uses.

import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXT = resolve('dist/extension');
const CHAT_URL = 'https://chatgpt.com/c/6720aa00-1111-2222-3333-444455556666';
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

// One browser with the extension, shared by every test in this file.
test.describe.configure({ mode: 'serial' });

let context: BrowserContext;
let worker: Worker;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    acceptDownloads: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  for (let i = 0; i < 100 && !context.serviceWorkers()[0]; i++) await new Promise((r) => setTimeout(r, 100));
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
});

test.afterAll(async () => {
  await context.close();
});

const SITES: [string, string, string, number][] = [
  ['chatgpt', 'synthetic-mixed', CHAT_URL, 4],
  ['claude', 'synthetic', 'https://claude.ai/chat/0b6f3c1e-0000-4000-8000-000000000001', 2],
  ['gemini', 'synthetic', 'https://gemini.google.com/app/1a2b3c4d5e6f', 2],
  ['grok', 'synthetic', 'https://grok.com/c/9f8e7d6c-0000-4000-8000-000000000002', 2],
  ['deepseek', 'synthetic', 'https://chat.deepseek.com/a/chat/s/0000-1111', 2],
  ['kimi', 'synthetic', 'https://www.kimi.com/chat/d0e1f2a3b4', 2],
];

for (const [site, fixture, url, count] of SITES) {
  test(`${site}: toolbar button opens the panel and exports Markdown under a strict CSP`, async () => {
    const page = await context.newPage();
    const afterLoad: string[] = [];
    let loaded = false;
    await page.route('**/*', (route) => {
      const req = route.request();
      if (loaded) afterLoad.push(req.url());
      if (req.url() === url) {
        return route.fulfill({
          contentType: 'text/html; charset=utf-8',
          headers: {
            'content-security-policy':
              "default-src 'self'; script-src 'nonce-abc123' 'self'; require-trusted-types-for 'script'",
          },
          body: readFileSync(`tests/fixtures/${site}/${fixture}.html`, 'utf8'),
        });
      }
      if (req.resourceType() === 'image') return route.fulfill({ contentType: 'image/png', body: PIXEL });
      return route.abort();
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    loaded = true;

    // Same code path as clicking the toolbar button.
    await page.bringToFront();
    await worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      await chrome.tabs.sendMessage(tab!.id!, 'threadpress:toggle');
    });

    const panel = page.locator('threadpress-panel');
    await expect(panel.getByRole('dialog', { name: 'ThreadPress' })).toBeVisible();
    // The page's CSP must not strip the panel's styles.
    await expect(panel.locator('.panel')).toHaveCSS('position', 'fixed');
    await expect(panel.locator('.sub')).toContainText(`${count} messages`);
    await page.screenshot({ path: `test-results/panel-${site}.png` });

    await panel.locator('label.fmt', { hasText: 'Markdown' }).click();
    const download = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'Export Markdown' }).click();
    const text = readFileSync(await (await download).path(), 'utf8');
    const strip = (s: string) => s.replace(/^exported: .*$/m, '');
    expect(strip(text)).toBe(strip(readFileSync(`tests/golden/${site}/${fixture}.md`, 'utf8')));

    await panel.getByRole('radio', { name: 'Choose messages' }).click();
    await expect(panel.locator('.msgs li')).toHaveCount(count);
    await page.screenshot({ path: `test-results/picker-${site}.png` });
    expect(afterLoad).toEqual([]);
    await page.close();
  });
}

test('manifest asks for no permissions', () => {
  const manifest = JSON.parse(readFileSync('dist/extension/manifest.json', 'utf8'));
  expect(manifest.permissions).toBeUndefined();
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.optional_permissions).toBeUndefined();
});
