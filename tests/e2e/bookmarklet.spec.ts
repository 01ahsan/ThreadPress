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

/** Equivalent of clicking the bookmark (Firefox runs bookmarklets outside the page's script policy). */
async function clickBookmarklet(page: Page) {
  await page.evaluate(CODE);
  return page.locator('threadpress-panel');
}

async function downloadText(page: Page, click: () => Promise<void>): Promise<{ name: string; text: string }> {
  const dl = page.waitForEvent('download');
  await click();
  const d = await dl;
  return { name: d.suggestedFilename(), text: readFileSync(await d.path(), 'utf8') };
}

const strip = (s: string) => s.replace(/^exported: .*$/m, '');

test('exports the whole chat to Markdown with no network requests', async ({ page }) => {
  const requests = await openFixture(page, 'chatgpt/synthetic-mixed.html', CHAT_URL);
  const panel = await clickBookmarklet(page);
  await expect(panel.getByRole('dialog', { name: 'ThreadPress' })).toBeVisible();
  await expect(panel.locator('.sub')).toHaveText('ChatGPT · 4 messages');

  await panel.locator('label.fmt', { hasText: 'Markdown' }).click();
  const { name, text } = await downloadText(page, () =>
    panel.getByRole('button', { name: 'Export Markdown' }).click(),
  );
  expect(name).toMatch(/^chatgpt-Physics-notes-and-a-sorting-question-\d{4}-\d{2}-\d{2}\.md$/);
  expect(strip(text)).toBe(strip(readFileSync('tests/golden/chatgpt/synthetic-mixed.md', 'utf8')));
  await expect(panel.getByRole('status')).toContainText('Saved');
  expect(requests).toEqual([]);
});

test('exports Word, HTML, LaTeX, JSON and text files', async ({ page }) => {
  await openFixture(page, 'chatgpt/synthetic-mixed.html', CHAT_URL);
  const panel = await clickBookmarklet(page);
  for (const [label, ext] of [
    ['Word', 'docx'],
    ['HTML', 'html'],
    ['LaTeX', 'tex'],
    ['JSON', 'json'],
    ['Text', 'txt'],
  ] as const) {
    await panel.locator('label.fmt', { hasText: label }).click();
    const { name } = await downloadText(page, () =>
      panel.getByRole('button', { name: `Export ${label}` }).click(),
    );
    expect(name.endsWith(`.${ext}`)).toBe(true);
  }
});

test('PDF opens the print view', async ({ page }) => {
  await openFixture(page, 'chatgpt/synthetic-mixed.html', CHAT_URL);
  const panel = await clickBookmarklet(page);
  await panel.getByRole('button', { name: 'Export PDF' }).click();
  await expect(panel.getByRole('status')).toContainText('Save as PDF');
});

test('choose messages: only my prompts', async ({ page }) => {
  await openFixture(page, 'chatgpt/synthetic-mixed.html', CHAT_URL);
  const panel = await clickBookmarklet(page);
  await panel.getByRole('radio', { name: 'Choose messages' }).click();
  await expect(panel.locator('.msgs li')).toHaveCount(4);
  await panel.getByRole('button', { name: 'My prompts' }).click();
  await expect(panel.locator('.count')).toHaveText('2 of 4 selected');
  await panel.locator('label.fmt', { hasText: 'Markdown' }).click();
  const { text } = await downloadText(page, () =>
    panel.getByRole('button', { name: 'Export 2 as Markdown' }).click(),
  );
  expect(text).toContain('Explain E = mc^2');
  expect(text).toContain('Sort \\[3, 1, 2\\] in JS');
  expect(text).not.toContain('Mass–energy');
});

test('exports only the highlighted text, without refetching its images', async ({ page }) => {
  const requests = await openFixture(page, 'chatgpt/synthetic-mixed.html', CHAT_URL);
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('[data-message-id="u2"]')!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  });
  const panel = await clickBookmarklet(page);
  await expect(panel.getByRole('radio', { name: 'Highlighted' })).toHaveAttribute('aria-checked', 'true');
  await panel.locator('label.fmt', { hasText: 'Markdown' }).click();
  const { text } = await downloadText(page, () =>
    panel.getByRole('button', { name: 'Export Markdown' }).click(),
  );
  expect(text).toContain('Sort \\[3, 1, 2\\] in JS');
  expect(text).toContain('*[Image: Uploaded image]*');
  expect(text).not.toContain('Mass–energy');
  expect(requests).toEqual([]);
});

test('the panel is keyboard operable and toggles', async ({ page }) => {
  await openFixture(page, 'chatgpt/synthetic-mixed.html', CHAT_URL);
  const panel = await clickBookmarklet(page);
  await expect(panel.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel.getByRole('dialog')).toHaveCount(0);
  await clickBookmarklet(page);
  await expect(panel.getByRole('dialog')).toBeVisible();
});

test('the install page link is exactly the bookmarklet', async ({ page }) => {
  await page.goto(pathToFileURL('docs/index.html').href);
  await expect(page.locator('h1')).toHaveCount(1);
  const href = await page.getByRole('link', { name: 'ThreadPress', exact: true }).getAttribute('href');
  expect(href).toBe(BOOKMARKLET);
});
