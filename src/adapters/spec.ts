// One generic adapter driven by a small per-site description (SiteSpec).
// It finds messages by several selectors per role, so a renamed class on one site
// rarely breaks it, and it collects messages while scrolling, so sites that only keep
// the visible part of a long chat in the page (virtualised lists) still export fully.

import { siteById, type SiteId } from '../config/sites';
import { blocksFromElement, blocksFromNodes, type ConvertOptions } from '../ir/from-dom';
import { inlineText } from '../ir/inline';
import type { Block, Message, Role } from '../ir/types';
import { nextFrame, throwIfAborted } from './chunk';
import type { Adapter, AdapterContext, CollectedMessage, Progress } from './types';

export interface SiteSpec {
  site: SiteId;
  /** Selectors for the root element of each prompt / answer, most specific first. */
  user: string[];
  assistant: string[];
  /** Selectors (searched inside the message root) for the content, most specific first. */
  userContent?: string[];
  assistantContent?: string[];
  /** Selectors for a reasoning ("thinking") section inside an answer. */
  reasoning?: string[];
  /** UI chrome inside messages to drop: buttons are always dropped; add toolbars, labels, etc. */
  skip?: string;
  /** Extra test for UI chrome that a selector cannot express (e.g. by its text). */
  skipIf?: (el: Element) => boolean;
  /** Custom turn finder for layouts that selectors cannot describe; merged with the selectors. */
  findTurns?: (doc: Document) => { el: Element; role: Role }[];
  /** User prompts are plain text with line breaks (white-space: pre-wrap). */
  userIsPlainText?: boolean;
  /** Scroll container selectors; falls back to the nearest scrollable ancestor. */
  scroller?: string[];
  /** The site removes off-screen messages from the page, so read while scrolling. */
  virtualised?: boolean;
  /** Stable identity for a message element (survives re-rendering). */
  key?: (el: Element) => string | null | undefined;
  model?: (el: Element) => string | undefined;
  title: (doc: Document) => string | undefined;
  codeLanguage?: (pre: Element) => string | undefined;
  isConversationPage?: (url: URL) => boolean;
}

interface Found {
  el: Element;
  role: Role;
}

