// ============================================================================
// Per-conversation scroll position for the life of the page (2026-10-31 W5, point 10)
// ----------------------------------------------------------------------------
// Switching tasks without a reload comes back where the user was; a reload (this
// module starts empty) or a first open lands at the latest message on the first
// painted frame — an instant jump, never a smooth top-to-bottom scroll.
// Keys: `task:<taskId>` (the OceanLeo conversation) and `native:<sessionId>`.
// Memory only; nothing is persisted.
// ============================================================================

export interface RememberedScroll {
  top: number;
  /** The user was following the latest message: come back to the (new) bottom. */
  atBottom: boolean;
}

const memory = new Map<string, RememberedScroll>();
/** Plenty for a session of switching; the oldest entries go first. */
const MAX_ENTRIES = 200;

export function rememberConversationScroll(key: string, top: number, atBottom: boolean): void {
  if (!key) return;
  memory.delete(key);
  memory.set(key, { top: Math.max(0, top), atBottom });
  if (memory.size > MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
}

export function recallConversationScroll(key: string): RememberedScroll | null {
  return key ? memory.get(key) ?? null : null;
}

/** Test seam. */
export function forgetConversationScrolls(): void {
  memory.clear();
}

/**
 * Where a conversation opens: the remembered spot when the user had scrolled up,
 * otherwise the bottom. Returns whether the stream should keep following.
 */
export function initialConversationScroll(
  saved: RememberedScroll | null,
  scrollHeight: number,
): { top: number; follow: boolean } {
  if (saved && !saved.atBottom) return { top: saved.top, follow: false };
  return { top: scrollHeight, follow: true };
}

/**
 * Place the stream's first frame (instant: `scrollTop`, never `scrollTo` smooth).
 * Content that grows right after (images, code blocks laying out) keeps it at the
 * bottom for a moment while the user is still following.
 */
export function placeConversationScroll(
  el: HTMLElement,
  key: string,
  following: () => boolean,
): { follow: boolean; release: () => void } {
  const placed = initialConversationScroll(recallConversationScroll(key), el.scrollHeight);
  el.scrollTop = placed.top;
  if (!placed.follow || typeof ResizeObserver === "undefined") {
    return { follow: placed.follow, release: () => {} };
  }
  const content = el.firstElementChild;
  const observer = new ResizeObserver(() => {
    if (following()) el.scrollTop = el.scrollHeight;
  });
  observer.observe(content ?? el);
  const timer = setTimeout(() => observer.disconnect(), 1500);
  return {
    follow: true,
    release: () => {
      clearTimeout(timer);
      observer.disconnect();
    },
  };
}

/** A pane inside a `hidden` ancestor has no layout yet: place it once shown. */
export function scrollPaneShown(el: HTMLElement): boolean {
  return !el.closest("[hidden]");
}
