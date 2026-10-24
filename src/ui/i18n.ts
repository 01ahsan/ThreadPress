// Interface strings. The bookmarklet cannot use the browser's _locales system,
// so strings live here; the extension build will reuse the same table.

const en = {
  title: 'ThreadPress',
  close: 'Close',
  site: 'Site',
  messages: 'Messages',
  format: 'Format',
  fmt_md: 'Markdown (.md)',
  fmt_json: 'JSON (.json)',
  fmt_txt: 'Plain text (.txt)',
  includeModel: 'Include model names',
  imageLinks: 'Include image links (may contain private access tokens)',
  exportAll: 'Export whole chat',
  exportSelection: 'Export selection',
  copyMd: 'Copy as Markdown',
  cancel: 'Cancel',
  loading: 'Loading full history… {n} messages',
  reading: 'Reading messages… {done} of {total}',
  saved: 'Saved {n} messages to {file}',
  copied: 'Copied {n} messages',
  cancelled: 'Cancelled',
  failed: 'Something went wrong: {error}',
  unsupported:
    'This site is not supported yet. Highlight part of the page and click Export to save your selection.',
  noChat: 'Open a conversation first.',
  layoutChanged: "This site's layout changed; exporting as plain text instead.",
  report: 'Report this on GitHub (opens a prefilled form; nothing is sent until you submit it)',
  selection: 'Exporting your highlighted selection.',
  useWholeChat: 'Use the whole chat instead',
  privacy: 'Runs only on this device. Nothing is uploaded.',
} as const;

export type MessageKey = keyof typeof en;

const tables: Record<string, Partial<Record<MessageKey, string>>> = { en };

export function t(key: MessageKey, vars: Record<string, string | number> = {}): string {
  const lang = (navigator.language || 'en').slice(0, 2);
  const s = tables[lang]?.[key] ?? en[key];
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}
