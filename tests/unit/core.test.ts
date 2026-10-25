import { describe, expect, it } from 'vitest';
import { adapterForSite } from '../../src/adapters/registry';
import { brokenSiteIssueUrl } from '../../src/adapters/registry';
import { exportFileName } from '../../src/exporters/filename';
import { renderExport } from '../../src/exporters/index';
import { escapeText } from '../../src/exporters/markdown';
import { DEFAULT_OPTIONS } from '../../src/exporters/options';
import { blocksFromElement } from '../../src/ir/from-dom';
import { extractTex } from '../../src/ir/math';
import { IR_VERSION, type Conversation } from '../../src/ir/types';

const base = 'https://chatgpt.com/c/x';

function html(markup: string): Element {
  const doc = new DOMParser().parseFromString(`<div id="root">${markup}</div>`, 'text/html');
  return doc.getElementById('root')!;
}

describe('file names', () => {
  const d = new Date(2026, 0, 5);
  it('removes characters that are invalid on any OS', () => {
    expect(exportFileName('chatgpt', 'a/b\\c:d*e?f"g<h>i|j', d, 'md')).toBe(
      'chatgpt-a-b-c-d-e-f-g-h-i-j-2026-01-05.md',
    );
  });
  it('keeps non-Latin titles and caps the length by characters', () => {
    expect(exportFileName('kimi', 'বাংলা প্রশ্ন', d, 'txt')).toBe('kimi-বাংলা-প্রশ্ন-2026-01-05.txt');
    const long = exportFileName('claude', 'অ'.repeat(200), d, 'md');
    expect(Array.from(long).length).toBeLessThan(110);
  });
  it('avoids reserved Windows names and empty titles', () => {
    expect(exportFileName('grok', 'CON', d, 'md')).toBe('grok-CON-chat-2026-01-05.md');
    expect(exportFileName('grok', '...', d, 'md')).toBe('grok-chat-2026-01-05.md');
  });
});

describe('maths', () => {
  it('falls back to MathML when there is no TeX annotation', () => {
    const el = html('<math><mfrac><mi>a</mi><msqrt><mi>b</mi></msqrt></mfrac></math>').firstElementChild!;
    expect(extractTex(el)).toBe('\\frac{a}{\\sqrt{b}}');
  });
  it('reads MathJax and data-attribute sources', () => {
    expect(extractTex(html('<script type="math/tex; mode=display">x^2</script>').firstElementChild!)).toBe(
      'x^2',
    );
    expect(
      extractTex(
        html('<mjx-container data-latex="\\alpha"><math><mi>α</mi></math></mjx-container>')
          .firstElementChild!,
      ),
    ).toBe('\\alpha');
  });
  it('hoists display maths out of a paragraph', () => {
    const blocks = blocksFromElement(
      html(
        '<p>before <span class="katex-display"><span class="katex"><annotation encoding="application/x-tex">x</annotation></span></span> after</p>',
      ),
      { baseUrl: base },
    );
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'math', 'paragraph']);
  });
});

describe('DOM conversion safety', () => {
  it('drops scripts, buttons and javascript: links', () => {
    const blocks = blocksFromElement(
      html('<p>ok<script>alert(1)</script><button>Copy</button> <a href="javascript:alert(1)">click</a></p>'),
      { baseUrl: base },
    );
    expect(blocks).toEqual([{ type: 'paragraph', inlines: [{ type: 'text', text: 'ok click' }] }]);
  });
  it('splits <br><br> into separate paragraphs', () => {
    const blocks = blocksFromElement(html('<p>one<br><br>two<br>three</p>'), { baseUrl: base });
    expect(blocks.length).toBe(2);
  });
});

describe('markdown escaping', () => {
  it('escapes inline syntax', () => {
    expect(escapeText('a*b_c [d] `e` $5 <x> |')).toBe('a\\*b\\_c \\[d\\] \\`e\\` \\$5 \\<x\\> \\|');
  });
  it('escapes list and heading markers at line starts', () => {
    const conv: Conversation = {
      version: IR_VERSION,
      title: 't',
      site: 'chatgpt',
      url: base,
      exportedAt: '2026-01-01T00:00:00.000Z',
      messages: [
        {
          role: 'user',
          blocks: [
            { type: 'paragraph', inlines: [{ type: 'text', text: '# not a heading' }] },
            { type: 'paragraph', inlines: [{ type: 'text', text: '- not a list' }] },
          ],
        },
      ],
    };
    const md = renderExport(conv, 'md', DEFAULT_OPTIONS);
    expect(md).toContain('\n\\# not a heading\n');
    expect(md).toContain('\n\\- not a list\n');
  });
});

describe('issue report link', () => {
  it('contains no conversation id', () => {
    const link = brokenSiteIssueUrl(
      new URL('https://chatgpt.com/c/6720aa00-1111-2222-3333-444455556666'),
      'ChatGPT',
    );
    expect(decodeURIComponent(link)).not.toContain('6720aa00');
    expect(decodeURIComponent(link)).toContain('/c/:id');
  });
});

describe('performance', () => {
  it('converts and renders a 500-message chat in under 10 seconds', async () => {
    const turn = (i: number) =>
      `<div data-message-author-role="user"><div class="whitespace-pre-wrap">Question ${i}</div></div>` +
      `<div data-message-author-role="assistant"><div class="markdown"><p>Answer <strong>${i}</strong> with ` +
      `<span class="katex"><annotation encoding="application/x-tex">x_${i}</annotation></span></p>` +
      `<pre><code class="language-ts">const n = ${i};</code></pre><ul><li>a</li><li>b</li></ul></div></div>`;
    const doc = new DOMParser().parseFromString(
      `<main>${Array.from({ length: 250 }, (_, i) => turn(i)).join('')}</main>`,
      'text/html',
    );
    const adapter = adapterForSite('chatgpt', { doc, url: new URL(base) });
    const start = performance.now();
    const messages = (await adapter.collect(new AbortController().signal, () => {})).map((m) => m.message);
    const conv: Conversation = {
      version: IR_VERSION,
      title: 't',
      site: 'chatgpt',
      url: base,
      exportedAt: '2026-01-01T00:00:00.000Z',
      messages,
    };
    for (const f of ['docx', 'md', 'json', 'txt', 'tex', 'html'] as const)
      renderExport(conv, f, DEFAULT_OPTIONS);
    expect(messages.length).toBe(500);
    expect(performance.now() - start).toBeLessThan(10_000);
  });

  it('can be cancelled', async () => {
    const doc = new DOMParser().parseFromString('<div data-message-author-role="user">x</div>', 'text/html');
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      adapterForSite('chatgpt', { doc, url: new URL(base) }).collect(ctrl.signal, () => {}),
    ).rejects.toThrow('cancelled');
  });
});

describe('LaTeX safety', () => {
  it('neutralises file and shell access hidden in maths copied from a page', async () => {
    const { safeTex } = await import('../../src/exporters/latex');
    const evil = String.raw`x \input{/etc/passwd} \immediate\write18{rm -rf ~} \directlua{os.exit()} \frac{1}{2} \end{aligned}`;
    const out = safeTex(evil);
    expect(out).not.toMatch(/\\(input|immediate|write18|directlua)(?![a-zA-Z])/);
    expect(out).toContain(String.raw`\frac{1}{2}`);
    expect(out).toContain(String.raw`\end{aligned}`);
  });
});
