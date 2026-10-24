/** Yields to the browser so long exports keep the page responsive. */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
}

/** Maps items in time-boxed chunks (~12 ms each), yielding between chunks. */
export async function mapInChunks<T, R>(
  items: readonly T[],
  fn: (item: T) => R,
  signal: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const out: R[] = [];
  let sliceStart = performance.now();
  for (let i = 0; i < items.length; i++) {
    throwIfAborted(signal);
    out.push(fn(items[i] as T));
    if (performance.now() - sliceStart > 12) {
      onProgress?.(i + 1, items.length);
      await nextFrame();
      sliceStart = performance.now();
    }
  }
  onProgress?.(items.length, items.length);
  return out;
}
