/** Finds the nearest scrollable ancestor of an element (the chat's scroll pane). */
export function findScrollContainer(from: Element | null): Element | null {
  for (let el = from?.parentElement ?? null; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 8) return el;
  }
  const root = from?.ownerDocument.scrollingElement;
  return root && root.scrollHeight > root.clientHeight + 8 ? root : null;
}
