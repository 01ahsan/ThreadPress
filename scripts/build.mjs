// Builds the bookmarklet: dist/threadpress.js, dist/bookmarklet.txt, dist/install.html and docs/install.html.
// Fails the build if the bundle contains anything that could send data off the device.

import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const { VERSION } = await import('../src/version.ts');
if (VERSION !== pkg.version) throw new Error(`src/version.ts (${VERSION}) != package.json (${pkg.version})`);

await mkdir('dist', { recursive: true });

const result = await build({
  entryPoints: ['src/bookmarklet/main.ts'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome109', 'firefox115', 'safari16'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  legalComments: 'none',
  charset: 'utf8',
  write: false,
  metafile: true,
});
const code = result.outputFiles[0].text;

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
const hits = FORBIDDEN.filter((re) => re.test(code));
if (hits.length) throw new Error(`Forbidden API in bundle: ${hits.map(String).join(', ')}`);

// Percent-encode only what a javascript: URL would otherwise change: '%', whitespace
// control characters and non-ASCII. Everything else stays readable and small.
const bookmarklet =
  'javascript:' + (code.trim() + 'void 0').replace(/[%\t\n\r]|[^\x20-\x7e]+/g, (m) => encodeURIComponent(m));
await writeFile('dist/threadpress.js', code);
await writeFile('dist/bookmarklet.txt', bookmarklet);

const template = await readFile('scripts/install.html', 'utf8');
const attr = bookmarklet.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const page = template.replaceAll('{{BOOKMARKLET}}', attr).replaceAll('{{VERSION}}', pkg.version);
await writeFile('dist/install.html', page);
// The install page people download, kept in the repository (CI checks it is up to date).
await writeFile('docs/install.html', page);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`threadpress.js ${kb(code.length)} · bookmarklet ${kb(bookmarklet.length)}`);
