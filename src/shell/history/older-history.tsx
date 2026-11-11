"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type JSX, type RefCallback, type RefObject } from "react";

export type OlderHistoryOptions = {
  scrollRef: RefObject<HTMLElement | null>;
  hasMore: boolean;
  loadOlder: () => Promise<void>;
  firstKey: string | number | null;
  prefetchScreens?: number;
  itemSelector?: string;
  disabled?: boolean;
};
export type OlderHistoryState = {
  sentinelRef: RefCallback<HTMLElement>;
  loading: boolean;
  spinnerVisible: boolean;
};
type Anchor = { element: HTMLElement; key: string | null; offset: number; firstKey: OlderHistoryOptions["firstKey"] };

/** One shared, buffered history loader. Position is tied to a message, never total scroll height. */
export function useOlderHistory(options: OlderHistoryOptions): OlderHistoryState {
  const latest = useRef(options);
  const anchor = useRef<Anchor | null>(null);
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [atTop, setAtTop] = useState(false);
  const check = useRef<(() => void) | null>(null);
  const sentinelRef = useCallback<RefCallback<HTMLElement>>((node) => setSentinel(node), []);

  useLayoutEffect(() => {
    latest.current = options;
    const saved = anchor.current;
    const scroller = options.scrollRef.current;
    if (saved && scroller && saved.firstKey !== options.firstKey) {
      const candidates = Array.from(scroller.querySelectorAll<HTMLElement>(options.itemSelector ?? "[data-history-item]"));
      const item = saved.key == null ? saved.element : candidates.find((candidate) => candidate.getAttribute("data-history-key") === saved.key);
      if (item && scroller.contains(item)) {
        scroller.scrollTop += item.getBoundingClientRect().top - scroller.getBoundingClientRect().top - saved.offset;
      }
      anchor.current = null;
    }
    check.current?.();
  });

  useEffect(() => {
    const scroller = options.scrollRef.current;
    if (!scroller || !sentinel || options.disabled) return;
    let disposed = false;
    let inFlight = false;
    let frame: number | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    let retryAt = 0;
    let exhaustedRetries = false;
    let prefetch = true;
    let observer: IntersectionObserver | undefined;

    const capture = () => {
      const top = scroller.getBoundingClientRect().top;
      const item = Array.from(scroller.querySelectorAll<HTMLElement>(latest.current.itemSelector ?? "[data-history-item]"))
        .find((candidate) => candidate.getBoundingClientRect().bottom > top);
      anchor.current = item ? { element: item, key: item.getAttribute("data-history-key"), offset: item.getBoundingClientRect().top - top, firstKey: latest.current.firstKey } : null;
    };
    const schedule = () => {
      if (!disposed && frame == null) frame = requestAnimationFrame(() => { frame = null; void run(); });
    };
    const run = async () => {
      if (disposed) return;
      const current = latest.current;
      const root = scroller.getBoundingClientRect();
      const top = sentinel.getBoundingClientRect().top;
      const height = scroller.clientHeight;
      setAtTop(top >= root.top && top <= root.top + height);
      if (!height || current.disabled || !current.hasMore || inFlight || exhaustedRetries || Date.now() < retryAt) return;
      if (!prefetch && top < root.top - (current.prefetchScreens ?? 1.5) * height) return;
      prefetch = false;
      inFlight = true;
      capture();
      setLoading(true);
      try {
        await current.loadOlder();
        if (disposed) return;
        failures = 0;
        retryAt = 0;
        // Yield a frame for React's prepend + anchor layout effect before testing the buffer again.
        schedule();
      } catch {
        if (disposed) return;
        anchor.current = null;
        const delay = [1000, 3000, 8000][failures++];
        if (delay != null) {
          retryAt = Date.now() + delay;
          retry = setTimeout(() => { retry = null; schedule(); }, delay);
        } else exhaustedRetries = true;
      } finally {
        if (!disposed) { inFlight = false; setLoading(false); }
      }
    };
    const onScroll = () => {
      if (inFlight) capture();
      if (exhaustedRetries) { exhaustedRetries = false; failures = 0; retryAt = 0; }
      schedule();
    };
    const observe = () => {
      observer?.disconnect();
      if (typeof IntersectionObserver !== "undefined") {
        observer = new IntersectionObserver(() => schedule(), { root: scroller, rootMargin: `${(latest.current.prefetchScreens ?? 1.5) * scroller.clientHeight}px 0px 0px 0px` });
        observer.observe(sentinel);
      }
      schedule();
    };
    check.current = schedule;
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", observe);
    const resize = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(observe);
    resize?.observe(scroller);
    observe();
    return () => {
      disposed = true;
      check.current = null;
      anchor.current = null;
      observer?.disconnect();
      resize?.disconnect();
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", observe);
      if (frame != null) cancelAnimationFrame(frame);
      if (retry != null) clearTimeout(retry);
    };
  }, [sentinel, options.scrollRef, options.disabled]);

  return { sentinelRef, loading, spinnerVisible: loading && atTop };
}

export function OlderHistoryTop({ hasMore, spinnerVisible, sentinelRef }: {
  hasMore: boolean;
  spinnerVisible: boolean;
  sentinelRef: RefCallback<HTMLElement>;
}): JSX.Element | null {
  if (!hasMore) return null;
  return (
    <div data-older-history-top="" style={{ height: 32, position: "relative", display: "flex", justifyContent: "center", alignItems: "center" }}>
      <span ref={sentinelRef} data-older-history-sentinel="" style={{ position: "absolute", top: 0, height: 0 }} />
      {spinnerVisible && <span role="status" aria-label="Loading" style={{ display: "flex" }}><span className="v-spinner" aria-hidden="true" /></span>}
    </div>
  );
}
