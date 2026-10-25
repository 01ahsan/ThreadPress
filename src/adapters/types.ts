import type { SiteConfig } from '../config/sites';
import type { Message, Role } from '../ir/types';

export interface Progress {
  phase: 'loading' | 'reading';
  done: number;
}

export interface CollectedMessage {
  /** Stable identity within one collection pass. */
  key: string;
  message: Message;
  /** First words of the message, for the message picker. */
  preview: string;
}

export interface Adapter {
  site: SiteConfig;
  /** True when the page shows a conversation that can be exported. */
  isConversationPage(): boolean;
  getTitle(): string;
  /** Messages currently in the page (cheap; for display only). */
  count(): number;
  /** Message elements currently in the page, in order, with their roles. */
  turns(): { el: Element; role: Role }[];
  /** Site-specific toolbar button to place the export icon after, when no labelled Copy exists. */
  toolbarAnchor(turn: Element): Element | null;
  /** Converts one message element to IR. */
  read(turn: { el: Element; role: Role }): Message;
  /** Loads the full history and converts every message to IR, in order. */
  collect(signal: AbortSignal, onProgress: (p: Progress) => void): Promise<CollectedMessage[]>;
}

export interface AdapterContext {
  doc: Document;
  url: URL;
}