export function createSpecAdapter(spec: SiteSpec, { doc, url }: AdapterContext): Adapter {
  const site = siteById(spec.site);

  const find = (): Found[] => {
    const tagged = new Map<Element, Role>();
    for (const [role, selectors] of [
      ['user', spec.user],
      ['assistant', spec.assistant],
    ] as const) {
      for (const sel of selectors)
        for (const el of Array.from(doc.querySelectorAll(sel))) tagged.set(el, role);
    }
    for (const t of spec.findTurns?.(doc) ?? []) tagged.set(t.el, t.role);
    // Keep outermost matches only (checked through ancestors, so long chats stay fast), in document order.
    const all = Array.from(tagged.keys()).filter((el) => {
      for (let p = el.parentElement; p; p = p.parentElement) if (tagged.has(p)) return false;
      return true;
    });
    all.sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1));
    return all.map((el) => ({ el, role: tagged.get(el) ?? 'unknown' }));
  };

  const convert = ({ el, role }: Found): Message => {
    const opts: ConvertOptions = {
      baseUrl: url.href,
      ...(spec.codeLanguage ? { codeLanguage: spec.codeLanguage } : {}),
      skip: (e) =>
        (spec.skip ? e.matches(spec.skip) : false) ||
        (spec.skipIf?.(e) ?? false) ||
        (spec.reasoning ? spec.reasoning.some((r) => e.matches(r)) : false),
    };
    const blocks: Block[] = [];
    if (role === 'assistant' && spec.reasoning) {
      const box = firstMatch(el, spec.reasoning);
      if (box) {
        const inner = blocksFromElement(box, {
          ...opts,
          skip: (e) => (spec.skip ? e.matches(spec.skip) : false) || (spec.skipIf?.(e) ?? false),
        });
        if (inner.length) blocks.push({ type: 'reasoning', summary: 'Reasoning', blocks: inner });
      }
    }
    const contentSel = role === 'user' ? spec.userContent : spec.assistantContent;
    const parts = contentSel ? allMatches(el, contentSel) : [];
    const roots = parts.length ? parts : [el];
    const plain = role === 'user' && spec.userIsPlainText;
    if (role === 'user' && parts.length) {
      // Pictures attached to a prompt sit outside the text bubble.
      const images = Array.from(el.querySelectorAll('img')).filter(
        (img) => !parts.some((p) => p.contains(img)),
      );
      blocks.push(...blocksFromNodes(images, opts));
    }
    for (const root of roots) blocks.push(...blocksFromElement(root, { ...opts, preserveWhitespace: plain }));
    const model = role === 'assistant' ? spec.model?.(el) : undefined;
    return { role, ...(model ? { model } : {}), blocks };
  };

  // Per-element caches, checked against the element's text length so a recycled element
  // (virtual lists reuse them) is never mistaken for the message it showed before.
  const hashCache = new WeakMap<Element, { len: number; hash: string }>();
  const contentHash = (el: Element): string => {
    const text = el.textContent ?? '';
    const hit = hashCache.get(el);
    if (hit && hit.len === text.length) return hit.hash;
    const h = hash(text.slice(0, 400) + text.length);
    hashCache.set(el, { len: text.length, hash: h });
    return h;
  };

  /** Stable key from the site, else role + content hash + how often that content repeats in this pass. */
  const keyOf = (f: Found, repeats: Map<string, number>): string => {
    const own = spec.key?.(f.el);
    if (own) return own;
    const base = `${f.role}:${contentHash(f.el)}`;
    const n = repeats.get(base) ?? 0;
    repeats.set(base, n + 1);
    return `${base}:${n}`;
  };

  const scroller = (): Element | null => {
    const found = find();
    const anchors = [found[found.length - 1]?.el, found[0]?.el].filter((e): e is Element => !!e);
    const candidates: Element[] = [];
    for (const sel of spec.scroller ?? []) candidates.push(...Array.from(doc.querySelectorAll(sel)));
    for (const a of anchors) for (let el = a.parentElement; el; el = el.parentElement) candidates.push(el);
    if (doc.scrollingElement) candidates.push(doc.scrollingElement);
    return candidates.find(canScroll) ?? null;
  };

  return {
    site,
    isConversationPage: () => spec.isConversationPage?.(url) || find().length > 0,
    getTitle: () => spec.title(doc)?.trim() || firstPromptTitle(find(), convert) || `${site.label} chat`,
    count: () => find().length,
    turns: find,
    read: convert,
    async collect(signal, onProgress) {
      const box = scroller();
      const order: string[] = [];
      const position = new Map<string, number>();
      const seen = new Map<string, CollectedMessage>();
      const mountedKeys = () => {
        const repeats = new Map<string, number>();
        return find().map((f) => keyOf(f, repeats));
      };
      /** Reads every mounted message not seen yet, slotting it in after the last known one before it. */
      const harvest = async () => {
        let last = -1;
        const repeats = new Map<string, number>();
        const visible = find();
        for (let i = 0; i < visible.length; i++) {
          throwIfAborted(signal);
          const f = visible[i] as Found;
          const key = keyOf(f, repeats);
          const known = position.get(key);
          if (known !== undefined) {
            last = known;
            continue;
          }
          const message = convert(f);
          if (!message.blocks.length) continue; // not rendered yet; picked up on a later pass
          order.splice(last + 1, 0, key);
          last += 1;
          for (let idx = last; idx < order.length; idx++) position.set(order[idx] as string, idx);
          seen.set(key, { key, message, preview: preview(message) });
          if (i % 20 === 19) await nextFrame();
        }
        onProgress({ phase: 'reading', done: order.length });
      };

      if (!box) {
        await harvest();
        return order.map((k) => seen.get(k) as CollectedMessage);
      }

      const atStart = new Set(mountedKeys());
      try {
        await loadOlder(box, () => mountedKeys(), signal, onProgress);
        await harvest();
        // If the newest messages are still mounted now that the oldest are, the whole chat is
        // in the page and one read was enough. Otherwise the site unloads off-screen messages,
        // so walk down a screen at a time and read as we go.
        const now = new Set(mountedKeys());
        const complete = !spec.virtualised && [...atStart].every((k) => now.has(k));
        if (!complete) {
          for (let guard = 0; guard < 20000; guard++) {
            const before = box.scrollTop;
            box.scrollTop = before + Math.max(160, box.clientHeight * 0.9);
            await quiet(box, signal, 60, 1200);
            await harvest();
            if (Math.abs(box.scrollTop - before) < 1) {
              // At the bottom: give a lazy list one more chance to grow.
              const h = box.scrollHeight;
              await quiet(box, signal, 300, 1500);
              if (box.scrollHeight === h) break;
            }
          }
        }
      } finally {
        box.scrollTop = box.scrollHeight;
      }
      return order.map((k) => seen.get(k) as CollectedMessage);
    },
  };
}

