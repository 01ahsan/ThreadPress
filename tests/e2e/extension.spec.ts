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
  ['chatgpt', 'layout-2026', 'https://chatgpt.com/c/0f0e0d0c-1111-2222-3333-444455556666', 2],
  ['chatgpt', 'layout-2026-10', 'https://chatgpt.com/c/6add92d9-b1c0-83ee-a40c-212a9b647725', 4],
  ['claude', 'synthetic', 'https://claude.ai/chat/0b6f3c1e-0000-4000-8000-000000000001', 2],
  ['gemini', 'synthetic', 'https://gemini.google.com/app/1a2b3c4d5e6f', 2],
  ['grok', 'synthetic', 'https://grok.com/c/9f8e7d6c-0000-4000-8000-000000000002', 2],
  ['deepseek', 'synthetic', 'https://chat.deepseek.com/a/chat/s/0000-1111', 2],
  ['kimi', 'synthetic', 'https://www.kimi.com/chat/d0e1f2a3b4', 2],
];

for (const [site, fixture, url, count] of SITES) {
  test(`${site} (${fixture}): toolbar button opens the panel and exports Markdown under a strict CSP`, async () => {
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

test('floating button appears on chat pages only and opens the panel', async () => {
  const page = await context.newPage();
  const home = 'https://chatgpt.com/';
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u === CHAT_URL) {
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        headers: { 'content-security-policy': "default-src 'self'; script-src 'nonce-x'" },
        body: readFileSync('tests/fixtures/chatgpt/synthetic-mixed.html', 'utf8'),
      });
    }
    if (u === home)
      return route.fulfill({ contentType: 'text/html', body: '<title>ChatGPT</title><main>New chat</main>' });
    if (route.request().resourceType() === 'image')
      return route.fulfill({ contentType: 'image/png', body: PIXEL });
    return route.abort();
  });

  await page.goto(home);
  await page.waitForTimeout(2000);
  await expect(page.locator('threadpress-launcher')).toHaveCount(0);

  await page.goto(CHAT_URL);
  const launcher = page.locator('threadpress-launcher');
  await expect(launcher.getByRole('button', { name: 'ThreadPress: Export chat' })).toBeVisible();
  await launcher.getByRole('button', { name: 'ThreadPress: Export chat' }).hover();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/launcher-hover.png' });
  await launcher.getByRole('button', { name: 'ThreadPress: Export chat' }).click();
  await expect(page.locator('threadpress-panel').getByRole('dialog', { name: 'ThreadPress' })).toBeVisible();

  await page.keyboard.press('Escape');
  await launcher.getByRole('button', { name: 'ThreadPress: Export chat' }).hover();
  await launcher.getByRole('button', { name: 'Hide until the page reloads' }).click();
  await expect(page.locator('threadpress-launcher')).toHaveCount(0);
  await page.close();
});

test('Export icon next to each Copy button exports just that message and its question', async () => {
  const page = await context.newPage();
  await page.route('**/*', (route) => {
    if (route.request().url() === CHAT_URL) {
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        headers: {
          'content-security-policy':
            "default-src 'self'; script-src 'nonce-x'; require-trusted-types-for 'script'",
        },
        body: readFileSync('tests/fixtures/chatgpt/synthetic-mixed.html', 'utf8'),
      });
    }
    if (route.request().resourceType() === 'image')
      return route.fulfill({ contentType: 'image/png', body: PIXEL });
    return route.abort();
  });
  await page.goto(CHAT_URL);
  const icon = page.locator('threadpress-msg').getByRole('button', { name: 'Export this message' });
  await expect(icon).toHaveCount(1);
  // It sits right after the site's own Copy button.
  await expect(page.locator('[data-testid="copy-turn-action-button"] + threadpress-msg')).toHaveCount(1);
  await icon.click();
  const menu = page.locator('threadpress-menu');
  await expect(menu.getByRole('menu')).toBeVisible();
  await page.screenshot({ path: 'test-results/message-menu.png' });
  const dl = page.waitForEvent('download');
  await menu.getByRole('menuitem', { name: 'Markdown', exact: true }).click();
  const text = readFileSync(await (await dl).path(), 'utf8');
  expect(text).toContain('Explain E = mc^2 briefly.');
  expect(text).toContain('Mass–energy equivalence');
  expect(text).not.toContain('Sort \\[3, 1, 2\\]');
  await expect(menu).toHaveCount(0);
  await page.close();
});

test('ChatGPT (Oct 2026 layout): export icon after each Copy button, answer icon in the group toolbar', async () => {
  const page = await context.newPage();
  const url = 'https://chatgpt.com/c/6add92d9-b1c0-83ee-a40c-212a9b647725';
  await page.route('**/*', (route) =>
    route.request().url() === url
      ? route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: readFileSync('tests/fixtures/chatgpt/layout-2026-10.html', 'utf8'),
        })
      : route.abort(),
  );
  await page.goto(url);
  await expect(page.locator('threadpress-msg')).toHaveCount(3);
  await expect(page.locator('[data-testid="copy-turn-action-button"] + threadpress-msg')).toHaveCount(1);
  await page.locator('[data-testid="copy-turn-action-button"] + threadpress-msg').getByRole('button').click();
  const dl = page.waitForEvent('download');
  await page.locator('threadpress-menu').getByRole('menuitem', { name: 'Markdown', exact: true }).click();
  const text = readFileSync(await (await dl).path(), 'utf8');
  expect(text).toContain('What is 2 + 2?');
  expect(text).toContain('It is **4**.');
  expect(text).not.toContain('Six.');
  await page.close();
});
