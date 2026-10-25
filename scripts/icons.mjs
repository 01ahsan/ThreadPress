// Renders assets/icons/icon.svg to the PNG sizes browsers and stores need.
// Run manually after changing the SVG: node scripts/icons.mjs
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const svg = await readFile('assets/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
// The 128 px icon is the store icon: Chrome's guideline is 96 px of artwork with 16 px of
// transparent padding. Toolbar sizes stay full-bleed so they remain crisp.
const PADDING = { 16: 0, 32: 0, 48: 0, 128: 16 };
for (const [size, pad] of Object.entries(PADDING).map(([s, p]) => [Number(s), p])) {
  const art = size - 2 * pad;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${art}px;height:${art}px;margin:${pad}px}</style>${svg}`,
  );
  await page.screenshot({
    path: `assets/icons/icon-${size}.png`,
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  });
}
await browser.close();
console.log('Icons written to assets/icons/');
