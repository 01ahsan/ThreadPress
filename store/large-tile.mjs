// Renders the optional 1400x560 large promotional tile: node store/large-tile.mjs
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const icon = await readFile('assets/icons/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 560 } });
await page.setContent(`<!doctype html><html><body style="margin:0">
<div style="width:1400px;height:560px;box-sizing:border-box;padding:80px 96px;background:linear-gradient(135deg,#1f4fb8,#3b6fe0);color:#fff;font-family:system-ui,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;gap:72px">
  <div style="width:220px;height:220px;flex:none;background:#fff;border-radius:52px;padding:14px;box-sizing:border-box;box-shadow:0 20px 50px rgba(0,0,0,.25)">${icon}</div>
  <div>
    <div style="font-size:76px;font-weight:800;letter-spacing:-.02em;line-height:1">ThreadPress</div>
    <div style="font-size:42px;font-weight:650;margin-top:22px;line-height:1.2">Save your AI chats as PDF, Word &amp; Markdown</div>
    <div style="font-size:26px;opacity:.92;margin-top:22px">Equations, code and every language intact &middot; Free &middot; Private</div>
  </div>
</div></body></html>`);
await page.screenshot({ path: 'store/promo-1400x560.png' });
await browser.close();
console.log('Wrote store/promo-1400x560.png');
