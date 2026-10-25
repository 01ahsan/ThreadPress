// "Save page layout": a map of the page's structure for fixing a site, with no chat content.
// Kept: tag names, class names, and short technical attribute values (data-*, role, id).
// Dropped: all text (replaced by its length), links, image addresses, titles, labels, inputs.

import { VERSION } from './version';

const KEEP_ATTRS = /^(data-[\w-]+|role|id|dir|lang|type|aria-hidden|display|encoding|contenteditable)$/;
const SAFE_VALUE = /^[\w:./#-]{1,48}$/;
const OPAQUE = new Set([
  'svg',
  'math',
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'canvas',
  'video',
  'audio',
  'textarea',
  'input',
  'select',
]);
const MAX_LINES = 25_000;

export function layoutReport(doc: Document, url: URL): string {
  const lines: string[] = [
    `ThreadPress ${VERSION} page layout report`,
    `Site: ${url.hostname}`,
    `Page: ${url.pathname.replace(/[0-9a-f-]{8,}|[A-Za-z0-9_-]{16,}/g, ':id')}`,
    `Window: ${window.innerWidth}x${window.innerHeight}`,
    'This file contains no chat text: every text is replaced by its length.',
    '',
  ];

  const describe = (el: Element): string => {
    let s = `<${el.localName}`;
    const classes = Array.from(el.classList).slice(0, 12);
    if (classes.length) s += ` .${classes.join('.')}`;
    for (const { name, value } of Array.from(el.attributes)) {
      if (!KEEP_ATTRS.test(name)) {
        if (name === 'href' || name === 'src') s += ` ${name}`;
        continue;
      }
      s += SAFE_VALUE.test(value) ? ` ${name}="${value}"` : ` ${name}`;
    }
    const style = el instanceof HTMLElement ? getComputedStyle(el) : null;
    if (
      style &&
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      el.scrollHeight > el.clientHeight + 8
    ) {
      s += ` {scrolls ${el.scrollHeight}/${el.clientHeight}${style.flexDirection.includes('reverse') ? ' reversed' : ''}}`;
    }
    return `${s}>`;
  };

  /** Short labels inside visually hidden elements are UI text ("You said:"), not chat content. */
  const isUiLabel = (el: Element, text: string) =>
    text.length <= 30 && (el.classList.contains('sr-only') || el.classList.contains('cdk-visually-hidden'));

  const walk = (el: Element, depth: number) => {
    if (lines.length > MAX_LINES || depth > 60) return;
    if (el.localName.startsWith('threadpress-')) return;
    const pad = '  '.repeat(depth);
    lines.push(pad + describe(el));
    if (OPAQUE.has(el.localName)) return;

    let prevSig = '';
    let repeats = 0;
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === 3) {
        const t = (node.textContent ?? '').trim();
        if (t) lines.push(`${pad}  ${isUiLabel(el, t) ? JSON.stringify(t) : `#text(${t.length})`}`);
        continue;
      }
      if (node.nodeType !== 1) continue;
      const child = node as Element;
      const sig = `${child.localName}.${child.className}`;
      repeats = sig === prevSig ? repeats + 1 : 0;
      prevSig = sig;
      // Long runs of identical siblings: show the first few in full, then summarise.
      if (repeats >= 3 && repeats < 200 && el.childElementCount > 12) {
        if (repeats === 3) lines.push(`${pad}  … more <${child.localName}> siblings like the above`);
        continue;
      }
      walk(child, depth + 1);
    }
  };

  walk(doc.body, 0);
  if (lines.length > MAX_LINES) lines.push('… (truncated)');
  return lines.join('\n') + '\n';
}
