// Converts rendered chat markup into IR blocks. Shared by every site adapter;
// adapters customise it through ConvertOptions rather than forking it.

import { extractMathML, extractTex, isDisplayMath, isMathRoot } from './math';
import { normalizeInlines } from './inline';
import type { Align, Block, Inline, ListItem, MathNode } from './types';

export interface ConvertOptions {
  /** Base for resolving relative links and image sources. */
  baseUrl: string;
  /** Site-specific UI chrome to drop (copy buttons, avatars, toolbars). */
  skip?: (el: Element) => boolean;
  /** Site-specific code language lookup when <code class="language-*"> is missing. */
  codeLanguage?: (pre: Element) => string | undefined;
  /** Treat newlines in text as line breaks (user prompts rendered with white-space: pre-wrap). */
  preserveWhitespace?: boolean;
}

const INLINE_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'cite',
  'code',
  'del',
  'dfn',
  'em',
  'font',
  'i',
  'ins',
  'kbd',
  'label',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr',
]);

const ALWAYS_SKIP = new Set([
  'button',
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'video',
  'audio',
  'iframe',
  'select',
  'textarea',
  'form',
  'nav',
  'footer',
  'object',
  'embed',
  'link',
  'meta',
]);

/** Marker carrying a block found inside inline content (an image or display maths inside a <p>). */
type Hoisted = { type: 'hoist'; block: Block };
type Flow = Inline | Hoisted;

export function blocksFromElement(root: Element | DocumentFragment, opts: ConvertOptions): Block[] {
  return new Converter(opts).blocks(root);
}

/** Converts sibling nodes as if they shared a parent. Never clones (cloning <img> can refetch it). */
export function blocksFromNodes(nodes: Node[], opts: ConvertOptions): Block[] {
  return new Converter(opts).nodes(nodes);
}

class Converter {
  constructor(private readonly opts: ConvertOptions) {}

  blocks(parent: Node): Block[] {
    return this.nodes(Array.from(parent.childNodes));
  }

  nodes(list: Node[]): Block[] {
    const out: Block[] = [];
    let pending: Flow[] = [];
    const flush = () => {
      if (pending.length) out.push(...paragraphs(pending));
      pending = [];
    };
    for (const node of list) {
      if (node.nodeType === 3) {
        pending.push(...this.text(node.textContent ?? ''));
        continue;
      }
      if (node.nodeType !== 1) continue;
      const el = node as Element;
      if (this.skipped(el)) continue;
      if (isMathRoot(el)) {
        if (isDisplayMath(el)) {
          flush();
          out.push({ type: 'math', ...math(el) });
        } else pending.push({ type: 'math', ...math(el) });
        continue;
      }
      if (INLINE_TAGS.has(el.localName) && !this.containsBlock(el)) {
        pending.push(...this.inline(el));
        continue;
      }
      if (el.localName === 'br') {
        pending.push({ type: 'break' });
        continue;
      }
      if (el.localName === 'img') {
        pending.push({ type: 'hoist', block: this.image(el) });
        continue;
      }
      flush();
      out.push(...this.block(el));
    }
    flush();
    return out;
  }

