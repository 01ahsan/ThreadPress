import { nextFrame, throwIfAborted } from './chunk';

/** Finds the nearest scrollable ancestor of an element (the chat's scroll pane). */
export function findScrollContainer(from: Element | null): Element | null {
  for (let el = from?.parentElement ?? null; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 8) return el;
  }
  const root = from?.ownerDocument.scrollingElement;
  return root && root.scrollHeight > root.clientHeight + 8 ? root : null;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Export cancelled', 'AbortError'));
      },
      { once: true },
    );
  });
}

export interface ScrollLoadOptions {
  container: Element | null;
  count: () => number;
  onProgress: (loaded: number) => void;
  signal: AbortSignal;
  /** How long to wait for the site to render older messages after each scroll. */
  settleMs?: number;
  /** Rounds without new messages before the history is considered complete. */
  stableRounds?: number;
  maxRounds?: number;
}

/**
 * Repeatedly scrolls to the top of the chat until no older messages appear,
 * then restores the user's scroll position.
 */
export async function scrollToLoadAll(opts: ScrollLoadOptions): Promise<void> {
  const { container, count, onProgress, signal } = opts;
  const settleMs = opts.settleMs ?? 500;
  const stableRounds = opts.stableRounds ?? 3;
  const maxRounds = opts.maxRounds ?? 400;
  onProgress(count());
  if (!container) return;

  const fromBottom = container.scrollHeight - container.scrollTop;
  let last = count();
  let stable = 0;
  try {
    for (let round = 0; round < maxRounds && stable < stableRounds; round++) {
      throwIfAborted(signal);
      container.scrollTop = 0;
      await wait(settleMs, signal);
      const now = count();
      onProgress(now);
      stable = now === last && container.scrollTop === 0 ? stable + 1 : 0;
      last = now;
    }
  } finally {
    await nextFrame();
    container.scrollTop = container.scrollHeight - fromBottom;
  }
}
