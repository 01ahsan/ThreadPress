// Renders assets/icons/icon.svg to the PNG sizes browsers and stores need.
// Run manually after changing the SVG: node scripts/icons.mjs
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const svg = await readFile('assets/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  await page.locator('svg').screenshot({ path: `assets/icons/icon-${size}.png`, omitBackground: true });
}
await browser.close();
console.log('Icons written to assets/icons/');
