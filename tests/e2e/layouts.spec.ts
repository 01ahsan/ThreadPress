// Copies of real site structures that need a real browser layout to read correctly
// (for example rows positioned by coordinates). Runs in Chromium, Firefox and WebKit.

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const CODE = decodeURIComponent(readFileSync('dist/bookmarklet.txt', 'utf8').slice('javascript:'.length));

test('Grok (Oct 2026): reading order follows the screen, not the order rows are stored in', async ({
  page,
}) => {
  const url = 'https://grok.com/c/0a1b2c3d-0000-4000-8000-000000000003';
  await page.route('**/*', (r) =>
    r.request().url() === url
      ? r.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: readFileSync('tests/fixtures/grok/layout-2026-10.html', 'utf8'),
        })
      : r.abort(),
  );
  await page.goto(url);
  await page.evaluate(CODE);
  const panel = page.locator('threadpress-panel');
  await panel.locator('label.fmt', { hasText: 'Markdown' }).click();
  const dl = page.waitForEvent('download', { timeout: 60_000 });
  await panel.getByRole('button', { name: /^Export Markdown$/ }).click();
  const md = readFileSync(await (await dl).path(), 'utf8');

  const order = ['FIRST QUESTION', 'FIRST ANSWER', 'SECOND QUESTION', 'SECOND ANSWER'].map((s) =>
    md.indexOf(s),
  );
  expect(order.every((at) => at >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
  expect(md.match(/^## /gm)?.length).toBe(4);
  expect(md).toContain('## You\n\nFIRST QUESTION');
  // No screen-reader labels, buttons or invisible characters.
  expect(md).not.toMatch(/^(Grok|You)$/m);
  expect(md).not.toMatch(/48 sources|Thought for|Copy response/);
  expect(md).not.toMatch(/\u2060/);
  expect(md).toContain('[Example](https://example.org/pop)');
});
