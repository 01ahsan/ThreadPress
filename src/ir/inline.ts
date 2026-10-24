import type { Inline } from './types';

/**
 * Cleans a run of inlines: merges adjacent text, drops empty nodes and formatting,
 * moves edge spaces out of formatting (so "**a **" never happens) and trims the run.
 */
export function normalizeInlines(input: Inline[]): Inline[] {
  return trimEdges(merge(input));
}

function merge(input: Inline[]): Inline[] {
  const out: Inline[] = [];
  const pushText = (text: string) => {
    if (!text) return;
    const prev = out[out.length - 1];
    if (prev?.type === 'text') {
      prev.text =
        prev.text.endsWith(' ') && text.startsWith(' ') ? prev.text + text.slice(1) : prev.text + text;
    } else out.push({ type: 'text', text });
  };
  for (const node of input) {
    switch (node.type) {
      case 'text':
        pushText(node.text);
        break;
      case 'bold':
      case 'italic':
      case 'strike':
      case 'link': {
        const children = merge(node.children);
        const lead = takeLeadingSpace(children);
        const trail = takeTrailingSpace(children);
        if (lead) pushText(' ');
        if (children.length) {
          const prev = out[out.length - 1];
          // Merge directly adjacent identical formatting: <b>a</b><b>b</b> -> **ab**
          if (prev && prev.type === node.type && node.type !== 'link') {
            (prev as { children: Inline[] }).children = merge([
              ...(prev as { children: Inline[] }).children,
              ...children,
            ]);
          } else out.push({ ...node, children });
        }
        if (trail) pushText(' ');
        break;
      }
      case 'code':
        if (node.text) out.push(node);
        break;
      case 'math':
        if (node.tex) out.push(node);
        break;
      case 'break': {
        const prev = out[out.length - 1];
        if (prev?.type === 'text') prev.text = prev.text.replace(/ +$/, '');
        out.push(node);
        break;
      }
    }
  }
  return out.filter((n) => n.type !== 'text' || n.text !== '');
}

function takeLeadingSpace(children: Inline[]): boolean {
  const first = children[0];
  if (first?.type !== 'text' || !first.text.startsWith(' ')) return false;
  first.text = first.text.replace(/^ +/, '');
  if (!first.text) children.shift();
  return true;
}

function takeTrailingSpace(children: Inline[]): boolean {
  const last = children[children.length - 1];
  if (last?.type !== 'text' || !last.text.endsWith(' ')) return false;
  last.text = last.text.replace(/ +$/, '');
  if (!last.text) children.pop();
  return true;
}

function trimEdges(list: Inline[]): Inline[] {
  while (list[0]?.type === 'break') list.shift();
  while (list[list.length - 1]?.type === 'break') list.pop();
  const first = list[0];
  if (first?.type === 'text') {
    first.text = first.text.replace(/^ +/, '');
    if (!first.text) return trimEdges(list.slice(1));
  }
  const last = list[list.length - 1];
  if (last?.type === 'text') {
    last.text = last.text.replace(/ +$/, '');
    if (!last.text) return trimEdges(list.slice(0, -1));
  }
  return list;
}

/** Plain text of inline content, used for titles, table widths and the text exporter. */
export function inlineText(list: Inline[]): string {
  return list
    .map((n) => {
      switch (n.type) {
        case 'text':
          return n.text;
        case 'code':
          return n.text;
        case 'math':
          return n.tex;
        case 'break':
          return '\n';
        default:
          return inlineText(n.children);
      }
    })
    .join('');
}
