import type { Conversation } from '../ir/types';
import { toDocx } from './docx/index';
import { toHtml } from './html-render';
import { toJson } from './json';
import { toLatex } from './latex';
import { toMarkdown } from './markdown';
import { prepare, type ExportOptions } from './options';
import { toText } from './text';

export type FormatId = 'pdf' | 'docx' | 'md' | 'html' | 'txt' | 'json' | 'tex';

export interface Format {
  id: FormatId;
  label: string;
  ext: string;
  mime: string;
  /** PDF is produced through the print dialog rather than rendered here. */
  render?: (conv: Conversation, opts: ExportOptions) => string | Uint8Array;
}

export const FORMATS: readonly Format[] = [
  { id: 'pdf', label: 'PDF', ext: 'pdf', mime: 'application/pdf' },
  {
    id: 'docx',
    label: 'Word',
    ext: 'docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    render: toDocx,
  },
  { id: 'md', label: 'Markdown', ext: 'md', mime: 'text/markdown', render: toMarkdown },
  { id: 'html', label: 'HTML', ext: 'html', mime: 'text/html', render: toHtml },
  { id: 'txt', label: 'Text', ext: 'txt', mime: 'text/plain', render: toText },
  { id: 'json', label: 'JSON', ext: 'json', mime: 'application/json', render: (c) => toJson(c) },
  { id: 'tex', label: 'LaTeX', ext: 'tex', mime: 'application/x-tex', render: toLatex },
];

export function formatById(id: FormatId): Format {
  const f = FORMATS.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown format: ${id}`);
  return f;
}

export function renderExport(conv: Conversation, format: FormatId, opts: ExportOptions): string | Uint8Array {
  const f = formatById(format);
  if (!f.render) throw new Error(`${f.label} is exported through the print dialog`);
  return f.render(prepare(conv, opts), opts);
}
