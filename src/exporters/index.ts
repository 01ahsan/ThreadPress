import type { Conversation } from '../ir/types';
import { toJson } from './json';
import { toMarkdown } from './markdown';
import { prepare, type ExportOptions } from './options';
import { toText } from './text';

export type FormatId = 'md' | 'json' | 'txt';

export interface Format {
  id: FormatId;
  ext: string;
  mime: string;
  render: (conv: Conversation, opts: ExportOptions) => string;
}

export const FORMATS: readonly Format[] = [
  { id: 'md', ext: 'md', mime: 'text/markdown', render: toMarkdown },
  { id: 'json', ext: 'json', mime: 'application/json', render: (c) => toJson(c) },
  { id: 'txt', ext: 'txt', mime: 'text/plain', render: toText },
];

export function formatById(id: FormatId): Format {
  const f = FORMATS.find((x) => x.id === id);
  if (!f) throw new Error(`Unknown format: ${id}`);
  return f;
}

export function renderExport(conv: Conversation, format: FormatId, opts: ExportOptions): string {
  return formatById(format).render(prepare(conv, opts), opts);
}
