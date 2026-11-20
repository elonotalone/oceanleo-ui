import type { ImMessage } from "../../../lib/im/types";
import type { ListMessagesParams, MessagePage } from "../../../lib/im/messages-api";
import { isSelectableMessage } from "./message-selection";

export const TASK_FORWARD_LIMIT = 2000;
export const QUOTE_FORWARD_LIMIT = 500;

/** Read from the newest page, even when the visible window is a search result.
 * Fail closed on a broken cursor: never copy a partial record as a complete one. */
export async function loadSelectionHistory(
  fetchPage: (params: ListMessagesParams) => Promise<MessagePage>,
  limit = Infinity,
): Promise<ImMessage[]> {
  const selected = new Map<string, ImMessage>();
  let before: number | undefined;
  while (true) {
    const page = await fetchPage({ before_seq: before, limit: 100 });
    for (const message of page.items) if (isSelectableMessage(message)) selected.set(message.id, message);
    if (!page.has_more_before || selected.size >= limit) break;
    const oldest = Math.min(...page.items.map((message) => message.seq));
    if (!Number.isFinite(oldest) || (before !== undefined && oldest >= before)) throw new Error("History did not advance");
    before = oldest;
  }
  return [...selected.values()].sort((a, b) => a.seq - b.seq).slice(limit === Infinity ? 0 : -limit);
}
