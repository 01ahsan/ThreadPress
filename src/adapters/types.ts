import type { SiteConfig } from '../config/sites';
import type { Message } from '../ir/types';

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
  /** Loads the full history and converts every message to IR, in order. */
  collect(signal: AbortSignal, onProgress: (p: Progress) => void): Promise<CollectedMessage[]>;
}

export interface AdapterContext {
  doc: Document;
  url: URL;
}
