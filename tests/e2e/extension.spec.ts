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

let context: BrowserContext;
let worker: Worker;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    acceptDownloads: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
});

test.afterAll(async () => {
  await context.close();
});

test('toolbar button opens the panel and exports Markdown under a strict CSP', async () => {
  const page = await context.newPage();
  const afterLoad: string[] = [];
  let loaded = false;
  await page.route('**/*', (route) => {
    const req = route.request();
    if (loaded) afterLoad.push(req.url());
    if (req.url() === CHAT_URL) {
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        headers: {
          'content-security-policy':
            "default-src 'self'; script-src 'nonce-abc123' 'self'; require-trusted-types-for 'script'",
        },
        body: readFileSync('tests/fixtures/chatgpt/synthetic-mixed.html', 'utf8'),
      });
    }
    if (req.resourceType() === 'image') return route.fulfill({ contentType: 'image/png', body: PIXEL });
    return route.abort();
  });
  await page.goto(CHAT_URL, { waitUntil: 'networkidle' });
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
  await page.screenshot({ path: 'test-results/panel-extension.png' });
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Export whole chat' }).click();
  const text = readFileSync(await (await download).path(), 'utf8');
  const strip = (s: string) => s.replace(/^exported: .*$/m, '');
  expect(strip(text)).toBe(strip(readFileSync('tests/golden/chatgpt/synthetic-mixed.md', 'utf8')));
  expect(afterLoad).toEqual([]);
});

test('manifest asks for no permissions', () => {
  const manifest = JSON.parse(readFileSync('dist/extension/manifest.json', 'utf8'));
  expect(manifest.permissions).toBeUndefined();
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.optional_permissions).toBeUndefined();
});
