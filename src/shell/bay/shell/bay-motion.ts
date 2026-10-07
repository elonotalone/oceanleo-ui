"use client";

// 窄浮窗「列表 → 详情」推进、返回滑回。用 Web Animations，不依赖主题 CSS；系统要求减少动效时不动。
import { useLayoutEffect, useRef } from "react";
import { MOTION_EASING_TOKENS } from "../../../theme/motion";
import { bayLastNavDirection } from "./bay-state";

const useIsoLayoutEffect = typeof window === "undefined" ? () => {} : useLayoutEffect;

/** Web Animations 的 easing 不吃 `var(--leo-ease-*)`，取令牌在 JS 里的值（入场用 decelerate）。 */
const SLIDE_EASE =
  MOTION_EASING_TOKENS.find((token) => token.name === "--leo-ease-decelerate")?.value ?? "ease-out";

function reducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** 挂载时（以及 `trigger` 变化时）按最近一次切换方向滑入；`part` 为 list 时只在返回时滑。 */
export function useBaySlideIn<T extends HTMLElement>(enabled: boolean, part: "list" | "detail", trigger: string = "") {
  const ref = useRef<T | null>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof el.animate !== "function" || reducedMotion()) return;
    const direction = bayLastNavDirection();
    if (part === "list" && direction !== "back") return;
    const from = direction === "back" ? "-24px" : "24px";
    el.animate(
      [
        { transform: `translateX(${from})`, opacity: 0.4 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: 180, easing: SLIDE_EASE },
    );
  }, [enabled, part, trigger]);
  return ref;
}