/** True if the element really scrolls (tested by nudging it, not by reading styles). */
function canScroll(el: Element): boolean {
  if (el.scrollHeight - el.clientHeight < 40) return false;
  const prev = el.scrollTop;
  el.scrollTop = prev - 2;
  let moved = el.scrollTop !== prev;
  if (!moved) {
    el.scrollTop = prev + 2;
    moved = el.scrollTop !== prev;
  }
  el.scrollTop = prev;
  return moved;
}

/**
 * Scrolls to the oldest message until nothing older loads. Works for normal lists and for
 * column-reverse lists (negative scrollTop), and waits for the page to go quiet each time.
 */
async function loadOlder(
  box: Element,
  keys: () => string[],
  signal: AbortSignal,
  onProgress: (p: Progress) => void,
): Promise<void> {
  let stable = 0;
  let lastHeight = -1;
  let lastCount = -1;
  let lastFirst: string | undefined;
  // Nothing loaded at all: the chat is probably complete already, so a short check will do.
  // Once older messages have arrived, confirm the start more patiently.
  let grewEver = false;
  for (let round = 0; round < 5000 && stable < (grewEver ? 4 : 2); round++) {
    throwIfAborted(signal);
    box.scrollTop = -box.scrollHeight;
    // Some sites (ChatGPT) load older messages on wheel input at the top, not on scroll position.
    box.dispatchEvent(
      new WheelEvent('wheel', { deltaY: -2000, deltaMode: 0, bubbles: true, cancelable: true }),
    );
    // Nudge down and back up: some sites only load more on a fresh scroll event at the top.
    if (stable > 0) {
      box.scrollTop += 40;
      await quiet(box, signal, 60, 300);
      box.scrollTop = -box.scrollHeight;
    }
    // Wait for the page to change (older messages arriving), or give up after a while. Each
    // round then costs about as long as the site takes to respond.
    await changed(box, signal, 120, grewEver ? 1200 : 900);
    // Compare by message identity, not element: virtual lists rebuild elements on every scroll.
    const found = keys();
    onProgress({ phase: 'loading', done: found.length });
    const grew = box.scrollHeight !== lastHeight || found.length !== lastCount || found[0] !== lastFirst;
    stable = grew ? 0 : stable + 1;
    if (grew && round > 0) grewEver = true;
    lastHeight = box.scrollHeight;
    lastCount = found.length;
    lastFirst = found[0];
  }
}

/** Resolves `idle` ms after the element's subtree stops changing, or after `max` ms if it never changes. */
function changed(el: Element, signal: AbortSignal, idle: number, max: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cap = setTimeout(done, max);
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, idle);
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Export cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    function cleanup() {
      clearTimeout(timer);
      clearTimeout(cap);
      observer.disconnect();
      signal.removeEventListener('abort', onAbort);
    }
    function done() {
      cleanup();
      resolve();
    }
  });
}

/** Resolves once the element's subtree has had no changes for `idle` ms (or after `max` ms). */
function quiet(el: Element, signal: AbortSignal, idle: number, max: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer = setTimeout(done, idle);
    const cap = setTimeout(done, max);
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(done, idle);
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Export cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    function cleanup() {
      clearTimeout(timer);
      clearTimeout(cap);
      observer.disconnect();
      signal.removeEventListener('abort', onAbort);
    }
    function done() {
      cleanup();
      resolve();
    }
  });
}

function firstMatch(root: Element, selectors: string[]): Element | null {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/** All matches of the first selector that matches anything, outermost only. */
function allMatches(root: Element, selectors: string[]): Element[] {
  for (const sel of selectors) {
    const els = Array.from(root.querySelectorAll(sel));
    if (els.length) return els.filter((el) => !els.some((o) => o !== el && o.contains(el)));
  }
  return [];
}

export function preview(m: Message): string {
  for (const b of m.blocks) {
    if (b.type === 'paragraph' || b.type === 'heading') {
      const t = inlineText(b.inlines).replace(/\s+/g, ' ').trim();
      if (t) return t.slice(0, 140);
    }
    if (b.type === 'code') return b.text.slice(0, 140);
    if (b.type === 'math') return b.tex.slice(0, 140);
  }
  return '…';
}

function firstPromptTitle(found: Found[], convert: (f: Found) => Message): string {
  const first = found.find((f) => f.role === 'user');
  return first ? preview(convert(first)).slice(0, 60) : '';
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** Removes a site-name suffix such as " - Claude" or " | Gemini" from a document title. */
export function stripSuffix(title: string, ...names: string[]): string | undefined {
  let t = title;
  for (const n of names) t = t.replace(new RegExp(`\\s*[-|–—]\\s*${n}\\s*$`, 'i'), '');
  t = t.trim();
  return t && !names.some((n) => t.toLowerCase() === n.toLowerCase()) ? t : undefined;
}
