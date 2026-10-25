// Long conversations: sites that load older messages on scroll, and sites that keep only the
// visible messages in the page. ThreadPress must export every message, in order.

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const CODE = decodeURIComponent(readFileSync('dist/bookmarklet.txt', 'utf8').slice('javascript:'.length));

async function exportJson(page: Page, fixture: string, url: string) {
  await page.route('**/*', (route) =>
    route.request().url() === url
      ? route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: readFileSync(`tests/fixtures/${fixture}`, 'utf8'),
        })
      : route.abort(),
  );
  await page.goto(url);
  await page.evaluate(CODE);
  const panel = page.locator('threadpress-panel');
  await panel.locator('label.fmt', { hasText: 'JSON' }).click();
  const dl = page.waitForEvent('download', { timeout: 120_000 });
  await panel.getByRole('button', { name: 'Export JSON' }).click();
  const conv = JSON.parse(readFileSync(await (await dl).path(), 'utf8'));
  return conv.messages.map((m: { blocks: { inlines?: { text?: string }[] }[] }) =>
    (m.blocks[0]?.inlines?.[0]?.text ?? '').split(' ').slice(0, 2).join(' '),
  ) as string[];
}

test('loads 300 messages from a chat that fetches older messages on scroll', async ({ page }) => {
  test.setTimeout(150_000);
  const texts = await exportJson(page, 'virtual/lazy-top.html', 'https://chatgpt.com/c/long-chat');
  expect(texts.length).toBe(300);
  texts.forEach((t, i) => expect(t).toBe(`${i % 2 === 0 ? 'Question' : 'Answer'} ${i}`));
});

test('reads 400 messages from a virtual list that keeps only visible messages', async ({ page }) => {
  test.setTimeout(150_000);
  const texts = await exportJson(page, 'virtual/windowed.html', 'https://chat.deepseek.com/a/chat/s/long');
  expect(texts.length).toBe(400);
  texts.forEach((t, i) => expect(t).toBe(`${i % 2 === 0 ? 'Question' : 'Answer'} ${i}`));
});
