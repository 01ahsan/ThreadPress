// How each supported site lays out a conversation. Each role lists several selectors,
// newest layout first, so one renamed class rarely breaks an export.
// Last checked: 2026-10-25. When a site changes, see docs/fixing-a-site.md.

import type { SiteId } from '../config/sites';
import { stripSuffix, type SiteSpec } from './spec';

const text = (doc: Document, sel: string) => doc.querySelector(sel)?.textContent?.trim() || undefined;

/** ChatGPT's hidden turn headings, e.g. "You said:" / "ChatGPT said:". */
const TURN_LABEL = /^\s*(you said|chatgpt said|chatgpt)\s*:?\s*$/i;

/**
 * Current ChatGPT layout: every turn starts with a hidden heading. The heading may carry the
 * role as data-conversation-role; otherwise its English text gives it away. The turn itself is
 * the nearest <article>/turn container, or the nearest ancestor with the "group" class.
 */
function chatgptTurns(doc: Document): { el: Element; role: 'user' | 'assistant' }[] {
  const out: { el: Element; role: 'user' | 'assistant' }[] = [];
  const root = doc.querySelector('.thread-scroll-container') ?? doc.querySelector('main') ?? doc.body;
  for (const h of Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6, [data-conversation-role]'))) {
    const attr = (h.getAttribute('data-conversation-role') ?? '').toLowerCase();
    const label = h.textContent ?? '';
    const role =
      attr === 'user' || attr === 'assistant'
        ? attr
        : TURN_LABEL.test(label)
          ? /you said/i.test(label)
            ? 'user'
            : 'assistant'
          : null;
    if (!role) continue;
    let turn: Element | null = h.closest('article, [data-testid^="conversation-turn"], [data-turn]');
    for (
      let p = h.parentElement, depth = 0;
      !turn && p && p !== root && depth < 12;
      p = p.parentElement, depth++
    ) {
      if (p.classList.contains('group')) turn = p;
    }
    if (!turn && h.parentElement && h.parentElement !== root) turn = h.parentElement;
    if (turn) out.push({ el: turn, role });
  }
  return out;
}

