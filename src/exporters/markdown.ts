// GitHub-flavoured Markdown with $…$ / $$…$$ maths and YAML front matter.

import type { Block, Conversation, Inline, ListItem, Message } from '../ir/types';
import { messageLabel, siteLabel, type ExportOptions } from './options';

export function toMarkdown(conv: Conversation, opts: ExportOptions): string {
  const out: string[] = [];
  out.push(
    '---',
    `title: ${JSON.stringify(conv.title)}`,
    `source: ${JSON.stringify(siteLabel(conv.site))}`,
    `url: ${JSON.stringify(conv.url)}`,
    `exported: ${JSON.stringify(conv.exportedAt)}`,
    '---',
    '',
    `# ${escapeText(conv.title)}`,
  );
  for (const m of conv.messages)
    out.push('', messageHeading(m, opts, conv.site), '', ...renderBlocks(m.blocks, opts));
  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}

function messageHeading(m: Message, opts: ExportOptions, site: Conversation['site']): string {
  return `## ${escapeText(messageLabel(m, opts, site))}`;
}

function renderBlocks(blocks: Block[], opts: ExportOptions): string[] {
  const lines: string[] = [];
  blocks.forEach((b, i) => {
    if (i) lines.push('');
    lines.push(...renderBlock(b, opts));
  });
  return lines;
}

function renderBlock(b: Block, opts: ExportOptions): string[] {
  switch (b.type) {
    case 'paragraph':
      return escapeLineStarts(renderInlines(b.inlines, false)).split('\n');
    case 'heading': {
      const level = Math.min(6, Math.max(3, b.level + 2));
      return [`${'#'.repeat(level)} ${renderInlines(b.inlines, false).replace(/\\\n/g, ' ')}`];
    }
    case 'list':
      return renderList(b.ordered, b.start ?? 1, b.items, opts);
    case 'code': {
      const fence = '`'.repeat(Math.max(3, longestRun(b.text, '`') + 1));
      return [`${fence}${b.language ?? ''}`, ...b.text.split('\n'), fence];
    }
    case 'math':
      return ['$$', ...b.tex.split('\n'), '$$'];
    case 'table':
      return renderTable(b);
    case 'image':
      return [renderImage(b, opts)];
    case 'blockquote':
      return renderBlocks(b.blocks, opts).map((l) => (l ? `> ${l}` : '>'));
    case 'hr':
      return ['---'];
    case 'footnote':
      return [`[^${b.label}]: ${renderInlines(b.inlines, false).replace(/\\\n/g, ' ')}`];
    case 'reasoning':
      return [
        '<details>',
        `<summary>${escapeHtml(b.summary ?? 'Reasoning')}</summary>`,
        '',
        ...renderBlocks(b.blocks, opts),
        '',
        '</details>',
      ];
    case 'attachment':
      return [`*Attachment: ${escapeText(b.name)}*`];
  }
}

function renderList(ordered: boolean, start: number, items: ListItem[], opts: ExportOptions): string[] {
  const lines: string[] = [];
  items.forEach((item, i) => {
    let marker = ordered ? `${start + i}.` : '-';
    if (item.checked !== undefined) marker += item.checked ? ' [x]' : ' [ ]';
    const indent = ' '.repeat((ordered ? `${start + i}.` : '-').length + 1);
    const body: string[] = [];
    item.blocks.forEach((b, j) => {
      if (j && b.type !== 'list') body.push('');
      body.push(...renderBlock(b, opts));
    });
    if (!body.length) body.push('');
    body.forEach((l, j) => lines.push(j === 0 ? `${marker} ${l}`.trimEnd() : l ? indent + l : ''));
  });
  return lines;
}

function renderTable(b: Extract<Block, { type: 'table' }>): string[] {
  const row = (cells: Inline[][]) =>
    `| ${cells.map((c) => renderInlines(c, true).replace(/\\\n/g, '<br>') || ' ').join(' | ')} |`;
  const sep = b.align.map((a) =>
    a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---',
  );
  return [row(b.header), `| ${sep.join(' | ')} |`, ...b.rows.map(row)];
}

function renderImage(b: Extract<Block, { type: 'image' }>, opts: ExportOptions): string {
  const alt = escapeText(b.alt || 'image');
  const src = b.data ?? (opts.images !== 'placeholder' ? b.src : undefined);
  return src ? `![${alt}](${linkTarget(src)})` : `*[Image: ${alt}]*`;
}

function renderInlines(list: Inline[], inTable: boolean): string {
  return list.map((n) => renderInline(n, inTable)).join('');
}

function renderInline(n: Inline, inTable: boolean): string {
  switch (n.type) {
    case 'text':
      return escapeText(n.text);
    case 'bold':
      return `**${renderInlines(n.children, inTable)}**`;
    case 'italic':
      return `*${renderInlines(n.children, inTable)}*`;
    case 'strike':
      return `~~${renderInlines(n.children, inTable)}~~`;
    case 'link': {
      const label = renderInlines(n.children, inTable) || escapeText(n.href);
      return `[${label}](${linkTarget(n.href)})`;
    }
    case 'code': {
      const text = inTable ? n.text.replace(/\|/g, '\\|') : n.text;
      const ticks = '`'.repeat(longestRun(text, '`') + 1);
      const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
      return `${ticks}${pad}${text}${pad}${ticks}`;
    }
    case 'math': {
      const tex = n.tex.replace(/\s*\n\s*/g, ' ');
      return `$${inTable ? tex.replace(/\|/g, '\\|') : tex}$`;
    }
    case 'break':
      return '\\\n';
  }
}

/** Escapes characters that Markdown would otherwise treat as syntax. */
export function escapeText(s: string): string {
  return s.replace(/[\\`*_[\]<>$~|]/g, '\\$&').replace(/&(?=#?\w+;)/g, '&amp;');
}

/** Escapes block syntax at the start of lines (headings, lists, quotes, setext underlines). */
function escapeLineStarts(s: string): string {
  return s
    .split('\n')
    .map((line) =>
      line
        .replace(/^(\s*)(#{1,6}|[+-])(?=\s|$)/, '$1\\$2')
        .replace(/^(\s*)(\d+)([.)])(?=\s|$)/, '$1$2\\$3')
        .replace(/^(\s*)([=-]{3,})\s*$/, '$1\\$2'),
    )
    .join('\n');
}

function linkTarget(href: string): string {
  return /[\s()<>]/.test(href) ? `<${href.replace(/[<>]/g, encodeURIComponent)}>` : href;
}

function longestRun(s: string, ch: string): number {
  let best = 0;
  let cur = 0;
  for (const c of s) {
    cur = c === ch ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
