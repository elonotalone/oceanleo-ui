import { captureTextAnchor, textAnchorTop, type TextAnchor } from "./transcript/text-anchor";

/** A reading position is a visible message and its viewport offset, never a scroll ratio/pixel position. */
export type ConversationAnchor = {
  messageId: string;
  offset: number;
  atBottom: boolean;
  /** ACP's transport cursor, taken from the rendered message rather than guessed from its position. */
  rowId?: number;
  /** Used only to count messages received since the reader left. */
  latestId?: string;
  /** ACP history can prepend chunks inside this message and change its first-row key. */
  textAnchor?: TextAnchor;
};
const STORAGE_KEY = "oceanleo:conversation-anchors:v2";
const MAX_ENTRIES = 200;

function store(): Record<string, ConversationAnchor> {
  if (typeof window === "undefined") return {};
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, ConversationAnchor> : {};
  } catch { return {}; }
}

export function rememberConversationAnchor(key: string, anchor: ConversationAnchor): void {
  if (!key || !anchor.messageId || !Number.isFinite(anchor.offset) || typeof window === "undefined") return;
  try {
    const all = store();
    const previous = all[key];
    if (previous && previous.messageId === anchor.messageId && previous.offset === anchor.offset
      && previous.atBottom === anchor.atBottom && previous.rowId === anchor.rowId && previous.latestId === anchor.latestId
      && JSON.stringify(previous.textAnchor) === JSON.stringify(anchor.textAnchor)) return;
    delete all[key];
    all[key] = anchor;
    const entries = Object.entries(all).slice(-MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* Storage may be unavailable; scrolling still works. */ }
}

export function recallConversationAnchor(key: string): ConversationAnchor | null {
  const value = key ? store()[key] : undefined;
  return value && typeof value.messageId === "string" && value.messageId.length > 0
    && typeof value.offset === "number" && Number.isFinite(value.offset) && typeof value.atBottom === "boolean"
    ? value : null;
}

export function forgetConversationScrolls(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* optional */ }
}

export const STREAM_ITEM_SELECTOR = "[data-stream-message-id]";
export function streamMessageElement(el: HTMLElement, messageId: string): HTMLElement | undefined {
  return Array.from(el.querySelectorAll<HTMLElement>(STREAM_ITEM_SELECTOR))
    .find((item) => item.dataset.streamMessageId === messageId);
}
export function captureConversationAnchor(el: HTMLElement, atBottom: boolean, latestId?: string): ConversationAnchor | null {
  const root = el.getBoundingClientRect();
  const top = root.top;
  const bottom = Number.isFinite(root.bottom) ? root.bottom : top + el.clientHeight;
  const items = Array.from(el.querySelectorAll<HTMLElement>(STREAM_ITEM_SELECTOR));
  const item = items.find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return rect.bottom > top && rect.top < bottom;
  }) ?? (atBottom ? items.at(-1) : undefined);
  if (!item?.dataset.streamMessageId) return null;
  const rowId = Number(item.dataset.streamRowId);
  const textAnchor = !atBottom && item.dataset.streamRowIds ? captureTextAnchor(item, top, bottom) : undefined;
  return {
    messageId: item.dataset.streamMessageId,
    offset: item.getBoundingClientRect().top - top,
    atBottom,
    ...(Number.isSafeInteger(rowId) && rowId > 0 ? { rowId } : {}),
    ...(latestId ? { latestId } : {}),
    ...(textAnchor ? { textAnchor } : {}),
  };
}
export function restoreConversationAnchor(el: HTMLElement, anchor: ConversationAnchor | null): boolean {
  const exact = anchor && !anchor.atBottom ? streamMessageElement(el, anchor.messageId) : undefined;
  // A capped history page may start halfway through a merged ACP message. Its
  // earlier chunks change the reducer key, but the original frame is still part
  // of that message (including when other scopes interleave their frame ids).
  const item = exact ?? (anchor && !anchor.atBottom && anchor.rowId
    ? Array.from(el.querySelectorAll<HTMLElement>(STREAM_ITEM_SELECTOR))
      .find((candidate) => candidate.dataset.streamRowIds?.split(" ").includes(String(anchor.rowId))) : undefined);
  if (!item) { el.scrollTop = el.scrollHeight; return true; }
  if (!exact && anchor?.textAnchor) {
    const top = textAnchorTop(item, anchor.textAnchor);
    if (top !== undefined) {
      el.scrollTop += top - el.getBoundingClientRect().top - anchor.textAnchor.offset;
      return false;
    }
  }
  el.scrollTop += item.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor!.offset;
  return false;
}
