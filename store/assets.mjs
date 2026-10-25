// Generates store images from the built extension and store/demo.html:
//   store/screenshots/1-panel.png … 5-pdf.png   (1280x800)
//   store/promo-440x280.png
// Run after `npm run build`: node store/assets.mjs

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EXT = resolve('dist/extension');
const URL_ = 'https://chatgpt.com/c/0d3e0000-0000-4000-8000-00000000demo';
const OUT = 'store/screenshots';
mkdirSync(OUT, { recursive: true });

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  viewport: { width: 1280, height: 800 },
  acceptDownloads: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const page = await context.newPage();
await page.route('**/*', (r) =>
  r.request().url() === URL_
    ? r.fulfill({ contentType: 'text/html; charset=utf-8', body: readFileSync('store/demo.html', 'utf8') })
    : r.abort(),
);
await page.goto(URL_);
await page.waitForTimeout(1500);

// 1. Panel with formats.
await page.locator('threadpress-launcher').getByRole('button', { name: 'ThreadPress: Export chat' }).click();
const panel = page.locator('threadpress-panel');
await panel.getByRole('dialog').waitFor();
await page.mouse.move(640, 760);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/1-panel.png` });

// 2. Choose messages.
await panel.getByRole('radio', { name: 'Choose messages' }).click();
await panel.locator('.msgs li').first().waitFor();
await panel.locator('label.fmt', { hasText: 'Word' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/2-choose-messages.png` });
await page.keyboard.press('Escape');

// 3. Export one message from its own toolbar.
await page.locator('threadpress-msg').first().getByRole('button').click();
await page.locator('threadpress-menu').getByRole('menu').waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/3-one-message.png` });
await page.keyboard.press('Escape');

// 4 and 5. The exported HTML and its print (PDF) view.
await page.locator('threadpress-launcher').getByRole('button', { name: 'ThreadPress: Export chat' }).click();
await panel.locator('label.fmt', { hasText: 'HTML' }).click();
const dl = page.waitForEvent('download');
await panel.getByRole('button', { name: 'Export HTML' }).click();
const file = await (await dl).path();
const doc = await context.newPage();
await doc.setViewportSize({ width: 1280, height: 800 });
await doc.setContent(readFileSync(file, 'utf8'));
await doc.screenshot({ path: `${OUT}/4-export.png` });
// Show the PDF layout as a sheet of paper.
await doc.addStyleTag({
  content:
    'body{background:#dfe2e8!important}.tp-doc{max-width:794px!important;margin:28px auto!important;padding:60px 64px!important;border-radius:3px!important;box-shadow:0 10px 40px rgba(0,0,0,.18)!important}',
});
await doc.screenshot({ path: `${OUT}/5-pdf-page.png` });

// Promo tile.
const icon = readFileSync('assets/icons/icon.svg', 'utf8');
const tile = await context.newPage();
await tile.setViewportSize({ width: 440, height: 280 });
await tile.setContent(`<!doctype html><html><body style="margin:0">
  <div style="width:440px;height:280px;box-sizing:border-box;padding:34px 36px;background:linear-gradient(135deg,#1f4fb8,#3b6fe0);color:#fff;font-family:system-ui,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;justify-content:space-between">
    <div style="display:flex;align-items:center;gap:14px"><div style="width:56px;height:56px;background:#fff;border-radius:16px;padding:4px;box-sizing:border-box">${icon}</div>
      <div style="font-size:30px;font-weight:800;letter-spacing:-.02em">ThreadPress</div></div>
    <div style="font-size:21px;font-weight:650;line-height:1.3">Save your AI chats as PDF, Word &amp; Markdown</div>
    <div style="font-size:14px;opacity:.9">Equations, code and every language intact · Free · Private</div>
  </div></body></html>`);
await tile.screenshot({ path: 'store/promo-440x280.png' });

await context.close();
console.log('Store images written to store/');
