// An "Export" icon placed next to each message's own Copy button. Clicking it opens a small
// menu that exports just that message (and, for an answer, the question before it).

import type { Adapter } from '../adapters/types';
import { buildConversation, deliver } from '../export-flow';
import { renderExport, type FormatId } from '../exporters/index';
import { DEFAULT_OPTIONS, type ExportOptions } from '../exporters/options';
import type { Message, Role } from '../ir/types';
import { t } from './i18n';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COPY = /copy|কপি|复制|複製|コピー|복사|copiar|kopieren|copier|copia|копир|نسخ|kopyala|salin|sao chép/i;

const BUTTON_CSS = `
:host { display: inline-flex; vertical-align: middle; }
button {
  display: inline-grid; place-items: center; width: var(--tp-size, 32px); height: var(--tp-size, 32px);
  border: 0; border-radius: var(--tp-radius, 8px); background: transparent; color: inherit; cursor: pointer; padding: 0; opacity: .85;
}
button:hover { background: color-mix(in srgb, currentColor 12%, transparent); opacity: 1; }
button:focus-visible { outline: 2px solid #2457c5; outline-offset: 1px; }
svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
`;

const MENU_CSS = `
:host { all: initial; }
.menu {
  position: fixed; z-index: 2147483647; min-width: 210px; padding: 6px; border-radius: 12px;
  background: #fff; color: #16181d; border: 1px solid #e6e8ee; box-shadow: 0 12px 36px rgba(15, 20, 35, .22);
  font: 13.5px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Bengali", sans-serif;
}
@media (prefers-color-scheme: dark) { .menu { background: #1b1d23; color: #eceef4; border-color: #30333c; } .item:hover, .item:focus-visible { background: #2b2f38; } .sep { background: #30333c; } }
.title { padding: 6px 10px 4px; font-size: 11.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; opacity: .6; }
.item { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; background: none; color: inherit; font: inherit; text-align: left; padding: 7px 10px; border-radius: 8px; cursor: pointer; }
.item:hover, .item:focus-visible { background: #f1f3f7; outline: none; }
.badge { display: grid; place-items: center; min-width: 34px; height: 20px; border-radius: 5px; font: 800 9.5px/1 ui-monospace, Consolas, monospace; color: #fff; }
.b-pdf { background: #d93f2e; } .b-docx { background: #2b62d9; } .b-md { background: #3a3f4b; } .b-copy { background: #6b7280; }
.sep { height: 1px; background: #e6e8ee; margin: 5px 4px; }
label { display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; }
input { accent-color: #2457c5; margin: 0; }
`;

interface Options {
  /** Opens the full ThreadPress panel. */
  onMore: () => void;
}

export function startMessageButtons(doc: Document, getAdapter: () => Adapter | null, opts: Options): void {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      scan();
    }, 400);
  };

  const scan = () => {
    const adapter = getAdapter();
    if (!adapter) return;
    const turns = adapter.turns();
    const set = new Set(turns.map((t) => t.el));
    for (const turn of turns) {
      const copy = findCopyButton(turn.el, set);
      if (!copy) continue;
      // Sites often wrap each toolbar button in its own element; insert after that wrapper so
      // the icon lines up with the others, but only when it really is one item of a toolbar.
      const wrap = copy.parentElement;
      const isToolItem = (el: Element) =>
        (el.matches('button, [role="button"]') || !!el.querySelector('button, [role="button"]')) &&
        (el.textContent ?? '').trim().length < 30;
      const toolbarSize = wrap?.parentElement
        ? Array.from(wrap.parentElement.children).filter(isToolItem).length
        : 0;
      const item = wrap && wrap !== turn.el && wrap.childElementCount === 1 && toolbarSize > 1 ? wrap : copy;
      if (item.nextElementSibling?.localName === 'threadpress-msg') continue;
      item.after(makeButton(doc, copy, (anchor) => openMenu(doc, adapter, turn, opts, anchor)));
    }
  };

  new MutationObserver(schedule).observe(doc.body, { childList: true, subtree: true });
  scan();
}

/** The message's own Copy button: inside the message, or in a toolbar right after it. */
function findCopyButton(turn: Element, turns: Set<Element>): HTMLElement | null {
  const isCopy = (b: Element) =>
    COPY.test(b.getAttribute('aria-label') ?? '') ||
    COPY.test(b.getAttribute('title') ?? '') ||
    COPY.test(b.getAttribute('data-testid') ?? '') ||
    ((b.textContent ?? '').trim().length < 20 && COPY.test(b.textContent ?? ''));
  const ownedBy = (b: Element) => {
    for (let p = b.parentElement; p; p = p.parentElement) if (turns.has(p)) return p;
    return null;
  };
  // The message's toolbar sits at the bottom, so prefer the last Copy button, and skip the
  // Copy buttons that belong to code blocks inside the answer.
  const own = Array.from(turn.querySelectorAll('button, [role="button"]')).filter(
    (b) =>
      isCopy(b) &&
      ownedBy(b) === turn &&
      !b.closest('pre, code, .markdown, [class*="code-block"], [class*="codeblock"]'),
  );
  if (own.length) return own[own.length - 1] as HTMLElement;
  // Toolbar placed just after the message (DeepSeek, Gemini): look in the next couple of siblings.
  let sib = turn.nextElementSibling;
  for (let i = 0; sib && i < 2; i++, sib = sib.nextElementSibling) {
    if (turns.has(sib) || Array.from(turns).some((t) => sib?.contains(t))) break;
    const b = Array.from(sib.querySelectorAll('button, [role="button"]')).find(isCopy);
    if (b) return b as HTMLElement;
  }
  return null;
}