export const SPECS: Record<SiteId, SiteSpec> = {
  chatgpt: {
    site: 'chatgpt',
    // Older layout: role on each message. Current layout (2026): each turn is announced by a
    // hidden heading ("You said:" / "ChatGPT said:"), found by findTurns below.
    user: ['[data-message-author-role="user"]', '[data-turn="user"]'],
    assistant: ['[data-message-author-role="assistant"]', '[data-turn="assistant"]'],
    findTurns: chatgptTurns,
    userContent: ['.whitespace-pre-wrap', '[data-message-author-role="user"]'],
    assistantContent: ['.markdown', '[data-message-author-role="assistant"]'],
    userIsPlainText: true,
    skip: '[data-testid$="-turn-action-button"], [data-oai-writing-block-surface] > header, [data-oai-writing-block-surface] > button',
    skipIf: (el) => /^h[1-6]$/.test(el.localName) && TURN_LABEL.test(el.textContent ?? ''),
    scroller: ['.thread-scroll-container', '[data-scroll-root]'],
    key: (el) =>
      el.getAttribute('data-message-id') ??
      el.querySelector('[data-message-id]')?.getAttribute('data-message-id') ??
      el.getAttribute('data-testid'),
    model: (el) =>
      (el.getAttribute('data-message-model-slug') ??
        el.querySelector('[data-message-model-slug]')?.getAttribute('data-message-model-slug')) ||
      undefined,
    title: (doc) => stripSuffix(doc.title, 'ChatGPT'),
    // Code blocks show the language as a small label above the code.
    codeLanguage: (pre) => {
      const t = pre.querySelector(':scope > div > div:first-child')?.textContent?.trim();
      return t && /^[\w#+.-]{1,20}$/.test(t) ? t : undefined;
    },
    isConversationPage: (url) => /\/(c|share)\/[\w-]+/.test(url.pathname),
  },

  claude: {
    site: 'claude',
    user: ['[data-testid="user-message"]'],
    assistant: [
      '[data-testid="assistant-message"]',
      '[data-cds="AssistantMessage"]',
      '.font-claude-response',
      '[data-is-streaming]',
    ],
    assistantContent: ['.standard-markdown', '.progressive-markdown', '[class*="markdown"]'],
    skip: '[data-testid="message-actions"], [data-testid="action-bar-copy"], time',
    scroller: ['[data-testid="chat-column-body"]', '[role="log"]'],
    virtualised: true,
    key: (el) => el.getAttribute('data-turn-key'),
    title: (doc) => text(doc, '[data-testid="chat-title-button"]') ?? stripSuffix(doc.title, 'Claude'),
    isConversationPage: (url) => /\/(chat|share)\/[\w-]+/.test(url.pathname),
  },

  gemini: {
    site: 'gemini',
    user: ['user-query'],
    assistant: ['model-response'],
    userContent: ['.query-text'],
    assistantContent: ['message-content .markdown', '.markdown', '.model-response-text', '.response-content'],
    reasoning: ['model-thoughts', 'thinking-overlay', '.thoughts-container'],
    skip: 'mat-icon, .response-footer, message-actions, .cdk-visually-hidden, sources-carousel-inline',
    scroller: ['infinite-scroller.chat-history', '#chat-history'],
    key: (el) => {
      const id = el.closest('.conversation-container')?.id;
      return id ? `${el.localName}:${id}` : null;
    },
    title: (doc) =>
      text(doc, '.conversation.selected .conversation-title') ??
      text(doc, '[data-test-id="conversation-title"]') ??
      stripSuffix(doc.title, 'Gemini', 'Google Gemini'),
    isConversationPage: (url) => /\/(app|gem|share)\/[\w-]+/.test(url.pathname),
  },

  grok: {
    site: 'grok',
    user: [
      '[id^="response-"]:has(> .items-end) .message-bubble',
      '.items-end .message-bubble',
      '.relative.group.flex.flex-col.justify-center.items-end',
    ],
    assistant: [
      '[id^="response-"]:has(> .items-start) .message-bubble',
      '.items-start .message-bubble',
      '.relative.group.flex.flex-col.justify-center.items-start',
    ],
    userContent: ['.whitespace-pre-wrap', 'p'],
    assistantContent: ['.response-content-markdown', '.markdown'],
    reasoning: ['.thinking-container'],
    virtualised: true,
    key: (el) => el.closest('[id^="response-"]')?.id ?? null,
    title: (doc) => stripSuffix(doc.title, 'Grok'),
    isConversationPage: (url) => /\/(c|chat|share)\/[\w-]+|\/i\/grok/.test(url.pathname),
  },

  deepseek: {
    site: 'deepseek',
    user: ['.ds-message:not(:has(.ds-markdown))', '._9663006 .fbb737a4'],
    assistant: ['.ds-message:has(.ds-markdown)', '._43c05b5'],
    userContent: ['.ds-collapsible-text', '.fbb737a4'],
    assistantContent: [
      '.ds-assistant-message-main-content',
      '.ds-markdown:not(.ds-think-content .ds-markdown)',
    ],
    reasoning: ['.ds-think-content'],
    userIsPlainText: true,
    scroller: ['.ds-virtual-list', '.ds-scroll-area'],
    virtualised: true,
    key: (el) =>
      el.closest('[data-virtual-list-item-key]')?.getAttribute('data-virtual-list-item-key') ?? null,
    title: (doc) => stripSuffix(doc.title, 'DeepSeek'),
    isConversationPage: (url) => /\/(a\/)?(chat|share)\//.test(url.pathname),
  },

  kimi: {
    site: 'kimi',
    user: ['.chat-content-item-user', '.segment-user', '.user-content'],
    assistant: ['.chat-content-item-assistant', '.segment-assistant', '.markdown-container'],
    userContent: ['.user-content', '.segment-content-box'],
    assistantContent: ['.markdown-container .markdown', '.markdown'],
    reasoning: ['.thinking-container', '.segment-thinking', '.think-content'],
    skip: '.segment-assistant-actions, .chat-content-item-actions, .toolcall-container',
    userIsPlainText: true,
    virtualised: true,
    title: (doc) => text(doc, '.chat-header-content') ?? stripSuffix(doc.title, 'Kimi', 'Kimi.ai'),
    isConversationPage: (url) => /\/(chat|share)\//.test(url.pathname),
  },
};
