// 通话界面的视口小钩子：窄屏判定、固定侧栏让位、走秒的时钟、浏览器能不能共享屏幕。
import { useEffect, useState } from "react";
import { NARROW_MEDIA_QUERY, NO_INSETS, insetsFromSidebarRect, type SideInsets } from "./layout";

function matchNarrow(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(NARROW_MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

/** 手机浏览器宽度：小窗变底部条，放大视图每页 4 格。 */
export function useNarrowViewport(): boolean {
  const [narrow, setNarrow] = useState(matchNarrow);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(NARROW_MEDIA_QUERY);
    const update = () => setNarrow(query.matches);
    update();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }
    // 老 Safari 只有 addListener。
    query.addListener?.(update);
    return () => query.removeListener?.(update);
  }, []);
  return narrow;
}

const SIDEBAR_SELECTOR = "aside[data-oceanleo-sidebar-mode]";

/** 量一次固定侧栏：没有、藏着（手机）、宽 0 都算不占位。 */
export function measureSidebarInsets(doc: Document): SideInsets {
  const view = doc.defaultView;
  const aside = doc.querySelector<HTMLElement>(SIDEBAR_SELECTOR);
  if (!view || !aside) return NO_INSETS;
  if (view.getComputedStyle(aside).display === "none") return NO_INSETS;
  return insetsFromSidebarRect(aside.getBoundingClientRect(), view.innerWidth);
}

/**
 * 固定侧栏占掉的宽度（侧栏收起/展开会变宽窄，换页时外壳可能重挂一个新的侧栏节点），
 * 所以除了 resize 与 ResizeObserver，再每 3 秒复量一次——只是一次查询加一次取矩形。
 */
export function useSidebarInsets(enabled: boolean): SideInsets {
  const [insets, setInsets] = useState<SideInsets>(NO_INSETS);
  useEffect(() => {
    if (!enabled || typeof document === "undefined") {
      setInsets(NO_INSETS);
      return undefined;
    }
    let observed: Element | null = null;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => update());
    function update() {
      const aside = document.querySelector(SIDEBAR_SELECTOR);
      if (observer && aside !== observed) {
        if (observed) observer.unobserve(observed);
        if (aside) observer.observe(aside);
        observed = aside;
      }
      const next = measureSidebarInsets(document);
      setInsets((current) => (current.left === next.left && current.right === next.right ? current : next));
    }
    update();
    window.addEventListener("resize", update);
    const timer = window.setInterval(update, 3000);
    return () => {
      window.removeEventListener("resize", update);
      window.clearInterval(timer);
      observer?.disconnect();
    };
  }, [enabled]);
  return insets;
}

/** 走秒的时钟（时长、倒计时）；不需要时不起定时器。 */
export function useNow(enabled: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs]);
  return now;
}

/** 手机浏览器拿不到 getDisplayMedia（事实 F41：Web 端手机浏览器不能共享屏幕）。 */
export function canShareScreen(): boolean {
  if (typeof navigator === "undefined") return false;
  const devices = navigator.mediaDevices as (MediaDevices & { getDisplayMedia?: unknown }) | undefined;
  return Boolean(devices && typeof devices.getDisplayMedia === "function");
}