function makeButton(doc: Document, copy: HTMLElement, onClick: (anchor: Element) => void): HTMLElement {
  const host = doc.createElement('threadpress-msg');
  const shadow = host.attachShadow({ mode: 'open' });
  adopt(doc, shadow, BUTTON_CSS);
  // Match the size and shape of the site's own Copy button.
  const cs = getComputedStyle(copy);
  const size = Math.round(Math.max(24, Math.min(40, copy.getBoundingClientRect().height || 32)));
  host.style.setProperty('--tp-size', `${size}px`);
  if (cs.borderRadius) host.style.setProperty('--tp-radius', cs.borderRadius);
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.title = t('exportMessage');
  btn.setAttribute('aria-label', t('exportMessage'));
  btn.setAttribute('aria-haspopup', 'menu');
  btn.append(exportIcon(doc));
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick(host);
  });
  shadow.append(btn);
  return host;
}

let openMenuHost: HTMLElement | null = null;

function openMenu(
  doc: Document,
  adapter: Adapter,
  turn: { el: Element; role: Role },
  opts: Options,
  anchor: Element,
): void {
  openMenuHost?.remove();
  const host = doc.createElement('threadpress-menu');
  const shadow = host.attachShadow({ mode: 'open' });
  adopt(doc, shadow, MENU_CSS);
  const menu = doc.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');

  const title = doc.createElement('div');
  title.className = 'title';
  title.textContent = t('exportMessageTitle');
  menu.append(title);

  let includeQuestion = turn.role === 'assistant';
  const close = () => {
    host.remove();
    openMenuHost = null;
    doc.removeEventListener('pointerdown', outside, true);
    doc.removeEventListener('keydown', onKey, true);
  };

  const messages = (): Message[] => {
    const turns = adapter.turns();
    const i = turns.findIndex((x) => x.el === turn.el);
    const own = adapter.read(turn);
    const prev = i > 0 ? turns[i - 1] : undefined;
    return includeQuestion && prev && prev.role === 'user' ? [adapter.read(prev), own] : [own];
  };

  const run = (format: FormatId | 'copy') => {
    close();
    const url = new URL(location.href);
    const options: ExportOptions = {
      ...DEFAULT_OPTIONS,
      paper: /^en-(US|CA)|es-MX/.test(navigator.language) ? 'Letter' : 'A4',
      labels: { user: t('you'), assistant: '', unknown: t('scopeHighlight') },
    };
    const conv = buildConversation(doc, url, adapter, messages());
    if (format === 'copy') void navigator.clipboard.writeText(renderExport(conv, 'md', options) as string);
    else void deliver(doc, conv, format, options);
  };

  const item = (badge: string, cls: string, label: string, action: () => void) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'item';
    b.setAttribute('role', 'menuitem');
    const s = doc.createElement('span');
    s.className = `badge ${cls}`;
    s.textContent = badge;
    s.setAttribute('aria-hidden', 'true');
    const l = doc.createElement('span');
    l.textContent = label;
    b.append(s, l);
    b.addEventListener('click', action);
    return b;
  };

  menu.append(
    item('PDF', 'b-pdf', 'PDF', () => run('pdf')),
    item('DOC', 'b-docx', 'Word', () => run('docx')),
    item('MD', 'b-md', 'Markdown', () => run('md')),
    item('⧉', 'b-copy', t('copy'), () => run('copy')),
  );
  if (turn.role === 'assistant') {
    const sep = doc.createElement('div');
    sep.className = 'sep';
    const label = doc.createElement('label');
    const box = doc.createElement('input');
    box.type = 'checkbox';
    box.checked = includeQuestion;
    box.addEventListener('change', () => (includeQuestion = box.checked));
    const text = doc.createElement('span');
    text.textContent = t('includeQuestion');
    label.append(box, text);
    menu.append(sep, label);
  }
  const sep2 = doc.createElement('div');
  sep2.className = 'sep';
  const more = doc.createElement('button');
  more.type = 'button';
  more.className = 'item';
  more.setAttribute('role', 'menuitem');
  more.textContent = t('moreFormats');
  more.addEventListener('click', () => {
    close();
    opts.onMore();
  });
  menu.append(sep2, more);
  shadow.append(menu);
  doc.documentElement.append(host);
  openMenuHost = host;

  // Place the menu next to the button, kept inside the window.
  const r = anchor.getBoundingClientRect();
  const mr = menu.getBoundingClientRect();
  const top = r.bottom + 6 + mr.height > window.innerHeight ? r.top - mr.height - 6 : r.bottom + 6;
  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.left = `${Math.min(window.innerWidth - mr.width - 8, Math.max(8, r.left))}px`;
  (menu.querySelector('.item') as HTMLElement | null)?.focus();

  function outside(e: Event) {
    if (!e.composedPath().includes(host)) close();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
  doc.addEventListener('pointerdown', outside, true);
  doc.addEventListener('keydown', onKey, true);
}

function adopt(doc: Document, shadow: ShadowRoot, css: string): void {
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    const style = doc.createElement('style');
    style.textContent = css;
    shadow.append(style);
  }
}

/** Download-into-tray icon, drawn with DOM calls (Trusted Types pages forbid HTML strings). */
function exportIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of ['M12 4v10', 'M8 10l4 4 4-4', 'M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3']) {
    const p = doc.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
