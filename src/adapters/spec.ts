// One generic adapter driven by a small per-site description (SiteSpec).
// It finds messages by several selectors per role, so a renamed class on one site
// rarely breaks it, and it collects messages while scrolling, so sites that only keep
// the visible part of a long chat in the page (virtualised lists) still export fully.

import { siteById, type SiteId } from '../config/sites';
import { blocksFromElement, type ConvertOptions } from '../ir/from-dom';
import { inlineText } from '../ir/inline';
import type { Block, Message, Role } from '../ir/types';
import { nextFrame, throwIfAborted } from './chunk';
import { findScrollContainer } from './scroll-loader';
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
    // Keep outermost matches only, in document order.
    const all = Array.from(tagged.keys()).filter(
      (el) => !Array.from(tagged.keys()).some((other) => other !== el && other.contains(el)),
    );
    all.sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1));
    return all.map((el) => ({ el, role: tagged.get(el) ?? 'unknown' }));
  };

  const convert = ({ el, role }: Found): Message => {
    const opts: ConvertOptions = {
      baseUrl: url.href,
      ...(spec.codeLanguage ? { codeLanguage: spec.codeLanguage } : {}),
      skip: (e) =>
        (spec.skip ? e.matches(spec.skip) : false) ||
        (spec.reasoning ? spec.reasoning.some((r) => e.matches(r)) : false),
    };
    const blocks: Block[] = [];
    if (role === 'assistant' && spec.reasoning) {
      const box = firstMatch(el, spec.reasoning);
      if (box) {
        const inner = blocksFromElement(box, {
          ...opts,
          skip: (e) => (spec.skip ? e.matches(spec.skip) : false),
        });
        if (inner.length) blocks.push({ type: 'reasoning', summary: 'Reasoning', blocks: inner });
      }
    }
    const contentSel = role === 'user' ? spec.userContent : spec.assistantContent;
    const parts = contentSel ? allMatches(el, contentSel) : [];
    const roots = parts.length ? parts : [el];
    const plain = role === 'user' && spec.userIsPlainText;
    for (const root of roots) blocks.push(...blocksFromElement(root, { ...opts, preserveWhitespace: plain }));
    const model = role === 'assistant' ? spec.model?.(el) : undefined;
    return { role, ...(model ? { model } : {}), blocks };
  };

  /** Stable key from the site, else role + content hash + how often that content repeats in this pass. */
  const keyOf = (f: Found, repeats: Map<string, number>): string => {
    const own = spec.key?.(f.el);
    if (own) return own;
    const base = `${f.role}:${hash((f.el.textContent ?? '').slice(0, 400))}`;
    const n = repeats.get(base) ?? 0;
    repeats.set(base, n + 1);
    return `${base}:${n}`;
  };

  const scroller = (): Element | null => {
    for (const sel of spec.scroller ?? []) {
      const el = doc.querySelector(sel);
      if (el && el.scrollHeight > el.clientHeight + 8) return el;
    }
    return findScrollContainer(find()[0]?.el ?? null);
  };

  return {
    site,
    isConversationPage: () => spec.isConversationPage?.(url) || find().length > 0,
    getTitle: () => spec.title(doc)?.trim() || firstPromptTitle(find(), convert) || `${site.label} chat`,
    count: () => find().length,
    async collect(signal, onProgress) {
      const box = scroller();
      const order: string[] = [];
      const seen = new Map<string, CollectedMessage>();
      const harvest = async () => {
        let last = -1;
        const repeats = new Map<string, number>();
        const visible = find();
        for (let i = 0; i < visible.length; i++) {
          throwIfAborted(signal);
          const f = visible[i] as Found;
          const key = keyOf(f, repeats);
          const known = order.indexOf(key);
          if (known >= 0) {
            last = known;
            continue;
          }
          const message = convert(f);
          if (!message.blocks.length) continue;
          order.splice(last + 1, 0, key);
          last += 1;
          seen.set(key, { key, message, preview: preview(message) });
          if (i % 20 === 19) await nextFrame();
        }
        onProgress({ phase: 'reading', done: order.length });
      };

      if (box) await scrollToTop(box, () => find().length, signal, onProgress);
      if (box && spec.virtualised) {
        // Walk down one screen at a time, reading whatever is mounted.
        for (let guard = 0; guard < 2000; guard++) {
          await harvest();
          const before = box.scrollTop;
          box.scrollTop = before + box.clientHeight * 0.85;
          await settle(signal, 140);
          if (Math.abs(box.scrollTop - before) < 2) break;
        }
        await harvest();
      } else {
        await harvest();
      }
      if (box) box.scrollTop = box.scrollHeight;
      return order.map((k) => seen.get(k) as CollectedMessage);
    },
  };
}

/** Scrolls to the oldest message until no more load. Handles column-reverse lists (negative scrollTop). */
async function scrollToTop(
  box: Element,
  count: () => number,
  signal: AbortSignal,
  onProgress: (p: Progress) => void,
): Promise<void> {
  let stable = 0;
  let last = -1;
  let lastHeight = -1;
  for (let round = 0; round < 400 && stable < 3; round++) {
    throwIfAborted(signal);
    box.scrollTop = -box.scrollHeight;
    await settle(signal, 350);
    const n = count();
    onProgress({ phase: 'loading', done: n });
    stable = n === last && box.scrollHeight === lastHeight ? stable + 1 : 0;
    last = n;
    lastHeight = box.scrollHeight;
  }
}

function settle(signal: AbortSignal, ms: number): Promise<void> {
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
