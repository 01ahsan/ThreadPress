// Builds everything users get:
//   dist/extension/                         the browser extension (Chrome, Edge, Brave, Opera)
//   dist/ThreadPress-extension.zip          the same, zipped for download
//   dist/bookmarklet.txt                    the bookmarklet (Firefox)
//   docs/index.html                       the install page (kept in the repo; CI checks it is current)
// Fails if any bundle contains something that could send data off the device.

import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { zip } from './zip.mjs';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const { VERSION } = await import('../src/version.ts');
const { SITES } = await import('../src/config/sites.ts');
if (VERSION !== pkg.version) throw new Error(`src/version.ts (${VERSION}) != package.json (${pkg.version})`);

// Rule 2 and 3: no network, no dynamic code, no cookies or site storage.
const FORBIDDEN = [
  /\bfetch\s*\(/,
  /XMLHttpRequest/,
  /WebSocket/,
  /EventSource/,
  /sendBeacon/,
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /document\.cookie/,
  /localStorage/,
  /sessionStorage/,
  /indexedDB/,
  /importScripts/,
  /\bimport\s*\(/,
];

async function bundle(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['chrome109', 'firefox115', 'safari16'],
    jsx: 'automatic',
    jsxImportSource: 'preact',
    legalComments: 'none',
    // ASCII output: Chrome refuses content scripts containing Unicode non-characters such as U+FFFF.
    charset: 'ascii',
    write: false,
  });
  const code = result.outputFiles[0].text;
  // Chrome refuses to load an extension whose scripts contain Unicode non-characters.
  const nonchar = [...code].find((ch) => {
    const c = ch.codePointAt(0);
    return (c >= 0xfdd0 && c <= 0xfdef) || (c & 0xfffe) === 0xfffe;
  });
  if (nonchar) throw new Error(`Unicode non-character U+${nonchar.codePointAt(0).toString(16)} in ${entry}`);
  const hits = FORBIDDEN.filter((re) => re.test(code));
  if (hits.length) throw new Error(`Forbidden API in ${entry}: ${hits.map(String).join(', ')}`);
  return code;
}

await rm('dist', { recursive: true, force: true });
await mkdir('dist/extension/icons', { recursive: true });

// ---- Extension ----
const matches = SITES.flatMap((site) =>
  site.hosts.map((host) => {
    const prefix = site.pathPrefix?.[host];
    return prefix ? `https://${host}${prefix}*` : `https://${host}/*`;
  }),
);
const manifest = {
  manifest_version: 3,
  // The stores show this as the listing title; the toolbar uses short_name.
  name: 'ThreadPress - AI Chat Exporter',
  short_name: 'ThreadPress',
  version: pkg.version,
  description:
    'Save AI chats as PDF, Word, Markdown and more, with equations and code intact. Private: nothing leaves your device.',
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_title: 'ThreadPress',
    default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
  },
  background: { service_worker: 'background.js' },
  content_scripts: [{ matches, js: ['content.js'], run_at: 'document_idle' }],
  commands: {
    'toggle-panel': { suggested_key: { default: 'Alt+Shift+E' }, description: 'Open ThreadPress' },
  },
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
  // color-mix() in the per-message button needs Chrome/Edge 111.
  minimum_chrome_version: '111',
};
const gecko = {
  gecko: {
    id: 'threadpress@01ahsan.github.io',
    strict_min_version: '140.0',
    // Firefox Add-ons requires new extensions to declare data collection: ThreadPress collects none.
    data_collection_permissions: { required: ['none'] },
  },
  gecko_android: { strict_min_version: '142.0' },
};
// The download on GitHub works in both browsers: Chrome uses service_worker and Firefox uses
// scripts (Chrome accepts both keys since version 121; Firefox ignores service_worker).
const universal = {
  ...manifest,
  background: { service_worker: 'background.js', scripts: ['background.js'] },
  browser_specific_settings: gecko,
  minimum_chrome_version: '121',
};
await writeFile('dist/extension/manifest.json', JSON.stringify(universal, null, 2) + '\n');
await writeFile('dist/extension/content.js', await bundle('src/extension/content.ts'));
await writeFile('dist/extension/background.js', await bundle('src/extension/background.ts'));
for (const size of [16, 32, 48, 128]) {
  await cp(`assets/icons/icon-${size}.png`, `dist/extension/icons/icon-${size}.png`);
}
await cp('LICENSE', 'dist/extension/LICENSE');
// MIT requires shipping the copyright notice of bundled code with every copy.
const notices = [
  'ThreadPress includes the following open-source software.',
  '',
  '----------------------------------------------------------------------',
  `Preact ${JSON.parse(await readFile('node_modules/preact/package.json', 'utf8')).version} - https://preactjs.com`,
  '----------------------------------------------------------------------',
  (await readFile('node_modules/preact/LICENSE', 'utf8')).trim(),
  '',
].join('\n');
await writeFile('dist/extension/THIRD_PARTY_NOTICES.txt', notices);

const extFiles = [
  'manifest.json',
  'content.js',
  'background.js',
  'LICENSE',
  'THIRD_PARTY_NOTICES.txt',
  ...[16, 32, 48, 128].map((s) => `icons/icon-${s}.png`),
];
const entries = await Promise.all(
  extFiles.map(async (name) => ({
    name: `ThreadPress/${name}`,
    data: await readFile(`dist/extension/${name}`),
  })),
);
await writeFile('dist/ThreadPress-extension.zip', zip(entries));

// Store uploads need manifest.json at the zip root.
const rootEntries = entries.map((e) => ({ ...e, name: e.name.replace(/^ThreadPress\//, '') }));
await mkdir('dist/store', { recursive: true });
// Store packages carry only their own browser's keys, so store reviews see no unknown keys.
const withManifest = (m) =>
  rootEntries.map((e) =>
    e.name === 'manifest.json' ? { ...e, data: Buffer.from(JSON.stringify(m, null, 2) + '\n') } : e,
  );
await writeFile('dist/store/chrome-edge.zip', zip(withManifest(manifest)));
const firefoxManifest = {
  ...manifest,
  background: { scripts: ['background.js'] },
  browser_specific_settings: gecko,
};
delete firefoxManifest.minimum_chrome_version;
await writeFile('dist/store/firefox.zip', zip(withManifest(firefoxManifest)));

// ---- Bookmarklet ----
const code = await bundle('src/bookmarklet/main.ts');
// Percent-encode only what a javascript: URL would otherwise change: '%', whitespace
// control characters and non-ASCII. Everything else stays readable and small.
const bookmarklet =
  'javascript:' + (code.trim() + 'void 0').replace(/[%\t\n\r]|[^\x20-\x7e]+/g, (m) => encodeURIComponent(m));
await writeFile('dist/bookmarklet.txt', bookmarklet);

// ---- Install page ----
const template = await readFile('scripts/install.html', 'utf8');
const icon = (await readFile('assets/icons/icon.svg', 'utf8')).trim();
const attr = bookmarklet.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const page = template
  .replaceAll('{{BOOKMARKLET}}', () => attr) // a function, so '$' in the code is not a replacement pattern
  .replaceAll('{{VERSION}}', () => pkg.version)
  .replaceAll('{{ICON}}', () => icon);
await writeFile('docs/index.html', page);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`extension ready in dist/extension · bookmarklet ${kb(bookmarklet.length)}`);
