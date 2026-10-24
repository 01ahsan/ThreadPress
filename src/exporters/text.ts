// Plain UTF-8 text. Maths stays as LaTeX source; tables become aligned columns.

import { inlineText } from '../ir/inline';
import type { Block, Conversation, Inline } from '../ir/types';
import { messageLabel, siteLabel, type ExportOptions } from './options';

export function toText(conv: Conversation, opts: ExportOptions): string {
  const out: string[] = [conv.title, `${siteLabel(conv.site)} · ${conv.url}`, `Exported ${conv.exportedAt}`];
  for (const m of conv.messages) {
    const label = messageLabel(m, opts);
    out.push('', '', label, '='.repeat(Math.max(3, Array.from(label).length)), '', ...blocks(m.blocks, opts));
  }
  return (
    out
      .join('\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trimEnd() + '\n'
  );
}

function blocks(list: Block[], opts: ExportOptions): string[] {
  const lines: string[] = [];
  list.forEach((b, i) => {
    if (i) lines.push('');
    lines.push(...block(b, opts));
  });
  return lines;
}

function block(b: Block, opts: ExportOptions): string[] {
  switch (b.type) {
    case 'paragraph':
      return text(b.inlines).split('\n');
    case 'heading':
      return [text(b.inlines).replace(/\n/g, ' ')];
    case 'list':
      return b.items.flatMap((item, i) => {
        const marker =
          (b.ordered ? `${(b.start ?? 1) + i}.` : '-') +
          (item.checked === undefined ? '' : item.checked ? ' [x]' : ' [ ]');
        const indent = ' '.repeat((b.ordered ? `${(b.start ?? 1) + i}.` : '-').length + 1);
        const body = item.blocks.flatMap((ib) => block(ib, opts));
        return body.map((l, j) => (j === 0 ? `${marker} ${l}` : l ? indent + l : ''));
      });
    case 'code':
      return [`[code${b.language ? `: ${b.language}` : ''}]`, ...b.text.split('\n'), '[/code]'];
    case 'math':
      return b.tex.split('\n').map((l) => `    ${l}`);
    case 'table':
      return table([b.header, ...b.rows].map((r) => r.map((c) => text(c).replace(/\n/g, ' '))));
    case 'image':
      return [`[Image: ${b.alt || 'image'}${b.src && opts.images === 'link' ? ` <${b.src}>` : ''}]`];
    case 'blockquote':
      return blocks(b.blocks, opts).map((l) => `> ${l}`.trimEnd());
    case 'hr':
      return ['----------'];
    case 'footnote':
      return [`[${b.label}] ${text(b.inlines)}`];
    case 'reasoning':
      return [`[${b.summary ?? 'Reasoning'}]`, ...blocks(b.blocks, opts).map((l) => `  ${l}`.trimEnd())];
    case 'attachment':
      return [`[Attachment: ${b.name}]`];
  }
}

function text(list: Inline[]): string {
  return list
    .map((n) => {
      if (n.type === 'link') {
        const label = inlineText(n.children);
        return label && label !== n.href ? `${label} <${n.href}>` : n.href;
      }
      if (n.type === 'math') return `$${n.tex}$`;
      if (n.type === 'strike') return `~~${text(n.children)}~~`;
      if (n.type === 'bold' || n.type === 'italic') return text(n.children);
      return inlineText([n]);
    })
    .join('');
}

/** Pads columns to equal width, counting code points so non-Latin text lines up as well as it can. */
function table(rows: string[][]): string[] {
  const width = (s: string) => Array.from(s).length;
  const cols = Math.max(...rows.map((r) => r.length));
  const w = Array.from({ length: cols }, (_, c) => Math.max(3, ...rows.map((r) => width(r[c] ?? ''))));
  const line = (r: string[]) =>
    w
      .map((cw, c) => (r[c] ?? '') + ' '.repeat(cw - width(r[c] ?? '')))
      .join(' | ')
      .trimEnd();
  const [head, ...body] = rows;
  return [line(head ?? []), w.map((cw) => '-'.repeat(cw)).join('-+-'), ...body.map(line)];
}
