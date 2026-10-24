import { useEffect, useRef, useState } from 'preact/hooks';
import { currentRanges } from '../adapters/generic';
import { brokenSiteIssueUrl } from '../adapters/registry';
import type { Adapter } from '../adapters/types';
import { downloadText } from '../exporters/download';
import type { FormatId } from '../exporters/index';
import { DEFAULT_OPTIONS, type ExportOptions } from '../exporters/options';
import { runExport, type ExportResult, type Status } from '../export-flow';
import { t } from './i18n';

interface Props {
  doc: Document;
  url: URL;
  adapter: Adapter | null;
  host: Element;
  onClose: () => void;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'busy'; status: Status | null }
  | { kind: 'done'; message: string; fallback: boolean }
  | { kind: 'error'; message: string };

const FORMAT_IDS: FormatId[] = ['md', 'json', 'txt'];

export function Panel({ doc, url, adapter, host, onClose }: Props) {
  const [format, setFormat] = useState<FormatId>('md');
  const [includeModel, setIncludeModel] = useState(DEFAULT_OPTIONS.includeModel);
  const [imageLinks, setImageLinks] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [count, setCount] = useState(() => adapter?.messageElements().length ?? 0);
  const [ranges, setRanges] = useState<Range[]>(() => currentRanges(doc, host));
  const abortRef = useRef<AbortController | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onSel = () => {
      const r = currentRanges(doc, host);
      if (r.length) setRanges(r);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const timer = setInterval(() => setCount(adapter?.messageElements().length ?? 0), 1500);
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
    images: imageLinks ? 'link' : 'placeholder',
  });

  const run = async (mode: 'download' | 'copy', useSelection: boolean) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase({ kind: 'busy', status: null });
    try {
      const result: ExportResult = await runExport({
        doc,
        url,
        format: mode === 'copy' ? 'md' : format,
        options: options(),
        signal: ctrl.signal,
        onStatus: (status) => setPhase({ kind: 'busy', status }),
        ...(useSelection ? { ranges } : {}),
      });
      const n = result.conversation.messages.length;
      if (mode === 'copy') await navigator.clipboard.writeText(result.text);
      else downloadText(doc, result.fileName, result.text, result.mime);
      setCount(adapter?.messageElements().length ?? 0);
      setPhase({
        kind: 'done',
        fallback: result.source === 'plain-text',
        message: mode === 'copy' ? t('copied', { n }) : t('saved', { n, file: result.fileName }),
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError')
        setPhase({ kind: 'done', message: t('cancelled'), fallback: false });
      else setPhase({ kind: 'error', message: t('failed', { error: (err as Error).message }) });
    } finally {
      abortRef.current = null;
    }
  };

  const busy = phase.kind === 'busy';
  const hasSelection = ranges.length > 0;
  const canExportChat = adapter !== null && adapter.isConversationPage();

  return (
    <section class="panel" role="dialog" aria-labelledby="tp-title">
      <header>
        <h2 id="tp-title">{t('title')}</h2>
        <button type="button" class="icon" onClick={onClose} aria-label={t('close')} title={t('close')}>
          ×
        </button>
      </header>

      <dl class="meta">
        <dt>{t('site')}</dt>
        <dd>{adapter?.site.label ?? url.hostname}</dd>
        {adapter && (
          <>
            <dt>{t('messages')}</dt>
            <dd aria-live="polite">{count}</dd>
          </>
        )}
      </dl>

      {!adapter && <p class="note">{t('unsupported')}</p>}
      {adapter && !canExportChat && <p class="note">{t('noChat')}</p>}
      {hasSelection && (
        <p class="note">
          {t('selection')}{' '}
          {canExportChat && (
            <button type="button" class="link" onClick={() => setRanges([])}>
              {t('useWholeChat')}
            </button>
          )}
        </p>
      )}

      <fieldset disabled={busy}>
        <legend>{t('format')}</legend>
        {FORMAT_IDS.map((id, i) => (
          <label key={id}>
            <input
              ref={i === 0 ? firstRef : undefined}
              type="radio"
              name="tp-format"
              value={id}
              checked={format === id}
              onChange={() => setFormat(id)}
            />
            {t(`fmt_${id}`)}
          </label>
        ))}
      </fieldset>

      <fieldset disabled={busy} class="opts">
        <label>
          <input
            type="checkbox"
            checked={includeModel}
            onChange={(e) => setIncludeModel(e.currentTarget.checked)}
          />
          {t('includeModel')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={imageLinks}
            onChange={(e) => setImageLinks(e.currentTarget.checked)}
          />
          {t('imageLinks')}
        </label>
      </fieldset>

      <div class="actions">
        {busy ? (
          <button type="button" onClick={() => abortRef.current?.abort()}>
            {t('cancel')}
          </button>
        ) : (
          <>
            <button
              type="button"
              class="primary"
              disabled={!canExportChat && !hasSelection}
              onClick={() => run('download', hasSelection)}
            >
              {hasSelection ? t('exportSelection') : t('exportAll')}
            </button>
            <button
              type="button"
              disabled={!canExportChat && !hasSelection}
              onClick={() => run('copy', hasSelection)}
            >
              {t('copyMd')}
            </button>
          </>
        )}
      </div>

      <p class="status" role="status" aria-live="polite">
        {phase.kind === 'busy' &&
          phase.status?.kind === 'loading' &&
          t('loading', { n: phase.status.loaded })}
        {phase.kind === 'busy' &&
          phase.status?.kind === 'reading' &&
          t('reading', { done: phase.status.done, total: phase.status.total })}
        {phase.kind === 'done' && phase.message}
        {phase.kind === 'error' && <span class="error">{phase.message}</span>}
      </p>

      {phase.kind === 'done' && phase.fallback && adapter && (
        <p class="note warn">
          {t('layoutChanged')}{' '}
          <a href={brokenSiteIssueUrl(url, adapter.site.label)} target="_blank" rel="noopener noreferrer">
            {t('report')}
          </a>
        </p>
      )}

      <p class="privacy">{t('privacy')}</p>
    </section>
  );
}