  private block(el: Element): Block[] {
    const tag = el.localName;
    switch (tag) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const inlines = this.inlineOnly(el);
        return inlines.length ? [{ type: 'heading', level: Number(tag[1]) as 1, inlines }] : [];
      }
      case 'ul':
      case 'ol':
        return [this.list(el)];
      case 'pre':
        return [this.code(el)];
      case 'table':
        return [this.table(el)];
      case 'blockquote':
        return [{ type: 'blockquote', blocks: this.blocks(el) }];
      case 'hr':
        return [{ type: 'hr' }];
      case 'details': {
        const summaryEl = el.querySelector(':scope > summary');
        const summary = summaryEl?.textContent?.trim() || undefined;
        const body = this.blocks(el).filter((_, i) => i > 0 || !summaryEl);
        return [{ type: 'reasoning', ...(summary ? { summary } : {}), blocks: body }];
      }
      case 'summary':
        return [];
      default:
        // div, section, p, figure, li-like wrappers and unknown elements: treat as containers.
        return this.blocks(el);
    }
  }

  private list(el: Element): Block {
    const ordered = el.localName === 'ol';
    const startAttr = el.getAttribute('start');
    const items: ListItem[] = [];
    for (const li of Array.from(el.children)) {
      if (li.localName !== 'li') continue;
      const box = li.querySelector(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]');
      const item: ListItem = { blocks: this.blocks(li) };
      if (box) item.checked = (box as HTMLInputElement).checked || box.hasAttribute('checked');
      items.push(item);
    }
    const start = startAttr ? Number.parseInt(startAttr, 10) : undefined;
    return {
      type: 'list',
      ordered,
      ...(ordered && start !== undefined && start !== 1 ? { start } : {}),
      items,
    };
  }

  private code(pre: Element): Block {
    const codeEl = pre.querySelector('code');
    let text: string;
    const lines = pre.querySelectorAll('.cm-line');
    if (codeEl) text = codeEl.textContent ?? '';
    else if (lines.length) text = Array.from(lines, (l) => l.textContent ?? '').join('\n');
    else text = textWithout(pre, (e) => this.skipped(e));
    text = text.replace(/\u00a0/g, ' ').replace(/\n$/, '');
    const fromClass = (codeEl ?? pre).className.match(/(?:^|\s)(?:language|lang)-([\w#+.-]+)/)?.[1];
    const language = fromClass ?? this.opts.codeLanguage?.(pre);
    return { type: 'code', ...(language ? { language: language.toLowerCase() } : {}), text };
  }

  private table(table: Element): Block {
    const rows = Array.from(table.querySelectorAll('tr')).filter((r) => r.closest('table') === table);
    const cells = (tr: Element) =>
      Array.from(tr.children).filter((c) => c.localName === 'td' || c.localName === 'th');
    const headRow = rows.find((r) => r.parentElement?.localName === 'thead') ?? rows[0];
    const bodyRows = rows.filter((r) => r !== headRow);
    const headCells = headRow ? cells(headRow) : [];
    const width = Math.max(headCells.length, ...bodyRows.map((r) => cells(r).length));
    const pad = (row: Inline[][]) => row.concat(Array.from({ length: width - row.length }, () => []));
    return {
      type: 'table',
      align: Array.from({ length: width }, (_, i) => alignOf(headCells[i])),
      header: pad(headCells.map((c) => this.cell(c))),
      rows: bodyRows.map((r) => pad(cells(r).map((c) => this.cell(c)))),
    };
  }

  /** A table cell is inline-only; block content inside it is joined with line breaks. */
  private cell(el: Element): Inline[] {
    const out: Inline[] = [];
    for (const b of this.blocks(el)) {
      if (out.length) out.push({ type: 'break' });
      out.push(...flattenBlock(b));
    }
    return normalizeInlines(out);
  }

  private image(el: Element): Block {
    const raw = (el as HTMLImageElement).currentSrc || el.getAttribute('src') || '';
    const src = safeUrl(raw, this.opts.baseUrl, true);
    const alt = (el.getAttribute('alt') ?? '').trim();
    return { type: 'image', ...(src ? { src } : {}), alt };
  }

  private inlineOnly(el: Element): Inline[] {
    return normalizeInlines(this.inlineChildren(el).filter((f): f is Inline => f.type !== 'hoist'));
  }

  private inlineChildren(el: Element): Flow[] {
    const out: Flow[] = [];
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) out.push(...this.text(node.textContent ?? ''));
      else if (node.nodeType === 1) out.push(...this.inline(node as Element));
    }
    return out;
  }

  private inline(el: Element): Flow[] {
    if (this.skipped(el)) return [];
    if (isMathRoot(el)) {
      const m = math(el);
      return isDisplayMath(el)
        ? [{ type: 'hoist', block: { type: 'math', ...m } }]
        : [{ type: 'math', ...m }];
    }
    switch (el.localName) {
      case 'br':
        return [{ type: 'break' }];
      case 'img':
        return [{ type: 'hoist', block: this.image(el) }];
      case 'code':
        return [{ type: 'code', text: (el.textContent ?? '').replace(/\u00a0/g, ' ') }];
      case 'b':
      case 'strong':
        return wrap('bold', this.inlineChildren(el));
      case 'i':
      case 'em':
        return wrap('italic', this.inlineChildren(el));
      case 's':
      case 'del':
      case 'strike':
        return wrap('strike', this.inlineChildren(el));
      case 'a': {
        const href = safeUrl(el.getAttribute('href') ?? '', this.opts.baseUrl, false);
        const children = this.inlineChildren(el);
        if (!href) return children;
        return wrapLink(href, children);
      }
      case 'input':
        return [];
      default:
        if (!INLINE_TAGS.has(el.localName)) {
          // A block element inside inline content: hoist its blocks out.
          return this.block(el).map((block) => ({ type: 'hoist', block }));
        }
        return this.inlineChildren(el);
    }
  }

  private text(raw: string): Inline[] {
    const s = raw.replace(/\u00a0/g, ' ').replace(/\u200b/g, '');
    if (this.opts.preserveWhitespace) {
      const parts = s.split('\n');
      return parts.flatMap((p, i) =>
        i ? [{ type: 'break' } as Inline, { type: 'text', text: p }] : [{ type: 'text', text: p }],
      );
    }
    return [{ type: 'text', text: s.replace(/[\t\n\r ]+/g, ' ') }];
  }

  private skipped(el: Element): boolean {
    if (ALWAYS_SKIP.has(el.localName)) return true;
    if (el.localName === 'input' && el.getAttribute('type') !== 'checkbox') return true;
    if (el.classList.contains('sr-only') || el.hasAttribute('hidden')) return true;
    return this.opts.skip?.(el) ?? false;
  }

  private containsBlock(el: Element): boolean {
    return (
      el.querySelector(
        'p, div, ul, ol, pre, table, blockquote, h1, h2, h3, h4, h5, h6, hr, img, .katex-display',
      ) !== null
    );
  }
}

