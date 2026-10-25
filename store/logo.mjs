// Renders the 300x300 store logo Microsoft Edge Add-ons asks for: node store/logo.mjs
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const svg = await readFile('assets/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 300, height: 300 } });
// Same padding ratio as the Chrome store icon (96 of 128).
await page.setContent(
  `<style>html,body{margin:0;background:transparent}svg{display:block;width:226px;height:226px;margin:37px}</style>${svg}`,
);
await page.screenshot({ path: 'store/logo-300.png', omitBackground: true, clip: { x: 0, y: 0, width: 300, height: 300 } });
await browser.close();
console.log('Wrote store/logo-300.png');
