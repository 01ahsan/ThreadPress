// Builds a readable document from the IR with DOM APIs only (no HTML strings are parsed,
// so nothing from the page can inject markup). Shared by the PDF print view and HTML export.

import type { Block, Conversation, Inline, MathNode } from '../ir/types';
import { messageLabel, siteLabel, type ExportOptions } from './options';

const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

export function documentCss(opts: ExportOptions): string {
  return `
@page { size: ${opts.paper}; margin: 16mm 15mm 18mm; }
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0; color: #1a1c22; background: #fff;
  font: 11pt/1.6 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Bengali", "Nirmala UI",
    "Noto Sans CJK SC", "Microsoft YaHei", "Noto Naskh Arabic", "Segoe UI Historic", sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.tp-doc { max-width: 780px; margin: 0 auto; padding: 40px 28px 64px; }
@media print { .tp-doc { max-width: none; padding: 0; } }
.tp-head { border-bottom: 2px solid #2457c5; padding-bottom: 12px; margin-bottom: 8px; }
.tp-title { font-size: 21pt; line-height: 1.2; margin: 0 0 6px; letter-spacing: -0.01em; }
.tp-meta { color: #5d6170; font-size: 9.5pt; margin: 0; }
.tp-meta a { color: inherit; }
.tp-msg { margin-top: 20px; }
.tp-role {
  font-size: 8.5pt; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #2457c5;
  margin: 0 0 6px; break-after: avoid; page-break-after: avoid;
}
.tp-user .tp-role { color: #6b7080; }
.tp-user .tp-body { background: #f3f5fa; border-radius: 10px; padding: 10px 14px; }
.tp-body > :first-child { margin-top: 0; }
.tp-body > :last-child { margin-bottom: 0; }
p { margin: 0 0 8px; }
h2, h3, h4, h5, h6 { line-height: 1.3; margin: 16px 0 6px; break-after: avoid; page-break-after: avoid; }
h2 { font-size: 15pt; } h3 { font-size: 13pt; } h4 { font-size: 12pt; } h5, h6 { font-size: 11pt; }
ul, ol { margin: 0 0 8px; padding-left: 24px; }
li > p { margin: 0 0 4px; }
a { color: #2457c5; overflow-wrap: anywhere; }
code, pre, .tp-tex { font-family: ui-monospace, "Cascadia Mono", Consolas, Menlo, "Noto Sans Mono", monospace; }
code { background: #eff1f5; border-radius: 4px; padding: 1px 4px; font-size: .9em; }
.tp-code { margin: 0 0 10px; border: 1px solid #e3e5ec; border-radius: 8px; background: #f7f8fa; break-inside: avoid; page-break-inside: avoid; }
.tp-lang { font: 600 8pt/1 system-ui, sans-serif; color: #6b7080; padding: 7px 12px 0; text-transform: lowercase; }
pre { margin: 0; padding: 8px 12px 10px; font-size: 9pt; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
pre code { background: none; padding: 0; font-size: inherit; }
table { border-collapse: collapse; width: 100%; margin: 0 0 10px; font-size: 9.5pt; break-inside: avoid; page-break-inside: avoid; }
th, td { border: 1px solid #d9dce5; padding: 5px 8px; vertical-align: top; overflow-wrap: anywhere; }
th { background: #f3f5fa; font-weight: 650; text-align: left; }
blockquote { margin: 0 0 8px; padding: 2px 0 2px 12px; border-left: 3px solid #c9d3ea; color: #41454f; }
hr { border: none; border-top: 1px solid #e3e5ec; margin: 12px 0; }
math { font-family: "Cambria Math", "STIX Two Math", "Latin Modern Math", math; font-size: 1.05em; }
math[display="block"] { display: block math; margin: 12px 0; overflow-x: auto; overflow-y: hidden; break-inside: avoid; page-break-inside: avoid; }
.tp-tex { background: #eff1f5; border-radius: 4px; padding: 1px 4px; font-size: .9em; }
div.tp-tex { display: block; padding: 8px 12px; margin: 0 0 10px; white-space: pre-wrap; }
.tp-image { margin: 0 0 10px; padding: 10px 12px; border: 1px dashed #c3c7d2; border-radius: 8px; color: #5d6170; font-size: 9.5pt; }
img { max-width: 100%; height: auto; break-inside: avoid; }
.tp-reason { margin: 0 0 10px; padding: 4px 0 4px 12px; border-left: 3px solid #e3e5ec; color: #41454f; font-size: .95em; }
.tp-reason-label { font-size: 8.5pt; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: #8a8f9c; margin-bottom: 4px; }
.tp-attach { color: #5d6170; font-style: italic; }
@media screen { body { background: #f6f7fb; } .tp-doc { background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.06), 0 8px 30px rgba(0,0,0,.06); border-radius: 14px; margin: 32px auto; } }
`;
}

type Child = Node | string | null | undefined | false;