function math(el: Element): { tex: string; mathml?: MathNode } {
  const mathml = extractMathML(el);
  return { tex: extractTex(el), ...(mathml ? { mathml } : {}) };
}

function wrap(type: 'bold' | 'italic' | 'strike', flow: Flow[]): Flow[] {
  return splitHoisted(flow, (children) => ({ type, children }));
}

function wrapLink(href: string, flow: Flow[]): Flow[] {
  return splitHoisted(flow, (children) => ({ type: 'link', href, children }));
}

/** Wraps runs of inlines, leaving hoisted blocks between the wrapped runs. */
function splitHoisted(flow: Flow[], make: (children: Inline[]) => Inline): Flow[] {
  const out: Flow[] = [];
  let run: Inline[] = [];
  const end = () => {
    if (run.length) out.push(make(run));
    run = [];
  };
  for (const f of flow) {
    if (f.type === 'hoist') {
      end();
      out.push(f);
    } else run.push(f);
  }
  end();
  return out;
}

/** Splits flow content into paragraphs and the blocks hoisted out of it. */
function paragraphs(flow: Flow[]): Block[] {
  const out: Block[] = [];
  let run: Inline[] = [];
  const end = () => {
    // A blank line (two or more consecutive breaks) starts a new paragraph.
    let para: Inline[] = [];
    const endPara = () => {
      const inlines = normalizeInlines(para);
      if (inlines.length) out.push({ type: 'paragraph', inlines });
      para = [];
    };
    normalizeInlines(run).forEach((n, i, all) => {
      if (n.type === 'break' && (all[i + 1]?.type === 'break' || all[i - 1]?.type === 'break')) endPara();
      else para.push(n);
    });
    endPara();
    run = [];
  };
  for (const f of flow) {
    if (f.type === 'hoist') {
      end();
      out.push(f.block);
    } else run.push(f);
  }
  end();
  return out;
}

function flattenBlock(b: Block): Inline[] {
  switch (b.type) {
    case 'paragraph':
    case 'heading':
    case 'footnote':
      return b.inlines;
    case 'math':
      return [{ type: 'math', tex: b.tex, ...(b.mathml ? { mathml: b.mathml } : {}) }];
    case 'code':
      return [{ type: 'code', text: b.text }];
    case 'image':
      return [{ type: 'text', text: b.alt ? `[${b.alt}]` : '[image]' }];
    case 'list':
      return b.items.flatMap((it, i) => [
        ...(i ? [{ type: 'break' } as Inline] : []),
        { type: 'text', text: '• ' } as Inline,
        ...it.blocks.flatMap(flattenBlock),
      ]);
    case 'blockquote':
    case 'reasoning':
      return b.blocks.flatMap(flattenBlock);
    default:
      return [];
  }
}

function alignOf(cell: Element | undefined): Align {
  if (!cell) return null;
  // Read the raw attribute: a strict page CSP can block inline styles, leaving element.style empty.
  const fromStyle = /text-align\s*:\s*(\w+)/i.exec(cell.getAttribute('style') ?? '')?.[1];
  const v = (cell.getAttribute('align') ?? fromStyle ?? '').toLowerCase();
  return v === 'left' || v === 'center' || v === 'right' ? v : null;
}

/** Keeps only http(s), mailto and (for images) data URLs; everything else is dropped. */
export function safeUrl(raw: string, base: string, allowData: boolean): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  if (allowData && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(s)) return s;
  try {
    const u = new URL(s, base);
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') return u.href;
  } catch {
    /* invalid URL */
  }
  return undefined;
}

function textWithout(root: Element, skip: (el: Element) => boolean): string {
  let out = '';
  const walk = (n: Node) => {
    for (const c of Array.from(n.childNodes)) {
      if (c.nodeType === 3) out += c.textContent ?? '';
      else if (c.nodeType === 1 && !skip(c as Element)) walk(c);
    }
  };
  walk(root);
  return out;
}
