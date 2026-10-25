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
:host { display: inline-flex; vertical-align: middle; margin-inline: 2px; }
/* Brand blue blended with the site's text colour, so it reads well on light and dark themes
   while still standing apart from the site's own grey icons. */
button {
  --tp-blue: color-mix(in srgb, #3b6fe0 72%, currentColor);
  display: inline-grid; place-items: center; width: var(--tp-size, 32px); height: var(--tp-size, 32px);
  border: 1px solid color-mix(in srgb, var(--tp-blue) 30%, transparent); border-radius: var(--tp-radius, 8px);
  background: color-mix(in srgb, var(--tp-blue) 9%, transparent); color: var(--tp-blue);
  cursor: pointer; padding: 0; transition: background .12s, border-color .12s;
}
button:hover { background: color-mix(in srgb, var(--tp-blue) 18%, transparent); border-color: color-mix(in srgb, var(--tp-blue) 55%, transparent); }
button:focus-visible { outline: 2px solid var(--tp-blue); outline-offset: 1px; }
svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 2.1; stroke-linecap: round; stroke-linejoin: round; }
@media (prefers-reduced-motion: reduce) { button { transition: none; } }
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

  // Messages that already have our button (skipped cheaply while an answer streams in).
  const done = new WeakMap<Element, HTMLElement>();
  const scan = () => {
    const adapter = getAdapter();
    if (!adapter) return;
    const turns = adapter.turns();
    const set = new Set(turns.map((t) => t.el));
    for (const [i, turn] of turns.entries()) {
      if (done.get(turn.el)?.isConnected) continue;
      const copy = (findCopyButton(turn.el, set, turns[i + 1]?.el ?? null) ??
        adapter.toolbarAnchor(turn.el)) as HTMLElement | null;
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
      const existing = item.nextElementSibling;
      if (existing?.localName === 'threadpress-msg') {
        done.set(turn.el, existing as HTMLElement);
        continue;
      }
      const host = makeButton(doc, copy, (anchor) => openMenu(doc, adapter, turn, opts, anchor));
      item.after(host);
      done.set(turn.el, host);
    }
  };

  new MutationObserver(schedule).observe(doc.body, { childList: true, subtree: true });
  scan();
}

/** The message's own Copy button: inside the message, or in a toolbar right after it. */
function findCopyButton(turn: Element, turns: Set<Element>, next: Element | null): HTMLElement | null {
  const isCopy = (b: Element) =>
    COPY.test(b.getAttribute('aria-label') ?? '') ||
    COPY.test(b.getAttribute('title') ?? '') ||
    COPY.test(b.getAttribute('data-testid') ?? '') ||
    ((b.textContent ?? '').trim().length < 20 && COPY.test(b.textContent ?? ''));
  const ownedBy = (b: Element, stop?: Element) => {
    for (let p = b.parentElement; p && p !== stop; p = p.parentElement) if (turns.has(p)) return p;
    return null;
  };
  // The message's toolbar sits at the bottom, so prefer the last Copy button, and skip the
  // Copy buttons that belong to code blocks inside the answer.
  const own = Array.from(turn.querySelectorAll('button, [role="button"]')).filter(
    (b) =>
      isCopy(b) &&
      ownedBy(b) === turn &&
      !b.closest(
        'pre, code, code-block, .markdown, [data-code-block], [data-code-block-controls], [data-markdown-text-style], [class*="MarkdownRoot"], [class*="code-block"], [class*="codeblock"]',
      ),
  );
  if (own.length) return own[own.length - 1] as HTMLElement;
  // Toolbar placed after the message (DeepSeek, Gemini, ChatGPT): look at the next couple of
  // siblings, climbing out a few levels while this message is the last one in its container
  // (ChatGPT puts an answer's toolbar at the end of the question-and-answer group).
  let node: Element | null = turn;
  for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
    // Messages are in page order, so only the next message can be "later" inside a container.
    if (depth > 0 && next && node.contains(next)) break;
    let sib = node.nextElementSibling;
    for (let i = 0; sib && i < 2; i++, sib = sib.nextElementSibling) {
      if (turns.has(sib) || (next && sib.contains(next))) return null;
      const holder = sib;
      // A Copy button inside another message belongs to that message, not this one.
      const b = Array.from(holder.querySelectorAll('button, [role="button"]')).find(
        (x) => isCopy(x) && !ownedBy(x, holder),
      );
      if (b) return b as HTMLElement;
    }
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
    const task = async () => {
      const conv = buildConversation(doc, url, adapter, messages());
      if (format === 'copy') {
        await navigator.clipboard.writeText(renderExport(conv, 'md', options) as string);
        return t('copied', { n: conv.messages.length });
      }
      const name = await deliver(doc, conv, format, options);
      return format === 'pdf' ? t('printed') : t('saved', { file: name });
    };
    task().then(
      (msg) => toast(doc, msg, false),
      (err: Error) => toast(doc, t('failed', { error: err.message }), true),
    );
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

/** A short message at the bottom of the window, gone after a few seconds. */
function toast(doc: Document, message: string, error: boolean): void {
  const host = doc.createElement('threadpress-toast');
  const shadow = host.attachShadow({ mode: 'open' });
  adopt(
    doc,
    shadow,
    `:host { all: initial; }
     div { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647; max-width: min(520px, calc(100vw - 32px));
       padding: 10px 16px; border-radius: 10px; background: ${error ? '#b42318' : '#1b1d23'}; color: #fff; box-shadow: 0 8px 24px rgba(0,0,0,.25);
       font: 13.5px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Bengali", sans-serif; overflow-wrap: anywhere; }`,
  );
  const box = doc.createElement('div');
  box.setAttribute('role', error ? 'alert' : 'status');
  box.textContent = message;
  shadow.append(box);
  doc.documentElement.append(host);
  setTimeout(() => host.remove(), error ? 6000 : 3500);
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
