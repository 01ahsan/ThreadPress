// Writes sample exports for manual review when SAMPLES_DIR is set:
//   SAMPLES_DIR=/some/folder npx vitest run tests/unit/samples.test.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { adapterFor } from '../../src/adapters/registry';
import { buildConversation, collectChat } from '../../src/export-flow';
import { renderExport } from '../../src/exporters/index';
import { DEFAULT_OPTIONS } from '../../src/exporters/options';
import { FIXED_NOW, loadFixture } from './helpers';

const DIR = process.env.SAMPLES_DIR;
const PAGES: [string, string, string][] = [
  ['chatgpt', 'synthetic-mixed', 'https://chatgpt.com/c/x'],
  ['claude', 'synthetic', 'https://claude.ai/chat/x'],
  ['gemini', 'synthetic', 'https://gemini.google.com/app/x'],
  ['grok', 'synthetic', 'https://grok.com/c/x'],
  ['deepseek', 'synthetic', 'https://chat.deepseek.com/a/chat/s/x'],
  ['kimi', 'synthetic', 'https://www.kimi.com/chat/x'],
];

it.skipIf(!DIR)('writes sample files', async () => {
  mkdirSync(DIR!, { recursive: true });
  for (const [site, fixture, url] of PAGES) {
    const doc = loadFixture(`${site}/${fixture}.html`);
    const u = new URL(url);
    const adapter = adapterFor({ doc, url: u });
    const c = await collectChat(doc, adapter, new AbortController().signal, () => {});
    const conv = buildConversation(
      doc,
      u,
      adapter,
      c.messages.map((m) => m.message),
      FIXED_NOW,
    );
    for (const f of ['docx', 'html', 'tex'] as const) {
      writeFileSync(join(DIR!, `${site}.${f}`), renderExport(conv, f, DEFAULT_OPTIONS));
    }
  }
});
