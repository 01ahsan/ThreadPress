// Orchestrates exports: read the chat into IR once, then render any format from it.
// UI-agnostic so the bookmarklet and the extension share it.

import { messagesFromPlainText, messagesFromRanges } from './adapters/generic';
import { adapterFor } from './adapters/registry';
import type { Adapter, CollectedMessage, Progress } from './adapters/types';
import { downloadFile } from './exporters/download';
import { exportFileName } from './exporters/filename';
import { formatById, renderExport, type FormatId } from './exporters/index';
import { prepare, type ExportOptions } from './exporters/options';
import { printConversation } from './exporters/print';
import { IR_VERSION, type Conversation, type Message } from './ir/types';

export type { Progress };

export function detect(doc: Document, url: URL): Adapter | null {
  return adapterFor({ doc, url });
}

export interface Collected {
  messages: CollectedMessage[];
  /** 'plain-text' means the site's layout was not recognised. */
  source: 'adapter' | 'plain-text';
}

/** Reads the whole conversation (scrolling as needed). Falls back to plain text if nothing is found. */
export async function collectChat(
  doc: Document,
  adapter: Adapter | null,
  signal: AbortSignal,
  onProgress: (p: Progress) => void,
): Promise<Collected> {
  const messages = adapter ? await adapter.collect(signal, onProgress) : [];
  if (messages.length) return { messages, source: 'adapter' };
  const fallback = messagesFromPlainText(doc).map((message, i) => ({
    key: `text:${i}`,
    message,
    preview: '',
  }));
  return { messages: fallback, source: 'plain-text' };
}

export function selectionMessages(ranges: Range[], url: URL): Message[] {
  return messagesFromRanges(ranges, url.href) ?? [];
}

export function buildConversation(
  doc: Document,
  url: URL,
  adapter: Adapter | null,
  messages: Message[],
  now = new Date(),
): Conversation {
  return {
    version: IR_VERSION,
    title: adapter?.getTitle() || doc.title.trim() || 'Conversation',
    site: adapter?.site.id ?? 'unknown',
    url: url.href,
    exportedAt: now.toISOString(),
    messages,
  };
}

/** Renders a conversation and hands it to the user: a download, or the print dialog for PDF. */
export async function deliver(
  doc: Document,
  conv: Conversation,
  format: FormatId,
  options: ExportOptions,
): Promise<string> {
  const f = formatById(format);
  const fileName = exportFileName(
    conv.site === 'unknown' ? 'web' : conv.site,
    conv.title,
    new Date(conv.exportedAt),
    f.ext,
  );
  if (format === 'pdf') {
    await printConversation(doc, prepare(conv, options), options, fileName.replace(/\.pdf$/, ''));
  } else {
    downloadFile(doc, fileName, renderExport(conv, format, options), f.mime);
  }
  return fileName;
}
