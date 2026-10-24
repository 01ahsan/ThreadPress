// Fallbacks used when a site adapter cannot find messages:
// 1. the user's highlighted selection, as rich text;
// 2. the visible conversation area as plain text.
// Neither reads anything outside the chat area (no sidebar, no account menu).

import { blocksFromElement } from '../ir/from-dom';
import type { Block, Message } from '../ir/types';

/** Snapshot of the current page selection, kept so clicking the panel cannot lose it. */
export function currentRanges(doc: Document, ignore?: Node): Range[] {
  const sel = doc.getSelection();
  if (!sel || sel.isCollapsed) return [];
  const out: Range[] = [];
  for (let i = 0; i < sel.rangeCount; i++) {
    const r = sel.getRangeAt(i);
    if (!ignore || !ignore.contains(r.commonAncestorContainer)) out.push(r.cloneRange());
  }
  return out;
}

export function messagesFromRanges(ranges: Range[], baseUrl: string): Message[] | null {
  const blocks = ranges.flatMap((r) => blocksFromElement(rangeToInertFragment(r), { baseUrl }));
  return blocks.length ? [{ role: 'unknown', blocks }] : null;
}

/**
 * Copies the selected part of the page into an inert document, where nothing loads or runs.
 * (Range.cloneContents would create live copies, and a copied <img> can fetch its image again.)
 */
function rangeToInertFragment(range: Range): DocumentFragment {
  const inert = document.implementation.createHTMLDocument('');
  const frag = inert.createDocumentFragment();
  const copy = (node: Node, into: Node) => {
    if (!range.intersectsNode(node)) return;
    if (node.nodeType === 3) {
      const text = node.textContent ?? '';
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : text.length;
      into.appendChild(inert.createTextNode(text.slice(start, end)));
    } else if (node.nodeType === 1) {
      const shallow = inert.importNode(node, false);
      into.appendChild(shallow);
      node.childNodes.forEach((child) => copy(child, shallow));
    }
  };
  const root = range.commonAncestorContainer;
  // Keep the nearest element around the selection so code, lists and formatting survive.
  copy(root.nodeType === 1 ? root : (root.parentElement ?? root), frag);
  return frag;
}

export function messagesFromPlainText(doc: Document): Message[] {
  const main = doc.querySelector('main') ?? doc.querySelector('[role="main"]');
  const text = (main as HTMLElement | null)?.innerText ?? '';
  const blocks: Block[] = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({
      type: 'paragraph',
      inlines: p
        .split('\n')
        .flatMap((line, i) => [
          ...(i ? [{ type: 'break' } as const] : []),
          { type: 'text', text: line } as const,
        ]),
    }));
  return blocks.length ? [{ role: 'unknown', blocks }] : [];
}
