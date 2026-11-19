"use client";

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useOlderHistory } from "../history/older-history";
import { captureConversationAnchor, recallConversationAnchor, rememberConversationAnchor, restoreConversationAnchor, type ConversationAnchor } from "../task-scroll-memory";

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
    if (!el || !current.active || placed.current !== current.taskKey) return;
    reading.current = captureConversationAnchor(el, following.current, unreadThrough.current ?? current.messageIds.at(-1));
    if (reading.current && current.taskKey) rememberConversationAnchor(current.taskKey, reading.current);
  }, []);
  const onScroll = useCallback(() => {
    const current = latest.current;
    const el = current.scrollRef.current;
    if (!el || placed.current !== current.taskKey) return;
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
    if (latest.current.taskKey !== current.taskKey) return;
    following.current = true;
    unreadThrough.current = undefined;
    reading.current = null;
    setState({ following: true, unread: 0 });
    const el = current.scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    save();
  }, [save]);

  useLayoutEffect(() => {
    const el = options.scrollRef.current;
    if (!el || !options.active || !options.ready || !options.messageIds.length || el.closest("[hidden]")) return;
    const first = placed.current !== options.taskKey;
    if (first) {
      placed.current = options.taskKey;
      reading.current = recallConversationAnchor(options.taskKey);
      following.current = restoreConversationAnchor(el, reading.current);
      const seen = reading.current?.latestId;
      const index = seen ? options.messageIds.indexOf(seen) : -1;
      unreadThrough.current = !following.current && index < 0 && options.hasMoreAfter ? seen : undefined;
      setState({ following: following.current, unread: !following.current && index >= 0 ? options.messageIds.length - index - 1 : 0 });
    } else {
      const last = previousIds.current.at(-1);
      const index = last ? options.messageIds.indexOf(last) : -1;
      // Prepending older rows or growing the last streamed row never counts as new messages.
      const added = index >= 0 ? options.messageIds.length - index - 1 : 0;
      if (following.current) el.scrollTop = el.scrollHeight;
      else {
        if (reading.current) restoreConversationAnchor(el, reading.current);
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
    save();
  }, [options.taskKey, options.active, options.ready, options.messageIds, options.revision, options.hasMoreAfter, save]);

  useLayoutEffect(() => {
    const el = options.scrollRef.current;
    if (!el || !options.active) return;
    const align = () => {
      if (placed.current !== latest.current.taskKey || !latest.current.ready) return;
      if (following.current) el.scrollTop = el.scrollHeight;
      else if (reading.current) restoreConversationAnchor(el, reading.current);
    };
    // Keep the same visible message aligned as images, code, tool cards and the footer lay out.
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(align);
    resize?.observe(el);
    if (el.firstElementChild) resize?.observe(el.firstElementChild);
    el.addEventListener("load", align, true);
    window.addEventListener("pagehide", save);
    return () => { resize?.disconnect(); el.removeEventListener("load", align, true); window.removeEventListener("pagehide", save); };
  }, [options.active, options.scrollRef, options.taskKey, save]);
  return { ...state, history, onScroll, resumeFollowing, showLatest: !state.following || Boolean(options.hasMoreAfter) };
}
