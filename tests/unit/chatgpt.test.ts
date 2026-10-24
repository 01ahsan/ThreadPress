import { describe, expect, it } from 'vitest';
import { createChatGPTAdapter } from '../../src/adapters/chatgpt';
import { DEFAULT_OPTIONS } from '../../src/exporters/options';
import { runExport } from '../../src/export-flow';
import type { FormatId } from '../../src/exporters/index';
import { expectGolden, FIXED_NOW, loadFixture } from './helpers';

const URL_ = new URL('https://chatgpt.com/c/6720aa00-1111-2222-3333-444455556666');

async function exportFixture(name: string, format: FormatId, images: 'placeholder' | 'link' = 'placeholder') {
  const doc = loadFixture(`chatgpt/${name}.html`);
  return runExport({
    doc,
    url: URL_,
    format,
    options: { ...DEFAULT_OPTIONS, images },
    signal: new AbortController().signal,
    now: FIXED_NOW,
  });
}

describe('ChatGPT adapter', () => {
  it('finds every message with roles and models', async () => {
    const doc = loadFixture('chatgpt/synthetic-mixed.html');
    const adapter = createChatGPTAdapter({ doc, url: URL_ });
    expect(adapter.isConversationPage()).toBe(true);
    expect(adapter.getTitle()).toBe('Physics notes and a sorting question');
    const messages = await adapter.getMessages(new AbortController().signal);
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(messages[1]?.model).toBe('gpt-5');
  });

  it('recovers LaTeX, code language and table alignment', async () => {
    const { conversation } = await exportFixture('synthetic-mixed', 'json');
    const blocks = conversation.messages[1]!.blocks;
    const math = blocks.find((b) => b.type === 'math');
    expect(math && math.type === 'math' && math.tex).toContain('\\begin{pmatrix}');
    const code = blocks.find((b) => b.type === 'code');
    expect(code).toMatchObject({ language: 'python' });
    expect(code && code.type === 'code' && code.text).not.toContain('Copy code');
    const table = blocks.find((b) => b.type === 'table');
    expect(table).toMatchObject({ align: ['left', 'center', 'right'] });
  });

  for (const format of ['md', 'json', 'txt'] as const) {
    it(`matches the ${format} golden file`, async () => {
      const { text, fileName } = await exportFixture('synthetic-mixed', format);
      expect(fileName).toBe(`chatgpt-Physics-notes-and-a-sorting-question-2026-10-24.${format}`);
      expectGolden(`chatgpt/synthetic-mixed.${format}`, text);
    });
  }

  it('never exports personal details from outside the chat or image access tokens', async () => {
    for (const format of ['md', 'json', 'txt'] as const) {
      const { text } = await exportFixture('synthetic-mixed', format);
      for (const secret of [
        'Jane',
        'jane@example.com',
        'A different private chat',
        'SECRET',
        'TOKEN',
        'You said:',
      ]) {
        expect(text, `${format} leaks "${secret}"`).not.toContain(secret);
      }
    }
  });

  it('includes image links only when asked', async () => {
    const { text } = await exportFixture('synthetic-mixed', 'md', 'link');
    expect(text).toContain(
      '![Diagram of energy](https://files.oaiusercontent.com/file-abc?se=2026&sig=SECRET)',
    );
  });
});
