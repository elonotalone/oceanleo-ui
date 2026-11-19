"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useOlderHistory } from "../history/older-history";
import { captureConversationAnchor, recallConversationAnchor, rememberConversationAnchor, restoreConversationAnchor, type ConversationAnchor, STREAM_ITEM_SELECTOR } from "../task-scroll-memory";

export type StreamScrollOptions = {
  taskKey: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Stable rendered message ids, in order. Streaming changes revision, not these ids. */
  messageIds: readonly string[];
  revision: unknown;
  active: boolean;
  ready: boolean;
  hasMore: boolean;
  loadEarlier: () => Promise<void>;
  hasMoreAfter?: boolean;
  loadLatest?: () => Promise<void>;
};
export function useStreamScroll(options: StreamScrollOptions) {
  const latest = useRef(options);
  latest.current = options;
  const placed = useRef<string | null>(null);
  const following = useRef(true);
  // Scroll events are asynchronous: retain the last aligned position until the reader moves.
  const aligned = useRef<{ element: HTMLElement; top: number } | null>(null);
  const previousIds = useRef<readonly string[]>([]);
  const reading = useRef<ConversationAnchor | null>(null);
  const unreadThrough = useRef<string | undefined>(undefined);
  const [state, setState] = useState({ following: true, unread: 0 });
  const history = useOlderHistory({
    scopeKey: options.taskKey, scrollRef: options.scrollRef, hasMore: options.hasMore, loadOlder: options.loadEarlier,
    firstKey: options.messageIds[0] ?? null,
    disabled: !options.active || !options.ready || !options.messageIds.length,
  });
  const save = useCallback(() => {
    const current = latest.current;
    const el = current.scrollRef.current;
    if (!el || !current.active || !current.ready || !current.messageIds.length || !el.clientHeight
      || el.closest("[hidden]") || placed.current !== current.taskKey) return;
    reading.current = captureConversationAnchor(el, following.current, unreadThrough.current ?? current.messageIds.at(-1));
    if (reading.current && current.taskKey) rememberConversationAnchor(current.taskKey, reading.current);
  }, []);
  const align = useCallback((el: HTMLElement, anchor: ConversationAnchor | null) => {
    const bottom = restoreConversationAnchor(el, anchor);
    aligned.current = { element: el, top: el.scrollTop };
    return bottom;
  }, []);
  const onScroll = useCallback(() => {
    const current = latest.current;
    const el = current.scrollRef.current;
    if (!el || !current.active || !current.ready || !current.messageIds.length || !el.clientHeight
      || el.closest("[hidden]") || placed.current !== current.taskKey) return;
    // Restoration/following/layout must not become a new reading decision, even
    // when a not-yet-measured footer temporarily puts the anchor near the bottom.
    if (aligned.current?.element === el && aligned.current.top === el.scrollTop) return;
    aligned.current = { element: el, top: el.scrollTop };
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
    following.current = bottom;
    setState((previous) => previous.following === bottom && (!bottom || previous.unread === 0)
      ? previous : { following: bottom, unread: bottom ? 0 : previous.unread });
    save();
  }, [save]);
  const resumeFollowing = useCallback(async () => {
    const current = latest.current;
    if (current.hasMoreAfter && current.loadLatest) await current.loadLatest();
    // A task switch during the request must not move the next task.
    if (latest.current.taskKey !== current.taskKey || !latest.current.active || !latest.current.ready
      || !latest.current.messageIds.length) return;
    following.current = true;
    unreadThrough.current = undefined;
    reading.current = null;
    setState({ following: true, unread: 0 });
    const el = current.scrollRef.current;
    if (el) align(el, null);
    save();
  }, [align, save]);

  const placeStream = useCallback(() => {
    const options = latest.current;
    const el = options.scrollRef.current;
    if (!el || !options.active || !options.ready || !options.messageIds.length || !el.clientHeight || el.closest("[hidden]")
      || !el.querySelector(STREAM_ITEM_SELECTOR)) {
      // Cached message ids can be ready while the access gate still omits their
      // DOM. Wait for a rendered message before deciding the anchor is missing.
      // Its next populated layout must restore again before following or saving.
      placed.current = null;
      aligned.current = null;
      previousIds.current = [];
      return;
    }
    const first = placed.current !== options.taskKey;
    if (first) {
      reading.current = recallConversationAnchor(options.taskKey);
      following.current = align(el, reading.current);
      placed.current = options.taskKey;
      const seen = reading.current?.latestId;
      const index = seen ? options.messageIds.indexOf(seen) : -1;
      unreadThrough.current = !following.current && index < 0 && options.hasMoreAfter ? seen : undefined;
      setState({ following: following.current, unread: !following.current && index >= 0 ? options.messageIds.length - index - 1 : 0 });
    } else {
      const last = previousIds.current.at(-1);
      const index = last ? options.messageIds.indexOf(last) : -1;
      // Prepending older rows or growing the last streamed row never counts as new messages.
      const added = index >= 0 ? options.messageIds.length - index - 1 : 0;
      if (following.current) align(el, null);
      else {
        if (reading.current) align(el, reading.current);
        const baseline = unreadThrough.current;
        if (baseline) {
          const seen = options.messageIds.indexOf(baseline);
          if (seen >= 0) {
            unreadThrough.current = undefined;
            setState((previous) => ({ ...previous, unread: options.messageIds.length - seen - 1 }));
          } else if (!options.hasMoreAfter) unreadThrough.current = undefined;
        } else if (added > 0) setState((previous) => ({ ...previous, unread: previous.unread + added }));
      }
    }
    previousIds.current = options.messageIds;
  }, [align]);
  useLayoutEffect(placeStream, [options.taskKey, options.active, options.ready, options.messageIds, options.revision, options.hasMoreAfter, placeStream]);

  useLayoutEffect(() => {
    const el = options.scrollRef.current;
    if (!el || !options.active) return;
    // This also performs a deferred first placement if the pane was initially
    // zero-height and only became measurable after its parent laid out.
    const realign = () => placeStream();
    const persist = () => {
      // pagehide can run after the browser has changed/removed the viewport.
      // Persist the established reader anchor, never capture that transient DOM.
      if (placed.current === options.taskKey && reading.current) rememberConversationAnchor(options.taskKey, reading.current);
    };
    // Keep the same visible message aligned as images, code, tool cards and the footer lay out.
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(realign);
    resize?.observe(el);
    if (el.firstElementChild) resize?.observe(el.firstElementChild);
    el.addEventListener("load", realign, true);
    window.addEventListener("pagehide", persist);
    return () => { resize?.disconnect(); el.removeEventListener("load", realign, true); window.removeEventListener("pagehide", persist); };
  }, [options.active, options.scrollRef, options.taskKey, placeStream]);
  return { ...state, history, onScroll, resumeFollowing, showLatest: !state.following || Boolean(options.hasMoreAfter) };
}
