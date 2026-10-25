import { SITES, type SiteId } from '../config/sites';
import type { Block, Conversation, Message } from '../ir/types';

export type ImageMode = 'placeholder' | 'link';

export interface ExportOptions {
  /** 'placeholder' (default) keeps image addresses out of the file; image links can carry access tokens. */
  images: ImageMode;
  includeModel: boolean;
  paper: 'A4' | 'Letter';
  labels: { user: string; assistant: string; unknown: string };
}

export const DEFAULT_OPTIONS: ExportOptions = {
  images: 'placeholder',
  includeModel: true,
  paper: 'A4',
  /** An empty assistant label means "use the site's name" (ChatGPT, Claude, …). */
  labels: { user: 'You', assistant: '', unknown: 'Selection' },
};

export function siteLabel(site: SiteId | 'unknown'): string {
  return SITES.find((s) => s.id === site)?.label ?? 'Web page';
}

export function messageLabel(m: Message, opts: ExportOptions, site: SiteId | 'unknown'): string {
  const base =
    opts.labels[m.role] || (m.role === 'assistant' && site !== 'unknown' ? siteLabel(site) : 'Assistant');
  return opts.includeModel && m.model ? `${base} (${m.model})` : base;
}

/** Applies privacy-related options to the IR before any exporter sees it. */
export function prepare(conv: Conversation, opts: ExportOptions): Conversation {
  const strip = (blocks: Block[]): Block[] =>
    blocks.map((b): Block => {
      switch (b.type) {
        case 'image':
          return opts.images === 'placeholder'
            ? { type: 'image', alt: b.alt, ...(b.data ? { data: b.data } : {}) }
            : b;
        case 'list':
          return { ...b, items: b.items.map((it) => ({ ...it, blocks: strip(it.blocks) })) };
        case 'blockquote':
        case 'reasoning':
          return { ...b, blocks: strip(b.blocks) };
        default:
          return b;
      }
    });
  return {
    ...conv,
    messages: conv.messages.map((m) => ({
      role: m.role,
      ...(opts.includeModel && m.model ? { model: m.model } : {}),
      blocks: strip(m.blocks),
    })),
  };
}
