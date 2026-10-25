// Scroll and interface stress against hostile simulated chat pages (tests/stress/pages.ts).
// Runs in Chromium, Firefox and WebKit through the bookmarklet build. Every test also fails on
// any uncaught page error.

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as pages from '../stress/pages';

const CODE = decodeURIComponent(readFileSync('dist/bookmarklet.txt', 'utf8').slice('javascript:'.length));

async function serve(page: Page, path: string, html: string): Promise<string[]> {
  const url = `https://chatgpt.com${path}`;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) =>
    route.request().url().startsWith('https://chatgpt.com/c/')
      ? route.fulfill({ contentType: 'text/html; charset=utf-8', body: html })
      : route.abort(),
  );
  await page.goto(url);
  return errors;
}

async function openPanel(page: Page) {
  await page.evaluate(CODE);
  const panel = page.locator('threadpress-panel');
  await panel.getByRole('dialog').waitFor();
  return panel;
}

async function exportJson(page: Page, timeout: number): Promise<{ title: string; texts: string[] }> {
  const panel = page.locator('threadpress-panel');
  await panel.locator('label.fmt', { hasText: 'JSON' }).click();
  const dl = page.waitForEvent('download', { timeout });
  await panel.getByRole('button', { name: /^Export JSON$/ }).click();
  const conv = JSON.parse(readFileSync(await (await dl).path(), 'utf8'));
  return {
    title: conv.title,
    texts: conv.messages.map((m: { blocks: { inlines?: { text?: string }[] }[] }) =>
      (m.blocks[0]?.inlines?.map((x) => x.text ?? '').join('') ?? '').split(' ').slice(0, 2).join(' '),
    ),
  };
}

const expected = (i: number) => `${i % 2 ? 'Answer' : 'Question'} ${i}`;

test('2,000-message virtual list with random render delays and varying heights', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await serve(page, '/c/virtual', pages.virtualJitter(2000, 7));
  await openPanel(page);
  const t0 = Date.now();
  const { texts } = await exportJson(page, 280_000);
  console.log(`virtual 2000: ${Math.round((Date.now() - t0) / 1000)} s`);
  expect(texts.length).toBe(2000);
  texts.forEach((t, i) => expect(t).toBe(expected(i)));
  expect(errors).toEqual([]);
});

test('1,000 messages loading slowly and unreliably (random latency, failed loads)', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = await serve(page, '/c/flaky', pages.flakyLazy(1000, 25, 11));
  await openPanel(page);
  const { texts } = await exportJson(page, 280_000);
  const stats = await page.evaluate(() => ({
    loads: (window as never)['__loads'],
    failed: (window as never)['__failed'],
  }));
  console.log(`flaky lazy: ${JSON.stringify(stats)}`);
  expect(texts.length).toBe(1000);
  texts.forEach((t, i) => expect(t).toBe(expected(i)));
  expect(errors).toEqual([]);
});

test('list that recycles the same elements for different messages', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await serve(page, '/c/recycled', pages.recycled(600));
  await openPanel(page);
  const { texts } = await exportJson(page, 170_000);
  expect(texts.length).toBe(600);
  texts.forEach((t, i) => expect(t).toBe(expected(i)));
  expect(errors).toEqual([]);
});

test('exporting while a reply is still streaming in', async ({ page }) => {
  const errors = await serve(page, '/c/streaming', pages.streaming(60));
  await openPanel(page);
  const { texts } = await exportJson(page, 60_000);
  expect(texts.length).toBeGreaterThanOrEqual(61);
  texts.slice(0, 60).forEach((t, i) => expect(t).toBe(expected(i)));
  expect(errors).toEqual([]);
});

test('identical messages without ids are all kept', async ({ page }) => {
  const errors = await serve(page, '/c/dupes', pages.duplicates(30));
  await openPanel(page);
  const { texts } = await exportJson(page, 60_000);
  expect(texts.length).toBe(30);
  expect(errors).toEqual([]);
});

test('cancel during a slow load, then export again', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = await serve(page, '/c/cancel', pages.flakyLazy(300, 40, 3, 1200, 1500));
  const panel = await openPanel(page);
  await panel.locator('label.fmt', { hasText: 'JSON' }).click();
  await panel.getByRole('button', { name: /^Export JSON$/ }).click();
  await page.waitForTimeout(2500);
  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel.getByRole('status')).toContainText('Cancelled', { timeout: 5000 });
  const { texts } = await exportJson(page, 170_000);
  expect(texts.length).toBe(300);
  expect(errors).toEqual([]);
});

test('opening and closing the panel 25 times quickly', async ({ page }) => {
  const errors = await serve(page, '/c/toggle', pages.duplicates(4));
  for (let i = 0; i < 25; i++) await page.evaluate(CODE);
  await expect(page.locator('threadpress-panel')).toHaveCount(1);
  // 25 toggles from closed leaves it open.
  await expect(page.locator('threadpress-panel').getByRole('dialog')).toBeVisible();
  const { texts } = await exportJson(page, 30_000);
  expect(texts.length).toBe(4);
  expect(errors).toEqual([]);
});

test('switching chats without a page reload', async ({ page }) => {
  const errors = await serve(page, '/c/first-chat', pages.spa());
  await page.evaluate(() => (window as never as { __go: () => void }).__go());
  await openPanel(page);
  const { title, texts } = await exportJson(page, 30_000);
  expect(title).toBe('Second chat');
  expect(texts).toEqual(Array.from({ length: 10 }, (_, k) => expected(100 + k)));
  expect(errors).toEqual([]);
});

test('page with no conversation: clear notice, export disabled', async ({ page }) => {
  const errors = await serve(page, '/c/', pages.empty());
  const panel = await openPanel(page);
  await expect(panel.getByRole('button', { name: /^Export / })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('phone-sized window: the panel fits and stays usable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const errors = await serve(page, '/c/phone', pages.duplicates(6));
  const panel = await openPanel(page);
  const box = await panel.locator('.panel').boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  expect(box!.y + box!.height).toBeLessThanOrEqual(640);
  await panel.getByRole('button', { name: /^Export / }).scrollIntoViewIfNeeded();
  await expect(panel.getByRole('button', { name: /^Export / })).toBeInViewport();
  expect(errors).toEqual([]);
});
