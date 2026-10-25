// Inspect how ThreadPress sees a real chat site, using the test accounts in .live-profile/.
// Read-only. Writes test-results/live/inspect-<site>.txt with: what the reader finds (counts,
// roles, keys), whether the floating button and per-message icons appeared, and the page
// structure around the conversation (tags, classes, data-* attributes; text replaced by length).
//
//   npm run build && node scripts/live-inspect.mjs deepseek [chatIndex]

import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { openLive } from './live.mjs';

const SITES = {
  chatgpt: { home: 'https://chatgpt.com/', links: 'a[href*="/c/"]' },
  claude: { home: 'https://claude.ai/recents', links: 'a[href*="/chat/"]' },
  gemini: { home: 'https://gemini.google.com/app', links: 'a[href*="/app/"]' },
  grok: { home: 'https://grok.com/', links: 'a[href*="/c/"]' },
  deepseek: { home: 'https://chat.deepseek.com/', links: 'a[href*="/chat/s/"]' },
  kimi: { home: 'https://www.kimi.com/', links: 'a[href*="/chat/"]' },
};
const site = process.argv[2];
const index = Number(process.argv[3] ?? 0);
if (!SITES[site])
  throw new Error(`Usage: node scripts/live-inspect.mjs <${Object.keys(SITES).join('|')}> [chatIndex]`);

// The reader, bundled to run in the page (page.evaluate is not subject to the page's CSP).
const probe = await build({
  stdin: {
    contents: `import { adapterForSite } from './src/adapters/registry';
      globalThis.__tpInspect = (site) => {
        const a = adapterForSite(site, { doc: document, url: new URL(location.href) });
        const turns = a.turns();
        return {
          title: a.getTitle(),
          turns: turns.map((t) => {
            const m = a.read(t);
            const text = JSON.stringify(m.blocks).length;
            return { role: t.role, tag: t.el.localName, cls: String(t.el.className).slice(0, 60), blocks: m.blocks.length, json: text };
          }),
        };
      };`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  format: 'iife',
  write: false,
});

const ctx = await openLive(false);
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(SITES[site].home, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(7000);
const links = await page.$$eval(SITES[site].links, (as) => [...new Set(as.map((a) => a.href))]);
const out = [`site: ${site}`, `chats found on home page: ${links.length}`];
if (!links[index]) {
  out.push('No chat to open. Home page URL now: ' + new URL(page.url()).pathname);
} else {
  await page.goto(links[index], { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);
  await page.evaluate(probe.outputFiles[0].text);
  const seen = await page.evaluate((s) => globalThis.__tpInspect(s), site);
  out.push(`chat: ${new URL(page.url()).pathname.replace(/[0-9a-f-]{8,}/g, ':id')}`);
  out.push(`title: ${seen.title}`);
  out.push(`floating button: ${await page.locator('threadpress-launcher').count()}`);
  out.push(`per-message icons: ${await page.locator('threadpress-msg').count()}`);
  out.push(`messages found: ${seen.turns.length}`);
  for (const t of seen.turns)
    out.push(`  ${t.role.padEnd(9)} <${t.tag} .${t.cls}> blocks=${t.blocks} size=${t.json}`);
  await page.screenshot({ path: `test-results/live/inspect-${site}.png` });

  // Page structure around the conversation: the deepest element holding most of the text.
  const structure = await page.evaluate(() => {
    const lines = [];
    const describe = (el) => {
      const attrs = [...el.attributes]
        .filter((a) => /^(data-|role$|aria-label$|id$)/.test(a.name))
        .map((a) => `${a.name}=${a.value.slice(0, 40)}`)
        .join(' ');
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join('');
      const short =
        own.length && own.length <= 12 ? JSON.stringify(own) : own.length ? `#text(${own.length})` : '';
      return `<${el.localName} .${[...el.classList].slice(0, 5).join('.')} ${attrs}> ${short}`;
    };
    // Find the element containing the conversation: largest visible text (innerText ignores
    // scripts and styles), then descend while one child holds most of it.
    const size = (el) => (el instanceof HTMLElement ? el.innerText.length : 0);
    let root = document.querySelector('main') ?? document.body;
    for (;;) {
      const total = size(root);
      const big = [...root.children].find((c) => size(c) > total * 0.6);
      if (!big) break;
      root = big;
    }
    // Go back up a few levels so the first messages and their toolbars are included.
    for (let i = 0; i < 2 && root.parentElement && root !== document.body; i++) root = root.parentElement;
    const walk = (el, d) => {
      if (lines.length > 260 || d > 14) return;
      lines.push('  '.repeat(d) + describe(el));
      if (['svg', 'math', 'pre', 'code', 'style', 'script'].includes(el.localName)) return;
      const kids = [...el.children];
      kids.forEach((c, i) => {
        // Show the first 4 children fully, then summarise long runs.
        if (i < 4 || i >= kids.length - 2) walk(c, d + 1);
        else if (i === 4) lines.push('  '.repeat(d + 1) + `… ${kids.length - 6} more children`);
      });
    };
    walk(root, 0);
    return lines.join('\n');
  });
  out.push('', 'structure:', structure);
}
mkdirSync('test-results/live', { recursive: true });
writeFileSync(`test-results/live/inspect-${site}.txt`, out.join('\n') + '\n');
console.log(out.slice(0, 20).join('\n'));
await ctx.close();
