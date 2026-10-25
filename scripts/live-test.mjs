// Real-site test with the dedicated test accounts (see scripts/live.mjs).
// Opens each test chat, exports it through ThreadPress's own buttons, and writes the files,
// screenshots and a summary to test-results/live/. Read-only: it never sends a message.
//
//   npm run build && node scripts/live-test.mjs [chatgpt|claude|gemini]

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openLive } from './live.mjs';

const OUT = 'test-results/live';
const SITES = {
  chatgpt: { home: 'https://chatgpt.com/', links: 'nav a[href*="/c/"], a[href*="/c/"]' },
  claude: { home: 'https://claude.ai/recents', links: 'a[href*="/chat/"]' },
  gemini: { home: 'https://gemini.google.com/app', links: 'a[href*="/app/"]' },
  grok: { home: 'https://grok.com/', links: 'a[href*="/c/"]' },
  deepseek: { home: 'https://chat.deepseek.com/', links: 'a[href*="/chat/s/"]' },
  kimi: { home: 'https://www.kimi.com/', links: 'a[href*="/chat/"]' },
};
const only = process.argv[2];
const MAX_CHATS = 6;
const FORMATS = [
  ['Markdown', 'md'],
  ['Word', 'docx'],
  ['HTML', 'html'],
  ['LaTeX', 'tex'],
  ['Text', 'txt'],
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const ctx = await openLive(false);
const page = ctx.pages()[0] ?? (await ctx.newPage());
const report = [];

for (const [site, cfg] of Object.entries(SITES)) {
  if (only && only !== site) continue;
  await page.goto(cfg.home, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // The chat list can load slowly: wait until it appears (up to 25 s), then a moment more.
  await page.waitForSelector(cfg.links, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const chats = await page.$$eval(cfg.links, (as) => [...new Set(as.map((a) => a.href))]);
  console.log(`${site}: ${chats.length} chats`);

  for (const [i, url] of chats.slice(0, MAX_CHATS).entries()) {
    const tag = `${site}-${i + 1}`;
    const row = { site, chat: i + 1 };
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const launcher = page.locator('threadpress-launcher').getByRole('button', { name: /Export chat/ });
      await launcher.waitFor({ timeout: 30000 });
      await page.waitForTimeout(2500);
      row.exportIcons = await page.locator('threadpress-msg').count();
      await page.screenshot({ path: join(OUT, `${tag}-page.png`) });

      await launcher.click();
      const panel = page.locator('threadpress-panel');
      await panel.getByRole('dialog').waitFor();

      // JSON first: it is the full structured result, used for the checks below.
      const t0 = Date.now();
      const json = await exportAs(panel, 'JSON', 'json', tag, 240000);
      row.seconds = Math.round((Date.now() - t0) / 100) / 10;
      const conv = JSON.parse(readFileSync(json, 'utf8'));
      const roles = conv.messages.map((m) => m.role);
      row.title = conv.title.slice(0, 40);
      row.messages = roles.length;
      row.prompts = roles.filter((r) => r === 'user').length;
      row.answers = roles.filter((r) => r === 'assistant').length;
      row.startsWithPrompt = roles[0] === 'user';
      row.alternates = roles.every((r, k) => k === 0 || r !== roles[k - 1]);
      row.emptyMessages = conv.messages.filter((m) => !m.blocks.length).length;
      const blocks = JSON.stringify(conv);
      row.maths = (blocks.match(/"type":"math"/g) ?? []).length;
      row.codeBlocks =
        (blocks.match(/"type":"code","language"/g) ?? []).length +
        (blocks.match(/"type":"code","text"/g) ?? []).length;
      row.tables = (blocks.match(/"type":"table"/g) ?? []).length;

      for (const [label, ext] of i === 0 ? FORMATS : FORMATS.slice(0, 1))
        await exportAs(panel, label, ext, tag, 120000);
      await page.screenshot({ path: join(OUT, `${tag}-panel.png`) });
      await page.keyboard.press('Escape');

      // One message from its own toolbar.
      if (row.exportIcons > 0) {
        await page.locator('threadpress-msg').last().getByRole('button').click();
        const menu = page.locator('threadpress-menu');
        await menu.getByRole('menu').waitFor({ timeout: 5000 });
        await page.screenshot({ path: join(OUT, `${tag}-message-menu.png`) });
        const dl = page.waitForEvent('download', { timeout: 60000 });
        await menu.getByRole('menuitem', { name: 'Markdown', exact: true }).click();
        await (await dl).saveAs(join(OUT, `${tag}-one-message.md`));
        row.oneMessageExport = 'ok';
      }
      row.result = 'ok';
    } catch (e) {
      row.result = `FAILED: ${String(e.message).split('\n')[0]}`;
      await page.screenshot({ path: join(OUT, `${tag}-error.png`) }).catch(() => {});
    }
    console.log(JSON.stringify(row));
    report.push(row);
  }
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
await ctx.close();

async function exportAs(panel, label, ext, tag, timeout) {
  await panel.locator('label.fmt', { hasText: label }).first().click();
  const dl = page.waitForEvent('download', { timeout });
  await panel.getByRole('button', { name: new RegExp(`^Export ${label}$`) }).click();
  const file = join(OUT, `${tag}.${ext}`);
  await (await dl).saveAs(file);
  return file;
}