export function buildDocument(doc: Document, conv: Conversation, opts: ExportOptions): HTMLElement {
  const h = (tag: string, cls?: string | null, ...children: Child[]): HTMLElement => {
    const el = doc.createElement(tag);
    if (cls) el.className = cls;
    for (const c of children) if (c) el.append(c);
    return el;
  };

  const inline = (n: Inline): Node | string => {
    switch (n.type) {
      case 'text':
        return n.text;
      case 'bold':
        return h('strong', null, ...n.children.map(inline));
      case 'italic':
        return h('em', null, ...n.children.map(inline));
      case 'strike':
        return h('s', null, ...n.children.map(inline));
      case 'code':
        return h('code', null, n.text);
      case 'link': {
        const a = h('a', null, ...n.children.map(inline));
        a.setAttribute('href', n.href);
        return a;
      }
      case 'math':
        return n.mathml ? mathml(doc, n.mathml, false) : h('span', 'tp-tex', n.tex);
      case 'break':
        return h('br');
    }
  };

  const block = (b: Block): Node | null => {
    switch (b.type) {
      case 'paragraph':
        return h('p', null, ...b.inlines.map(inline));
      case 'heading':
        return h(`h${Math.min(6, b.level + 1)}`, null, ...b.inlines.map(inline));
      case 'list': {
        const list = h(b.ordered ? 'ol' : 'ul');
        if (b.ordered && b.start !== undefined) list.setAttribute('start', String(b.start));
        for (const item of b.items) {
          const li = h('li');
          if (item.checked !== undefined) li.append(item.checked ? '☑ ' : '☐ ');
          li.append(...item.blocks.map(block).filter((x): x is Node => x !== null));
          list.append(li);
        }
        return list;
      }
      case 'code':
        return h(
          'div',
          'tp-code',
          b.language ? h('div', 'tp-lang', b.language) : null,
          h('pre', null, h('code', null, b.text)),
        );
      case 'math':
        return b.mathml ? mathml(doc, b.mathml, true) : h('div', 'tp-tex', b.tex);
      case 'table': {
        const cell = (tag: 'th' | 'td', content: Inline[], i: number) => {
          const c = h(tag, null, ...content.map(inline));
          const a = b.align[i];
          if (a) c.style.textAlign = a;
          return c;
        };
        return h(
          'table',
          null,
          h('thead', null, h('tr', null, ...b.header.map((c, i) => cell('th', c, i)))),
          h('tbody', null, ...b.rows.map((r) => h('tr', null, ...r.map((c, i) => cell('td', c, i))))),
        );
      }
      case 'image': {
        const src = b.data ?? (opts.images === 'link' ? b.src : undefined);
        if (src && opts.images === 'link') {
          const img = h('img');
          img.setAttribute('src', src);
          img.setAttribute('alt', b.alt);
          return img;
        }
        return h('div', 'tp-image', `Image${b.alt ? `: ${b.alt}` : ''}`);
      }
      case 'blockquote':
        return h('blockquote', null, ...b.blocks.map(block));
      case 'hr':
        return h('hr');
      case 'footnote':
        return h('p', null, `[${b.label}] `, ...b.inlines.map(inline));
      case 'reasoning':
        return h(
          'div',
          'tp-reason',
          h('div', 'tp-reason-label', b.summary ?? 'Reasoning'),
          ...b.blocks.map(block),
        );
      case 'attachment':
        return h('p', 'tp-attach', `Attachment: ${b.name}`);
    }
  };

  const date = new Date(conv.exportedAt);
  const source = conv.url.startsWith('http') ? h('a', null, siteLabel(conv.site)) : siteLabel(conv.site);
  if (typeof source !== 'string') source.setAttribute('href', conv.url);
  const head = h(
    'header',
    'tp-head',
    h('h1', 'tp-title', conv.title),
    h(
      'p',
      'tp-meta',
      source,
      ` · ${date.toLocaleDateString(undefined, { dateStyle: 'long' })} · ${conv.messages.length} messages`,
    ),
  );
  const messages = conv.messages.map((m) =>
    h(
      'section',
      `tp-msg tp-${m.role}`,
      h('div', 'tp-role', messageLabel(m, opts, conv.site)),
      h('div', 'tp-body', ...m.blocks.map(block)),
    ),
  );
  return h('main', 'tp-doc', head, ...messages);
}

function mathml(doc: Document, node: MathNode, display: boolean): Element {
  const build = (n: MathNode): Element => {
    const el = doc.createElementNS(MATHML_NS, n.tag);
    for (const [k, v] of Object.entries(n.attrs ?? {})) el.setAttribute(k, v);
    if (n.text !== undefined) el.textContent = n.text;
    for (const c of n.children ?? []) el.append(build(c));
    return el;
  };
  const root = build(node);
  if (display) root.setAttribute('display', 'block');
  else root.removeAttribute('display');
  return root;
}

/** A complete, self-contained HTML file. */
export function toHtml(conv: Conversation, opts: ExportOptions): string {
  const doc = document.implementation.createHTMLDocument(conv.title);
  const meta = doc.createElement('meta');
  meta.setAttribute('charset', 'utf-8');
  const viewport = doc.createElement('meta');
  viewport.setAttribute('name', 'viewport');
  viewport.setAttribute('content', 'width=device-width, initial-scale=1');
  const csp = doc.createElement('meta');
  csp.setAttribute('http-equiv', 'Content-Security-Policy');
  csp.setAttribute('content', "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:");
  const style = doc.createElement('style');
  style.textContent = documentCss(opts);
  doc.head.prepend(meta, viewport, csp);
  doc.head.append(style);
  doc.documentElement.setAttribute('lang', 'en');
  doc.body.append(buildDocument(doc, conv, opts));
  return `<!doctype html>\n${doc.documentElement.outerHTML}\n`;
}
