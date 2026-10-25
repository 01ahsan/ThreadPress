import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { currentRanges } from '../adapters/generic';
import { brokenSiteIssueUrl } from '../adapters/registry';
import type { Adapter, CollectedMessage, Progress } from '../adapters/types';
import { buildConversation, collectChat, deliver, selectionMessages, type Collected } from '../export-flow';
import { FORMATS, renderExport, type FormatId } from '../exporters/index';
import { DEFAULT_OPTIONS, type ExportOptions } from '../exporters/options';
import { t } from './i18n';

interface Props {
  doc: Document;
  url: URL;
  adapter: Adapter | null;
  host: Element;
  onClose: () => void;
}

type Scope = 'all' | 'pick' | 'highlight';

type Status =
  | { kind: 'idle' }
  | { kind: 'busy'; progress: Progress | null }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

const BADGES: Record<FormatId, string> = {
  pdf: 'PDF',
  docx: 'DOC',
  md: 'MD',
  html: 'HTML',
  txt: 'TXT',
  json: '{ }',
  tex: 'TeX',
};

export function Panel({ doc, url, adapter, host, onClose }: Props) {
  const [ranges, setRanges] = useState<Range[]>(() => currentRanges(doc, host));
  const supported = adapter !== null && adapter.isConversationPage();
  const [scope, setScope] = useState<Scope>(() => (ranges.length ? 'highlight' : 'all'));
  const [format, setFormat] = useState<FormatId>('pdf');
  const [includeModel, setIncludeModel] = useState(DEFAULT_OPTIONS.includeModel);
  const [imageLinks, setImageLinks] = useState(false);
  const [paper, setPaper] = useState<ExportOptions['paper']>(() =>
    /^en-(US|CA)|es-MX/.test(navigator.language) ? 'Letter' : 'A4',
  );
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [count, setCount] = useState(() => adapter?.count() ?? 0);
  const [collected, setCollected] = useState<Collected | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [fallback, setFallback] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastClick = useRef<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onSel = () => {
      const r = currentRanges(doc, host);
      if (r.length) {
        setRanges(r);
        setScope('highlight');
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const timer = setInterval(() => setCount(adapter?.count() ?? 0), 2000);
    doc.addEventListener('selectionchange', onSel);
    doc.addEventListener('keydown', onKey);
    return () => {
      clearInterval(timer);
      doc.removeEventListener('selectionchange', onSel);
      doc.removeEventListener('keydown', onKey);
      abortRef.current?.abort();
    };
  }, []);

  const options = (): ExportOptions => ({
    ...DEFAULT_OPTIONS,
    includeModel,
    paper,
    images: imageLinks ? 'link' : 'placeholder',
    labels: { user: t('you'), assistant: '', unknown: t('scopeHighlight') },
  });

  /** Reads the chat once per panel opening; later exports reuse it. */
  const ensureCollected = async (signal: AbortSignal): Promise<Collected> => {
    if (collected) return collected;
    const c = await collectChat(doc, adapter, signal, (progress) => setStatus({ kind: 'busy', progress }));
    setCollected(c);
    setFallback(c.source === 'plain-text');
    setPicked(new Set(c.messages.map((m) => m.key)));
    return c;
  };

  const withTask = async (task: (signal: AbortSignal) => Promise<string>) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus({ kind: 'busy', progress: null });
    try {
      setStatus({ kind: 'done', message: await task(ctrl.signal) });
    } catch (err) {
      const e = err as Error;
      setStatus(
        e.name === 'AbortError'
          ? { kind: 'done', message: t('cancelled') }
          : { kind: 'error', message: t('failed', { error: e.message }) },
      );
    } finally {
      abortRef.current = null;
    }
  };

  const chosenMessages = async (signal: AbortSignal) => {
    if (scope === 'highlight') return selectionMessages(ranges, url);
    const c = await ensureCollected(signal);
    const list = scope === 'pick' ? c.messages.filter((m) => picked.has(m.key)) : c.messages;
    return list.map((m) => m.message);
  };

  const exportNow = () =>
    withTask(async (signal) => {
      const conv = buildConversation(doc, url, adapter, await chosenMessages(signal));
      const name = await deliver(doc, conv, format, options());
      return format === 'pdf' ? t('printed') : t('saved', { file: name });
    });

  const copyNow = () =>
    withTask(async (signal) => {
      const conv = buildConversation(doc, url, adapter, await chosenMessages(signal));
      await navigator.clipboard.writeText(renderExport(conv, 'md', options()) as string);
      return t('copied', { n: conv.messages.length });
    });

  const openPicker = () => {
    setScope('pick');
    if (!collected)
      void withTask(async (signal) =>
        t('messagesCount', { n: (await ensureCollected(signal)).messages.length }),
      );
  };

  const togglePick = (index: number, shift: boolean) => {
    if (!collected) return;
    const keys = collected.messages.map((m) => m.key);
    const next = new Set(picked);
    const key = keys[index] as string;
    const on = !next.has(key);
    const from = shift && lastClick.current !== null ? Math.min(lastClick.current, index) : index;
    const to = shift && lastClick.current !== null ? Math.max(lastClick.current, index) : index;
    for (let i = from; i <= to; i++) {
      if (on) next.add(keys[i] as string);
      else next.delete(keys[i] as string);
    }
    lastClick.current = index;
    setPicked(next);
  };

  const pickWhere = (pred: (m: CollectedMessage) => boolean) =>
    collected && setPicked(new Set(collected.messages.filter(pred).map((m) => m.key)));

  const busy = status.kind === 'busy';
  const canExport =
    !busy &&
    (scope === 'highlight'
      ? ranges.length > 0
      : supported && (scope === 'all' || (collected !== null && picked.size > 0)));
  const formatLabel = FORMATS.find((f) => f.id === format)?.label ?? '';
  const exportLabel =
    scope === 'pick' && collected
      ? t('exportCount', { n: picked.size, format: formatLabel })
      : t('export', { format: formatLabel });
  const progressText = useMemo(() => {
    if (status.kind !== 'busy' || !status.progress) return '';
    return status.progress.phase === 'loading'
      ? t('loadingHistory', { n: status.progress.done })
      : t('reading', { n: status.progress.done });
  }, [status]);

  return (
    <section class="panel" role="dialog" aria-label="ThreadPress">
      <header class="top">
        <span class="logo" aria-hidden="true">
          <svg viewBox="0 0 128 128">
            <rect width="128" height="128" rx="28" fill="currentColor" />
            <path
              d="M32 24h64a12 12 0 0 1 12 12v46a12 12 0 0 1-12 12H62l-22 18V94h-8a12 12 0 0 1-12-12V36a12 12 0 0 1 12-12z"
              fill="#fff"
            />
            <path
              d="M64 37v31M50 55l14 14 14-14M48 80h32"
              fill="none"
              stroke="currentColor"
              stroke-width="9"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <div class="heading">
          <h2>ThreadPress</h2>
          <p class="sub">
            {adapter ? adapter.site.label : url.hostname}
            {supported && ` · ${t('messagesCount', { n: collected?.messages.length ?? count })}`}
          </p>
        </div>
        <button
          ref={closeRef}
          type="button"
          class="icon"
          onClick={onClose}
          aria-label={t('close')}
          title={t('close')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>

      {!adapter && !ranges.length && <p class="notice">{t('unsupported')}</p>}
      {adapter && !supported && !ranges.length && <p class="notice">{t('noChat')}</p>}

      <div class="seg" role="radiogroup" aria-label={t('scope')}>
        <button
          type="button"
          role="radio"
          aria-checked={scope === 'all'}
          disabled={!supported || busy}
          onClick={() => setScope('all')}
        >
          {t('scopeAll')}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={scope === 'pick'}
          disabled={!supported || busy}
          onClick={openPicker}
        >
          {t('scopePick')}
        </button>
        {ranges.length > 0 && (
          <button
            type="button"
            role="radio"
            aria-checked={scope === 'highlight'}
            disabled={busy}
            onClick={() => setScope('highlight')}
          >
            {t('scopeHighlight')}
          </button>
        )}
      </div>

      {scope === 'highlight' && <p class="hint">{t('highlightHint')}</p>}

      {scope === 'pick' && collected && (
        <div class="picker">
          <div class="chips">
            <button type="button" onClick={() => pickWhere(() => true)}>
              {t('all')}
            </button>
            <button type="button" onClick={() => setPicked(new Set())}>
              {t('none')}
            </button>
            <button type="button" onClick={() => pickWhere((m) => m.message.role === 'user')}>
              {t('mine')}
            </button>
            <button type="button" onClick={() => pickWhere((m) => m.message.role === 'assistant')}>
              {t('answers')}
            </button>
            <span class="count">{t('selectedOf', { n: picked.size, total: collected.messages.length })}</span>
          </div>
          <ul class="msgs" aria-label={t('scopePick')}>
            {collected.messages.map((m, i) => (
              <li key={m.key}>
                <label class={picked.has(m.key) ? 'on' : ''}>
                  <input
                    type="checkbox"
                    checked={picked.has(m.key)}
                    onClick={(e) => {
                      e.preventDefault();
                      togglePick(i, e.shiftKey);
                    }}
                  />
                  <span class={`who ${m.message.role}`}>
                    {m.message.role === 'user' ? t('you') : t('ai')}
                  </span>
                  <span class="text">{m.preview}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div class="formats" role="radiogroup" aria-label={t('format')}>
        {FORMATS.map((f) => (
          <label key={f.id} class={`fmt ${format === f.id ? 'on' : ''}`}>
            <input
              type="radio"
              name="tp-format"
              value={f.id}
              checked={format === f.id}
              onChange={() => setFormat(f.id)}
              disabled={busy}
            />
            <span class={`badge b-${f.id}`} aria-hidden="true">
              {BADGES[f.id]}
            </span>
            <span class="name">{f.label}</span>
          </label>
        ))}
      </div>

      <details class="more">
        <summary>{t('options')}</summary>
        <label class="row">
          <input
            type="checkbox"
            checked={includeModel}
            onChange={(e) => setIncludeModel(e.currentTarget.checked)}
          />
          <span>{t('includeModel')}</span>
        </label>
        <label class="row">
          <input
            type="checkbox"
            checked={imageLinks}
            onChange={(e) => setImageLinks(e.currentTarget.checked)}
          />
          <span>
            {t('imageLinks')}
            <small>{t('imageLinksHint')}</small>
          </span>
        </label>
        <label class="row">
          <span>{t('paper')}</span>
          <select value={paper} onChange={(e) => setPaper(e.currentTarget.value as ExportOptions['paper'])}>
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
          </select>
        </label>
      </details>

      <div class="actions">
        {busy ? (
          <button type="button" class="primary" onClick={() => abortRef.current?.abort()}>
            {t('cancel')}
          </button>
        ) : (
          <button type="button" class="primary" disabled={!canExport} onClick={exportNow}>
            {exportLabel}
          </button>
        )}
        <button
          type="button"
          class="icon square"
          disabled={!canExport}
          onClick={copyNow}
          aria-label={t('copy')}
          title={t('copy')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="8" y="8" width="12" height="12" rx="2" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </svg>
        </button>
      </div>

      <div class="status" role="status" aria-live="polite">
        {busy && (
          <div class="bar">
            <span />
          </div>
        )}
        {busy && progressText}
        {status.kind === 'done' && status.message}
        {status.kind === 'error' && <span class="error">{status.message}</span>}
      </div>

      {fallback && adapter && (
        <p class="notice warn">
          {t('layoutChanged')}{' '}
          <a href={brokenSiteIssueUrl(url, adapter.site.label)} target="_blank" rel="noopener noreferrer">
            {t('report')}
          </a>
        </p>
      )}

      <footer class="privacy">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        {t('privacy')}
      </footer>
    </section>
  );
}
