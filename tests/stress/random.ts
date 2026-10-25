// Seeded random generators for fuzz and stress tests. Every case is reproducible from its seed.

export type Rng = () => number;

/** mulberry32: small, fast, good enough for test data. */
export function rng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const int = (r: Rng, min: number, max: number) => min + Math.floor(r() * (max - min + 1));
export const pick = <T>(r: Rng, list: readonly T[]): T => list[Math.floor(r() * list.length)] as T;
export const chance = (r: Rng, p: number) => r() < p;

/** Text that has broken exporters elsewhere: scripts, RTL, combining marks, syntax characters. */
export const TRICKY = [
  'plain words',
  'বাংলা লেখা ও যুক্তাক্ষর ক্ষ্ম',
  '中文测试 日本語 한국어',
  'مرحبا بالعالم',
  'שלום עולם',
  '😀 👨‍👩‍👧 🏳️‍🌈',
  'e\u0301 n\u0303 combining',
  'zero\u200bwidth',
  '\u202Ereversed',
  'tab\there',
  'two  spaces',
  '<not a tag> & &amp; &lt;',
  '$5 and $10',
  '*star* _under_ `tick` ~tilde~',
  '# hash 1. one - dash',
  '\\backslash {braces} %percent ^caret',
  '|pipe| ]]> "quotes" \'single\'',
  'line\r\nbreak',
  '\u0001\u0008 control',
  'a\u00a0nbsp',
  'x'.repeat(300),
];

const SAFE_LINKS = [
  'https://example.com/a?b=1&c=2',
  'https://example.org/path with space',
  'mailto:someone@example.com',
];
const BAD_LINKS = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:x',
  ' javascript:alert(1)',
];
const TEX = [
  'x^2',
  '\\frac{a}{b}',
  '\\sum_{i=1}^{n} i',
  '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}',
  '\\sqrt[3]{x}',
  'a_{ij}',
  '\\int_0^1 f(x)\\,dx',
  '\\input{/etc/passwd}',
  '\\write18{rm -rf ~}',
];
const LANGS = ['python', 'javascript', 'rust', 'bash', 'c++', 'asm', ''];

export interface Generated {
  /** HTML of one message's content. */
  html: string;
  /** Unique words that must appear in every export of this message. */
  markers: string[];
}

/**
 * One random message body. Each visible piece of text carries a unique marker so tests can
 * check nothing was dropped; page clutter (scripts, buttons, styles) carries JUNK markers that
 * must never appear in an export.
 */
export function messageBody(r: Rng, id: number, opts: { maxDepth?: number } = {}): Generated {
  const markers: string[] = [];
  let n = 0;
  const marker = () => {
    const m = `MK${id}X${n++}Q`;
    markers.push(m);
    return m;
  };
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const text = () => `${marker()} ${esc(pick(r, TRICKY))}`;

  const inline = (depth: number): string => {
    const parts: string[] = [];
    for (let i = int(r, 1, 4); i > 0; i--) {
      const k = int(r, 0, 9);
      if (k <= 3 || depth > 3) parts.push(text());
      else if (k === 4) parts.push(`<strong>${inline(depth + 1)}</strong>`);
      else if (k === 5) parts.push(`<em>${inline(depth + 1)}</em>`);
      else if (k === 6) parts.push(`<code>${marker()} ${esc(pick(r, TRICKY))}</code>`);
      else if (k === 7)
        parts.push(
          `<a href="${esc(chance(r, 0.7) ? pick(r, SAFE_LINKS) : pick(r, BAD_LINKS))}">${text()}</a>`,
        );
      else if (k === 8) parts.push(mathInline(pick(r, TEX)));
      else parts.push(`${text()}<br>${text()}`);
    }
    return parts.join(' ');
  };

  const mathInline = (tex: string) =>
    `<span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">${esc(tex)}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">x</span></span>`;

  const list = (depth: number): string => {
    const tag = chance(r, 0.5) ? 'ul' : 'ol';
    const items: string[] = [];
    for (let i = int(r, 1, 4); i > 0; i--) {
      items.push(`<li>${inline(1)}${depth < 4 && chance(r, 0.3) ? list(depth + 1) : ''}</li>`);
    }
    return `<${tag}>${items.join('')}</${tag}>`;
  };

  const table = () => {
    const cols = int(r, 1, 6);
    const rows = int(r, 0, 6);
    const align = ['left', 'center', 'right', ''];
    const head = Array.from(
      { length: cols },
      () => `<th style="text-align:${pick(r, align)}">${text()}</th>`,
    ).join('');
    const body = Array.from(
      { length: rows },
      () => `<tr>${Array.from({ length: int(r, 1, cols) }, () => `<td>${inline(2)}</td>`).join('')}</tr>`,
    ).join('');
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  };

  const junk = () =>
    pick(r, [
      `<script>JUNK${id} alert(1)</script>`,
      `<style>.JUNK${id}{}</style>`,
      `<button>JUNK${id} Copy</button>`,
      `<svg><text>JUNK${id}</text></svg>`,
      `<noscript>JUNK${id}</noscript>`,
      `<template><p>JUNK${id}</p></template>`,
      `<span class="sr-only">JUNK${id}</span>`,
      `<div hidden>JUNK${id}</div>`,
      `<input value="JUNK${id}">`,
    ]);

  const block = (depth: number): string => {
    const k = int(r, 0, 11);
    if (k <= 2) return `<p>${inline(0)}</p>`;
    if (k === 3) {
      const level = int(r, 1, 6);
      return `<h${level}>${text()}</h${level}>`;
    }
    if (k === 4) return list(1);
    if (k === 5) {
      const lang = pick(r, LANGS);
      const lines = Array.from({ length: int(r, 1, 8) }, () => `${marker()} ${esc(pick(r, TRICKY))}`).join(
        '\n',
      );
      return `<pre><code${lang ? ` class="language-${lang}"` : ''}>${lines}</code></pre>`;
    }
    if (k === 6) return table();
    if (k === 7 && depth < (opts.maxDepth ?? 4)) return `<blockquote>${block(depth + 1)}</blockquote>`;
    if (k === 8) return `<span class="katex-display">${mathInline(pick(r, TEX))}</span>`;
    if (k === 9)
      return `<p><img src="https://example.com/i${id}.png?token=SECRET${id}" alt="${marker()}"></p>`;
    if (k === 10) return junk();
    return `<div><div>${chance(r, 0.5) ? `<p>${inline(0)}</p>` : inline(0)}</div></div>`;
  };

  const blocks: string[] = [];
  for (let i = int(r, 1, 7); i > 0; i--) blocks.push(block(0));
  // Guarantee at least one visible marker even if every block was junk.
  blocks.push(`<p>${text()}</p>`);
  return { html: blocks.join('\n'), markers };
}

