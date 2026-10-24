// ChatGPT (chatgpt.com, chat.openai.com).
// Each message is an element with data-message-author-role; assistant answers render
// into a .markdown container, user prompts into a .whitespace-pre-wrap container.

import { siteById } from '../config/sites';
import { blocksFromElement, blocksFromNodes, type ConvertOptions } from '../ir/from-dom';
import { inlineText } from '../ir/inline';
import type { Block, Message } from '../ir/types';
import { mapInChunks } from './chunk';
import { findScrollContainer, scrollToLoadAll } from './scroll-loader';
import type { Adapter, AdapterContext } from './types';

const site = siteById('chatgpt');
const MESSAGE = '[data-message-author-role]';

export function createChatGPTAdapter({ doc, url }: AdapterContext): Adapter {
  const messageElements = () =>
    Array.from(doc.querySelectorAll(MESSAGE)).filter((el) => {
      const role = el.getAttribute('data-message-author-role');
      return (role === 'user' || role === 'assistant') && !el.parentElement?.closest(MESSAGE);
    });

  const convert = (el: Element): Message => {
    const role = el.getAttribute('data-message-author-role') === 'user' ? 'user' : 'assistant';
    const model = el.getAttribute('data-message-model-slug') ?? undefined;
    const opts: ConvertOptions = {
      baseUrl: url.href,
      codeLanguage: codeLanguageFromHeader,
      skip: (e) => e.matches('[data-testid$="-turn-action-button"]'),
    };
    let blocks: Block[];
    if (role === 'user') {
      const bubble = el.querySelector('.whitespace-pre-wrap');
      const images = Array.from(el.querySelectorAll('img')).filter((img) => !bubble?.contains(img));
      blocks = [
        ...blocksFromNodes(images, opts),
        ...(bubble
          ? blocksFromElement(bubble, { ...opts, preserveWhitespace: true })
          : blocksFromElement(el, opts)),
      ];
    } else {
      const parts = Array.from(el.querySelectorAll('.markdown')).filter(
        (m) => !m.parentElement?.closest('.markdown'),
      );
      blocks = parts.length ? parts.flatMap((p) => blocksFromElement(p, opts)) : blocksFromElement(el, opts);
    }
    return { role, ...(role === 'assistant' && model ? { model } : {}), blocks };
  };

  return {
    site,
    isConversationPage: () => /\/(c|share)\/[\w-]+/.test(url.pathname) || messageElements().length > 0,
    getTitle() {
      const t = doc.title.replace(/\s*[-|–]\s*ChatGPT\s*$/i, '').trim();
      if (t && !/^ChatGPT$/i.test(t)) return t;
      const first = messageElements()[0];
      const firstText = first ? inlineTextOf(convert(first)) : '';
      return firstText.slice(0, 60).trim() || 'ChatGPT conversation';
    },
    async loadFullHistory(onProgress, signal) {
      const first = messageElements()[0] ?? null;
      await scrollToLoadAll({
        container: findScrollContainer(first),
        count: () => messageElements().length,
        onProgress,
        signal,
        settleMs: 300,
        stableRounds: 2,
      });
    },
    messageElements,
    getMessages(signal, onProgress, only) {
      const els = messageElements().filter((el) => !only || only.has(el));
      return mapInChunks(els, convert, signal, onProgress);
    },
  };
}

/** Code blocks show the language as a small label above the code. */
function codeLanguageFromHeader(pre: Element): string | undefined {
  const label = pre.querySelector(':scope > div > div:first-child');
  const text = label?.textContent?.trim();
  return text && /^[\w#+.-]{1,20}$/.test(text) ? text : undefined;
}

function inlineTextOf(m: Message): string {
  const p = m.blocks.find((b) => b.type === 'paragraph');
  return p && p.type === 'paragraph' ? inlineText(p.inlines).replace(/\s+/g, ' ') : '';
}
