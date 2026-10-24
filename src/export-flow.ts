// Orchestrates one export: load history -> build IR -> render. UI-agnostic so the
// bookmarklet and the extension share it.

import { messagesFromPlainText, messagesFromRanges } from './adapters/generic';
import { adapterFor } from './adapters/registry';
import type { Adapter } from './adapters/types';
import { exportFileName } from './exporters/filename';
import { formatById, renderExport, type FormatId } from './exporters/index';
import type { ExportOptions } from './exporters/options';
import { IR_VERSION, type Conversation, type Message } from './ir/types';

export type Status = { kind: 'loading'; loaded: number } | { kind: 'reading'; done: number; total: number };

export type Source = 'adapter' | 'selection' | 'plain-text';

export interface ExportResult {
  conversation: Conversation;
  text: string;
  fileName: string;
  mime: string;
  source: Source;
}

export interface ExportRequest {
  doc: Document;
  url: URL;
  format: FormatId;
  options: ExportOptions;
  signal: AbortSignal;
  onStatus?: (s: Status) => void;
  /** Only these message elements (selection mode). */
  only?: Set<Element>;
  /** Export this highlighted text instead of whole messages. */
  ranges?: Range[];
  now?: Date;
}

export function detect(doc: Document, url: URL): Adapter | null {
  return adapterFor({ doc, url });
}

export async function runExport(req: ExportRequest): Promise<ExportResult> {
  const { doc, url, signal, onStatus } = req;
  const adapter = detect(doc, url);
  let messages: Message[] = [];
  let source: Source = 'adapter';

  const selected = req.ranges?.length ? messagesFromRanges(req.ranges, url.href) : null;
  if (selected) {
    messages = selected;
    source = 'selection';
  } else if (adapter) {
    if (!req.only) await adapter.loadFullHistory((loaded) => onStatus?.({ kind: 'loading', loaded }), signal);
    messages = await adapter.getMessages(
      signal,
      (done, total) => onStatus?.({ kind: 'reading', done, total }),
      req.only,
    );
  }
  if (!messages.length) {
    messages = messagesFromPlainText(doc);
    source = 'plain-text';
  }

  const now = req.now ?? new Date();
  const title = adapter?.getTitle() || doc.title.trim() || 'Conversation';
  const conversation: Conversation = {
    version: IR_VERSION,
    title,
    site: adapter?.site.id ?? 'unknown',
    url: url.href,
    exportedAt: now.toISOString(),
    messages,
  };
  const format = formatById(req.format);
  return {
    conversation,
    text: renderExport(conversation, req.format, req.options),
    fileName: exportFileName(adapter?.site.id ?? 'web', title, now, format.ext),
    mime: format.mime,
    source,
  };
}