/** A whole chat in ChatGPT's 2026 layout (role per message, as the reader expects). */
export function chatgptChat(r: Rng, messages: number, firstId = 0): { html: string; markers: string[][] } {
  const markers: string[][] = [];
  const turns: string[] = [];
  for (let i = 0; i < messages; i++) {
    const g = messageBody(r, firstId + i);
    markers.push(g.markers);
    const role = i % 2 === 0 ? 'user' : 'assistant';
    turns.push(
      `<div data-message-author-role="${role}" data-message-id="m${firstId + i}">` +
        `<div class="${role === 'user' ? 'whitespace-pre-wrap' : 'markdown'}">${g.html}</div></div>`,
    );
  }
  return { html: `<main>${turns.join('\n')}</main>`, markers };
}

export type SiteName = 'chatgpt' | 'claude' | 'gemini' | 'grok' | 'deepseek' | 'kimi';
export const SITE_NAMES: SiteName[] = ['chatgpt', 'claude', 'gemini', 'grok', 'deepseek', 'kimi'];
export const SITE_URLS: Record<SiteName, string> = {
  chatgpt: 'https://chatgpt.com/c/fuzz',
  claude: 'https://claude.ai/chat/fuzz',
  gemini: 'https://gemini.google.com/app/fuzz',
  grok: 'https://grok.com/c/fuzz',
  deepseek: 'https://chat.deepseek.com/a/chat/s/fuzz',
  kimi: 'https://www.kimi.com/chat/fuzz',
};

/** A whole chat in the given site's layout, alternating prompt and answer. */
export function siteChat(r: Rng, site: SiteName, messages: number): { html: string; markers: string[][] } {
  if (site === 'chatgpt') return chatgptChat(r, messages);
  const markers: string[][] = [];
  const parts: string[] = [];
  for (let i = 0; i < messages; i++) {
    const g = messageBody(r, i);
    markers.push(g.markers);
    const user = i % 2 === 0;
    const body = g.html;
    switch (site) {
      case 'claude':
        parts.push(
          user
            ? `<div data-testid="user-message">${body}</div>`
            : `<div data-testid="assistant-message" data-turn-key="t${i}"><div class="standard-markdown">${body}</div><div data-testid="message-actions"><button>Copy</button></div></div>`,
        );
        break;
      case 'gemini':
        if (user)
          parts.push(
            `<div class="conversation-container" id="c${i}"><user-query><div class="query-text">${body}</div></user-query>`,
          );
        else
          parts.push(
            `<model-response><message-content><div class="markdown">${body}</div></message-content></model-response></div>`,
          );
        break;
      case 'grok':
        parts.push(
          `<div id="response-${i}"><div class="relative group flex flex-col justify-center ${user ? 'items-end' : 'items-start'}"><div class="message-bubble">${user ? body : `<div class="response-content-markdown">${body}</div>`}</div></div></div>`,
        );
        break;
      case 'deepseek':
        parts.push(
          `<div data-virtual-list-item-key="k${i}"><div class="ds-message">${user ? `<div class="ds-collapsible-text">${body}</div>` : `<div class="ds-markdown ds-assistant-message-main-content">${body}</div>`}</div></div>`,
        );
        break;
      case 'kimi':
        parts.push(
          user
            ? `<div class="chat-content-item chat-content-item-user"><div class="user-content">${body}</div></div>`
            : `<div class="chat-content-item chat-content-item-assistant"><div class="markdown-container"><div class="markdown">${body}</div></div></div>`,
        );
        break;
    }
  }
  // Gemini: close a container left open by a trailing prompt.
  if (site === 'gemini' && messages % 2 === 1) parts.push('</div>');
  return { html: `<main>${parts.join('\n')}</main>`, markers };
}
