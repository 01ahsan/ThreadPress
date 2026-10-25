// PDF: renders the conversation into a hidden frame and opens the browser's print dialog,
// where the user picks "Save as PDF". Text stays selectable and equations stay vector.

import type { Conversation } from '../ir/types';
import { buildDocument, documentCss } from './html-render';
import type { ExportOptions } from './options';

export async function printConversation(
  doc: Document,
  conv: Conversation,
  opts: ExportOptions,
  title: string,
): Promise<void> {
  const frame = doc.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('tabindex', '-1');
  Object.assign(frame.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '1px',
    height: '1px',
    border: '0',
    opacity: '0',
  });
  doc.documentElement.appendChild(frame);
  const win = frame.contentWindow;
  const fdoc = frame.contentDocument;
  if (!win || !fdoc) {
    frame.remove();
    throw new Error('Could not open the print view');
  }

  fdoc.title = title; // Chrome suggests this as the PDF file name.
  const css = documentCss(opts);
  try {
    // Not subject to the page's style-src policy, unlike a <style> element.
    const sheet = new (win as unknown as typeof globalThis).CSSStyleSheet();
    sheet.replaceSync(css);
    fdoc.adoptedStyleSheets = [sheet];
  } catch {
    const style = fdoc.createElement('style');
    style.textContent = css;
    fdoc.head.append(style);
  }
  fdoc.body.append(buildDocument(fdoc, conv, opts));

  // Let layout settle before printing.
  await new Promise((r) => setTimeout(r, 120));
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(() => frame.isConnected && frame.remove(), 5 * 60_000);
  win.focus();
  win.print();
}
