import type { Conversation } from '../ir/types';

/** The IR itself, pretty-printed. */
export function toJson(conv: Conversation): string {
  return JSON.stringify(conv, null, 2) + '\n';
}
