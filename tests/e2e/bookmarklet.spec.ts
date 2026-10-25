// Runs the built bookmarklet against fixture pages served at the real site URLs.
// Every request is intercepted: the fixture is served locally and anything else fails the test.

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BOOKMARKLET = readFileSync('dist/bookmarklet.txt', 'utf8');
const CODE = decodeURIComponent(BOOKMARKLET.slice('javascript:'.length));
const CHAT_URL = 'https://chatgpt.com/c/6720aa00-1111-2222-3333-444455556666';

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/**
 * Serves a fixture with a strict CSP and Trusted Types, as the real chat sites do. Images get a
 * 1x1 pixel. Returns the list of requests made after the page finished loading: ThreadPress must
 * make none.
 */
async function openFixture(page: Page, fixture: string, url: string): Promise<string[]> {
  const afterLoad: string[] = [];
  let loaded = false;
  await page.route('**/*', (route) => {
    const req = route.request();
    if (loaded) afterLoad.push(req.url());
    if (req.url() === url) {
      return route.fulfill({
        contentType: 'text/html; charset=utf-8',
        headers: { 'content-security-policy': "script-src 'none'; require-trusted-types-for 'script'" },
        body: readFileSync(`tests/fixtures/${fixture}`, 'utf8'),
      });
    }
    if (req.resourceType() === 'image') return route.fulfill({ contentType: 'image/png', body: PIXEL });
    return route.abort();
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  loaded = true;
  return afterLoad;
}

/** Equivalent of clicking the bookmark (bookmarklets run outside the page's script-src policy). */
async function clickBookmarklet(page: Page): Promise<void> {
  await page.evaluate(CODE);
}

test('exports a ChatGPT conversation to Markdown with no network requests', async ({ page }) => {
  const requests = await openFixture(page, 'chatgpt/synthetic-mixed.html', CHAT_URL);
  await clickBookmarklet(page);

  const panel = page.locator('threadpress-panel');
  await expect(panel.getByRole('dialog', { name: 'ThreadPress' })).toBeVisible();
  await expect(panel.getByRole('definition').nth(1)).toHaveText('4');

  const downloadPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Export whole chat' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^chatgpt-Physics-notes-and-a-sorting-question-\d{4}-\d{2}-\d{2}\.md$/,
  );

  const text = readFileSync(await download.path(), 'utf8');
  const golden = readFileSync('tests/golden/chatgpt/synthetic-mixed.md', 'utf8');
  const strip = (s: string) => s.replace(/^exported: .*$/m, '');
  expect(strip(text)).toBe(strip(golden));
  await expect(panel.getByRole('status')).toContainText('Saved 4 messages');
  expect(requests).toEqual([]);
});

test('exports JSON and plain text, and the panel toggles and closes with Escape', async ({ page }) => {
  await openFixture(page, 'chatgpt/synthetic-mixed.html', CHAT_URL);
  await clickBookmarklet(page);
  const panel = page.locator('threadpress-panel');

  for (const [label, ext] of [
    ['JSON (.json)', 'json'],
    ['Plain text (.txt)', 'txt'],
  ] as const) {
    await panel.getByLabel(label).check();
    const dl = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'Export whole chat' }).click();
    expect((await dl).suggestedFilename().endsWith(`.${ext}`)).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(panel.getByRole('dialog')).toHaveCount(0);
  await clickBookmarklet(page);
  await expect(panel.getByRole('dialog')).toBeVisible();
});

test('exports only the highlighted selection, without refetching its images', async ({ page }) => {
  const requests = await openFixture(page, 'chatgpt/synthetic-mixed.html', CHAT_URL);
  await page.evaluate(() => {
    const target = document.querySelector('[data-message-id="u2"]')!;
    const range = document.createRange();
    range.selectNodeContents(target);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  await clickBookmarklet(page);
  const panel = page.locator('threadpress-panel');
  const dl = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Export selection' }).click();
  const text = readFileSync(await (await dl).path(), 'utf8');
  expect(text).toContain('Sort \\[3, 1, 2\\] in JS');
  expect(text).toContain('*[Image: Uploaded image]*');
  expect(text).not.toContain('Mass–energy');
  expect(requests).toEqual([]);
});

test('the panel is keyboard operable', async ({ page }) => {
  await openFixture(page, 'chatgpt/synthetic-mixed.html', CHAT_URL);
  await clickBookmarklet(page);
  const panel = page.locator('threadpress-panel');
  await expect(panel.getByLabel('Markdown (.md)')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(panel.getByLabel('JSON (.json)')).toBeChecked();
});

test('the install page link is exactly the bookmarklet', async ({ page }) => {
  await page.goto(pathToFileURL('docs/index.html').href);
  await expect(page.locator('h1')).toHaveCount(1);
  const href = await page.getByRole('link', { name: 'ThreadPress', exact: true }).getAttribute('href');
  expect(href).toBe(BOOKMARKLET);
});
