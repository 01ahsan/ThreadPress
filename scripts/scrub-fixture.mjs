// Cleans a saved chat page before it becomes a test fixture:
// removes scripts, styles, navigation/sidebars (other chat titles, account menus),
// unneeded attributes, and anything that looks like an email address or access token.
//
// Usage: node scripts/scrub-fixture.mjs <input.html> <output.html>
// Always open the output and read it before committing it.

import { readFile, writeFile } from 'node:fs/promises';
import { Window } from 'happy-dom';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/scrub-fixture.mjs <input.html> <output.html>');
  process.exit(1);
}

const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableCSSFileLoading: true } });
const doc = new window.DOMParser().parseFromString(await readFile(input, 'utf8'), 'text/html');

const REMOVE = [
  'script',
  'style',
  'link',
  'meta',
  'noscript',
  'iframe',
  'template',
  'svg',
  'canvas',
  'video',
  'audio',
  'nav',
  'aside',
  'header',
  'footer',
  'form',
  'textarea',
  'input:not([type="checkbox"])',
  '[data-testid*="profile"]',
  '[data-testid*="account"]',
  '[aria-label*="profile" i]',
  '[aria-label*="account" i]',
];
for (const el of doc.querySelectorAll(REMOVE.join(','))) el.remove();

const KEEP_ATTR =
  /^(class|id|role|lang|dir|href|src|alt|title|style|colspan|rowspan|align|start|type|checked|display|encoding|xmlns|aria-hidden|aria-label|data-[\w-]+)$/;
for (const el of doc.querySelectorAll('*')) {
  for (const { name } of Array.from(el.attributes)) if (!KEEP_ATTR.test(name)) el.removeAttribute(name);
  for (const attr of ['href', 'src']) {
    const v = el.getAttribute(attr);
    if (v && /^https?:/.test(v)) {
      // Drop query strings and fragments: signed image URLs carry access tokens.
      try {
        const u = new URL(v);
        el.setAttribute(attr, u.origin + u.pathname);
      } catch {
        el.removeAttribute(attr);
      }
    }
    if (v && /^data:/.test(v) && v.length > 200) el.setAttribute(attr, 'data:image/png;base64,AAAA');
  }
}

let html = '<!doctype html>\n' + doc.documentElement.outerHTML;
html = html.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, 'user@example.com');
html = html.replace(/\b(eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]+|sk-[\w-]{16,})\b/g, 'REDACTED');

await writeFile(output, html);
await window.happyDOM.close();
console.log(`Wrote ${output}. Open it and check it contains nothing personal before committing.`);
