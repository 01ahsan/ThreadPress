import { describe, expect, it } from 'vitest';
import { adapterFor } from '../../src/adapters/registry';
import { buildConversation, collectChat } from '../../src/export-flow';
import { renderExport, type FormatId } from '../../src/exporters/index';
import { DEFAULT_OPTIONS, type ExportOptions } from '../../src/exporters/options';
import type { Role } from '../../src/ir/types';
import { expectGolden, FIXED_NOW, loadFixture } from './helpers';

interface Case {
  site: string;
  fixture: string;
  url: string;
  title: string;
  roles: Role[];
  contains: string[];
}

const CASES: Case[] = [
  {
    site: 'chatgpt',
    fixture: 'synthetic-mixed',
    url: 'https://chatgpt.com/c/6720aa00-1111-2222-3333-444455556666',
    title: 'Physics notes and a sorting question',
    roles: ['user', 'assistant', 'user', 'assistant'],
    contains: ['$E = mc^2$', '```python', '| :--- | :---: | ---: |', 'বাংলায়'],
  },
  {
    site: 'chatgpt',
    fixture: 'layout-2026',
    url: 'https://chatgpt.com/c/0f0e0d0c-1111-2222-3333-444455556666',
    title: 'Quadratic formula',
    roles: ['user', 'assistant'],
    contains: ['Solve x² − 5x + 6 = 0', '$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$', '**x = 2**'],
  },
  {
    site: 'claude',
    fixture: 'synthetic',
    url: 'https://claude.ai/chat/0b6f3c1e-0000-4000-8000-000000000001',
    title: 'Integrals and a table',
    roles: ['user', 'assistant'],
    contains: [
      '$\\frac{x^3}{3} + C$',
      '$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$',
      '```python',
      '---: |',
      'বাংলায়',
    ],
  },
  {
    site: 'gemini',
    fixture: 'synthetic',
    url: 'https://gemini.google.com/app/1a2b3c4d5e6f',
    title: 'Matrix question',
    roles: ['user', 'assistant'],
    contains: ['\\begin{pmatrix}', '<summary>Reasoning</summary>', 'adjugate', '**ad − bc ≠ 0**'],
  },
  {
    site: 'grok',
    fixture: 'synthetic',
    url: 'https://grok.com/c/9f8e7d6c-0000-4000-8000-000000000002',
    title: 'Fibonacci in Rust',
    roles: ['user', 'assistant'],
    contains: ['```rust', '3. Third point', '*iterative*'],
  },
  {
    site: 'deepseek',
    fixture: 'synthetic',
    url: 'https://chat.deepseek.com/a/chat/s/0000-1111',
    title: 'Prime check',
    roles: ['user', 'assistant'],
    contains: ['Is 97 prime?\\\nExplain briefly.', '$d \\le \\sqrt{97}$', '> A prime', '√97 ≈ 9.8'],
  },
  {
    site: 'kimi',
    fixture: 'synthetic',
    url: 'https://www.kimi.com/chat/d0e1f2a3b4',
    title: '翻译与表格',
    roles: ['user', 'assistant'],
    contains: ['| 中文 | 你好 |', 'مرحبا', 'Done ✅'],
  },
];

async function exportCase(c: Case, format: FormatId, opts: Partial<ExportOptions> = {}) {
  const doc = loadFixture(`${c.site}/${c.fixture}.html`);
  const url = new URL(c.url);
  const adapter = adapterFor({ doc, url });
  const collected = await collectChat(doc, adapter, new AbortController().signal, () => {});
  const conv = buildConversation(
    doc,
    url,
    adapter,
    collected.messages.map((m) => m.message),
    FIXED_NOW,
  );
  return { conv, collected, out: renderExport(conv, format, { ...DEFAULT_OPTIONS, ...opts }) };
}

for (const c of CASES) {
  describe(`${c.site} adapter`, () => {
    it('finds every message, in order, with its role and the chat title', async () => {
      const { conv, collected } = await exportCase(c, 'json');
      expect(collected.source).toBe('adapter');
      expect(conv.messages.map((m) => m.role)).toEqual(c.roles);
      expect(conv.title).toBe(c.title);
    });

    it('keeps maths, code, tables and scripts intact in Markdown', async () => {
      const { out } = await exportCase(c, 'md');
      for (const s of c.contains) expect(out).toContain(s);
    });

    it('never includes personal details from outside the chat', async () => {
      for (const f of ['md', 'json', 'txt', 'tex'] as const) {
        const { out } = await exportCase(c, f);
        for (const secret of [
          'Jane',
          'private',
          'Private',
          'SECRET',
          'TOKEN',
          'Copy',
          'Regenerate',
          'thumb_up',
        ]) {
          expect(out as string, `${f} contains "${secret}"`).not.toContain(secret);
        }
      }
    });

    for (const f of ['md', 'json', 'txt', 'tex'] as const) {
      it(`matches the ${f} golden file`, async () => {
        const { out } = await exportCase(c, f);
        expectGolden(`${c.site}/${c.fixture}.${f}`, out as string);
      });
    }
  });
}

it('includes image links only when asked', async () => {
  const chatgpt = CASES[0]!;
  const { out: hidden } = await exportCase(chatgpt, 'md');
  expect(hidden).not.toContain('oaiusercontent');
  const { out } = await exportCase(chatgpt, 'md', { images: 'link' });
  expect(out).toContain('![Diagram of energy](https://files.oaiusercontent.com/file-abc?se=2026&sig=SECRET)');
});
