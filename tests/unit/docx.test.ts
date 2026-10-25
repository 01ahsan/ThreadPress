import { describe, expect, it } from 'vitest';
import { adapterFor } from '../../src/adapters/registry';
import { buildConversation, collectChat } from '../../src/export-flow';
import { toOmml } from '../../src/exporters/docx/omml';
import { renderExport } from '../../src/exporters/index';
import { DEFAULT_OPTIONS } from '../../src/exporters/options';
import { FIXED_NOW, loadFixture } from './helpers';

/** Reads the stored (uncompressed) entries our ZIP writer produces. */
function unzip(data: Uint8Array): Map<string, string> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out = new Map<string, string>();
  let p = 0;
  while (view.getUint32(p, true) === 0x04034b50) {
    const size = view.getUint32(p + 18, true);
    const nameLen = view.getUint16(p + 26, true);
    const extra = view.getUint16(p + 28, true);
    const name = new TextDecoder().decode(data.subarray(p + 30, p + 30 + nameLen));
    const start = p + 30 + nameLen + extra;
    out.set(name, new TextDecoder().decode(data.subarray(start, start + size)));
    p = start + size;
  }
  return out;
}

async function docxFor(site: string, fixture: string, url: string) {
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
  return unzip(renderExport(conv, 'docx', DEFAULT_OPTIONS) as Uint8Array);
}

describe('Word export', () => {
  it('produces a valid package with well-formed XML', async () => {
    const files = await docxFor('chatgpt', 'synthetic-mixed', 'https://chatgpt.com/c/abc');
    for (const name of [
      '[Content_Types].xml',
      '_rels/.rels',
      'word/document.xml',
      'word/styles.xml',
      'word/numbering.xml',
    ]) {
      expect(files.has(name), name).toBe(true);
      const xml = new DOMParser().parseFromString(files.get(name)!, 'application/xml');
      expect(xml.getElementsByTagName('parsererror').length, name).toBe(0);
    }
  });

  it('writes equations as native Word maths, plus tables, lists, code and links', async () => {
    const files = await docxFor('chatgpt', 'synthetic-mixed', 'https://chatgpt.com/c/abc');
    const xml = files.get('word/document.xml')!;
    expect(xml).toContain('<m:oMath>');
    expect(xml).toContain('<m:oMathPara>');
    expect(xml).toContain('<m:sSup>');
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('<w:numId w:val="1"/>');
    expect(xml).toContain('w:val="Code"');
    expect(xml).toContain('<w:hyperlink r:id=');
    expect(xml).toContain('বাংলায়');
    expect(files.get('word/_rels/document.xml.rels')).toContain('wikipedia.org');
  });

  it('turns matrices, fractions, big operators and fences into their Word equivalents', async () => {
    const gemini = (await docxFor('gemini', 'synthetic', 'https://gemini.google.com/app/x')).get(
      'word/document.xml',
    )!;
    expect(gemini).toContain('<m:m>');
    expect(gemini).toContain('<m:d><m:dPr><m:begChr m:val="("/>');
    expect(gemini).toContain('<m:f>');
    const claude = (await docxFor('claude', 'synthetic', 'https://claude.ai/chat/x')).get(
      'word/document.xml',
    )!;
    expect(claude).toMatch(
      /<m:nary><m:naryPr><m:chr m:val="∫"\/>.*<m:sub>.*0.*<\/m:sub><m:sup>.*1.*<\/m:sup><m:e>.*x/,
    );
  });

  it('stores no author or personal metadata', async () => {
    const core = (await docxFor('chatgpt', 'synthetic-mixed', 'https://chatgpt.com/c/abc')).get(
      'docProps/core.xml',
    )!;
    expect(core).not.toMatch(/creator|lastModifiedBy/);
  });

  it('places square roots and accents', () => {
    expect(
      toOmml({ tag: 'math', children: [{ tag: 'msqrt', children: [{ tag: 'mi', text: 'x' }] }] }, false),
    ).toContain('<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr>');
    expect(
      toOmml(
        {
          tag: 'math',
          children: [
            {
              tag: 'mover',
              attrs: { accent: 'true' },
              children: [
                { tag: 'mi', text: 'v' },
                { tag: 'mo', text: '→' },
              ],
            },
          ],
        },
        false,
      ),
    ).toContain('<m:acc><m:accPr><m:chr m:val="→"/>');
  });
});

describe('HTML export', () => {
  it('is self-contained, uses native MathML and has no scripts', async () => {
    const doc = loadFixture('claude/synthetic.html');
    const u = new URL('https://claude.ai/chat/x');
    const adapter = adapterFor({ doc, url: u });
    const c = await collectChat(doc, adapter, new AbortController().signal, () => {});
    const html = renderExport(
      buildConversation(
        doc,
        u,
        adapter,
        c.messages.map((m) => m.message),
        FIXED_NOW,
      ),
      'html',
      DEFAULT_OPTIONS,
    ) as string;
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<math');
    expect(html).toContain('<msubsup>');
    expect(html).not.toMatch(/<script|<link|@import|https?:\/\/[^"]*\.(js|css)/);
  });
});

describe('deeply nested equations', () => {
  it('converts an equation nested 200 levels deep to Word without overflowing', () => {
    let node: import('../../src/ir/types').MathNode = { tag: 'mn', text: '9' };
    for (let i = 0; i < 200; i++)
      node = { tag: 'mrow', children: [{ tag: 'msup', children: [{ tag: 'mi', text: 'x' }, node] }] };
    const xml = toOmml({ tag: 'math', children: [node] }, true);
    expect(xml.match(/<m:sSup>/g)?.length).toBe(200);
    expect(
      new DOMParser()
        .parseFromString(`<r xmlns:m="m">${xml}</r>`, 'application/xml')
        .getElementsByTagName('parsererror').length,
    ).toBe(0);
  });
});
