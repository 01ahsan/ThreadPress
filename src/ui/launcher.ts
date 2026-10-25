// A small floating button shown on chat pages only. Hover to reveal "Export chat",
// drag it up or down the edge of the window, or hide it until the page is reloaded.

import { t } from './i18n';

const CSS = `
:host { all: initial; }
.wrap {
  position: fixed; right: 0; z-index: 2147483646; display: flex; align-items: center; gap: 4px;
  transform: translateY(-50%); font: 600 13px/1 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Bengali", sans-serif;
  user-select: none; -webkit-user-select: none; touch-action: none;
}
.btn {
  display: flex; align-items: center; height: 40px; padding: 0 9px;
  border: 1px solid rgba(20, 30, 60, .12); border-right: 0; border-radius: 12px 0 0 12px; cursor: pointer;
  background: #2457c5; color: #fff; box-shadow: 0 4px 16px rgba(15, 20, 35, .22);
  transition: background .12s; opacity: .92;
}
.btn:hover, .btn:focus-visible, .wrap.dragging .btn { opacity: 1; }
.btn:hover { background: #1d4aa8; }
.btn:focus-visible { outline: 2px solid #9bb7ff; outline-offset: 2px; }
.btn svg { width: 24px; height: 24px; flex: none; }
.label { white-space: nowrap; max-width: 0; overflow: hidden; transition: max-width .2s ease, margin .2s ease; }
/* Stay open while the pointer is anywhere on the tab, including the hide button, so the
   hide button does not move away as the pointer travels to it. */
.wrap:hover .label, .wrap:focus-within .label { max-width: 180px; margin: 0 4px 0 8px; }
.hide {
  width: 22px; height: 22px; border-radius: 50%; border: 0; cursor: pointer; display: grid; place-items: center;
  background: rgba(20, 24, 40, .72); color: #fff; opacity: 0; transition: opacity .15s;
  position: absolute; top: -10px; left: -10px;
}
.wrap:hover .hide, .hide:focus-visible { opacity: 1; }
.hide svg { width: 12px; height: 12px; }
@media (prefers-color-scheme: dark) { .btn { background: #3d6ee0; border-color: rgba(255,255,255,.14); } .btn:hover { background: #4f7deb; } }
@media (prefers-reduced-motion: reduce) { .btn, .hide, .label { transition: none; } }
`;

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface Launcher {
  setVisible(visible: boolean): void;
}

export function mountLauncher(doc: Document, onClick: () => void): Launcher {
  const host = doc.createElement('threadpress-launcher');
  const shadow = host.attachShadow({ mode: 'open' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    const style = doc.createElement('style');
    style.textContent = CSS;
    shadow.append(style);
  }

  const wrap = doc.createElement('div');
  wrap.className = 'wrap';
  wrap.style.top = '55%';

  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.title = 'ThreadPress';
  btn.setAttribute('aria-label', `ThreadPress: ${t('launcher')}`);
  btn.append(icon(doc));
  const label = doc.createElement('span');
  label.className = 'label';
  label.textContent = t('launcher');
  btn.append(label);

  const hide = doc.createElement('button');
  hide.type = 'button';
  hide.className = 'hide';
  hide.title = t('hideButton');
  hide.setAttribute('aria-label', t('hideButton'));
  const x = doc.createElementNS(SVG_NS, 'svg');
  x.setAttribute('viewBox', '0 0 12 12');
  const xp = doc.createElementNS(SVG_NS, 'path');
  xp.setAttribute('d', 'M2 2l8 8M10 2 2 10');
  xp.setAttribute('stroke', 'currentColor');
  xp.setAttribute('stroke-width', '2');
  xp.setAttribute('stroke-linecap', 'round');
  x.append(xp);
  hide.append(x);

  wrap.append(hide, btn);
  shadow.append(wrap);

  // Drag vertically; a press without movement is a click.
  let startY = 0;
  let startTop = 0;
  let dragged = false;
  btn.addEventListener('pointerdown', (e) => {
    startY = e.clientY;
    startTop = wrap.getBoundingClientRect().top + wrap.offsetHeight / 2;
    dragged = false;
    btn.setPointerCapture(e.pointerId);
  });
  btn.addEventListener('pointermove', (e) => {
    if (!btn.hasPointerCapture(e.pointerId)) return;
    const dy = e.clientY - startY;
    if (!dragged && Math.abs(dy) < 5) return;
    dragged = true;
    wrap.classList.add('dragging');
    const y = Math.min(window.innerHeight - 30, Math.max(30, startTop + dy));
    wrap.style.top = `${y}px`;
  });
  btn.addEventListener('pointerup', () => wrap.classList.remove('dragging'));
  btn.addEventListener('click', (e) => {
    if (dragged) {
      e.preventDefault();
      dragged = false;
      return;
    }
    onClick();
  });

  let dismissed = false;
  hide.addEventListener('click', () => {
    dismissed = true;
    host.remove();
  });

  return {
    setVisible(visible) {
      if (dismissed) return;
      if (visible && !host.isConnected) doc.documentElement.appendChild(host);
      if (!visible && host.isConnected) host.remove();
    },
  };
}

/** Builds the logo with DOM calls (pages with Trusted Types forbid HTML strings). */
function icon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 128 128');
  svg.setAttribute('aria-hidden', 'true');
  const bubble = doc.createElementNS(SVG_NS, 'path');
  bubble.setAttribute(
    'd',
    'M32 24h64a12 12 0 0 1 12 12v46a12 12 0 0 1-12 12H62l-22 18V94h-8a12 12 0 0 1-12-12V36a12 12 0 0 1 12-12z',
  );
  bubble.setAttribute('fill', '#fff');
  const arrow = doc.createElementNS(SVG_NS, 'path');
  arrow.setAttribute('d', 'M64 37v31M50 55l14 14 14-14M48 80h32');
  arrow.setAttribute('fill', 'none');
  arrow.setAttribute('stroke', '#2457C5');
  arrow.setAttribute('stroke-width', '10');
  arrow.setAttribute('stroke-linecap', 'round');
  arrow.setAttribute('stroke-linejoin', 'round');
  svg.append(bubble, arrow);
  return svg;
}
