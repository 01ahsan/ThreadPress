// The typed intermediate representation (IR). Adapters produce it; exporters consume it.
// Raw page HTML never crosses this boundary.

import type { SiteId } from '../config/sites';

export const IR_VERSION = 1;

/** A MathML element copied from the page through an allowlist (see ir/math.ts). */
export interface MathNode {
  tag: string;
  attrs?: Record<string, string>;
  /** Text content of token elements (mi, mn, mo, mtext, ms, mspace). */
  text?: string;
  children?: MathNode[];
}

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold' | 'italic' | 'strike'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'math'; tex: string; mathml?: MathNode }
  | { type: 'break' };

export type Align = 'left' | 'center' | 'right' | null;

export interface ListItem {
  blocks: Block[];
  /** Set for task-list items. */
  checked?: boolean;
}

export type Block =
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; inlines: Inline[] }
  | { type: 'list'; ordered: boolean; start?: number; items: ListItem[] }
  | { type: 'code'; language?: string; text: string }
  | { type: 'math'; tex: string; mathml?: MathNode }
  | { type: 'table'; align: Align[]; header: Inline[][]; rows: Inline[][][] }
  | { type: 'image'; src?: string; alt: string; data?: string }
  | { type: 'blockquote'; blocks: Block[] }
  | { type: 'hr' }
  | { type: 'footnote'; label: string; inlines: Inline[] }
  | { type: 'reasoning'; summary?: string; blocks: Block[] }
  | { type: 'attachment'; name: string };

/** 'unknown' is used only by the generic selection fallback, where roles cannot be told apart. */
export type Role = 'user' | 'assistant' | 'unknown';

export interface Message {
  role: Role;
  model?: string;
  blocks: Block[];
}

export interface Conversation {
  version: typeof IR_VERSION;
  title: string;
  site: SiteId | 'unknown';
  url: string;
  /** ISO 8601 timestamp of the export. */
  exportedAt: string;
  messages: Message[];
}
