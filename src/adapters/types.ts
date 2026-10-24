import type { SiteConfig } from '../config/sites';
import type { Message } from '../ir/types';

export interface Adapter {
  site: SiteConfig;
  /** True when the page shows a single conversation that can be exported. */
  isConversationPage(): boolean;
  getTitle(): string;
  /** Scrolls lazy-loaded or virtualised chats until the full history is in the page. */
  loadFullHistory(onProgress: (loaded: number) => void, signal: AbortSignal): Promise<void>;
  /** Root element of every message, in order. Used by selection mode. */
  messageElements(): Element[];
  /** Converts messages to IR in small chunks so the page never freezes. */
  getMessages(
    signal: AbortSignal,
    onProgress?: (done: number, total: number) => void,
    only?: Set<Element>,
  ): Promise<Message[]>;
}

export interface AdapterContext {
  doc: Document;
  url: URL;
}
