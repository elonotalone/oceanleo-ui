"use client";

// ============================================================================
// @oceanleo/ui — embed/solo 同步判定 helper（杀「先画整壳再跳」闪屏的单一事实源）
// ----------------------------------------------------------------------------
// doctrine v3（oceanleo-function-agent-and-app-shell.md §5.3）：主站工作台用
// iframe 内嵌子站 /workspace?embed=1&solo=1。子站 SiteShell 必须在**第一次渲染**
// 就知道自己是否处于 embed，否则会先把整套侧边栏外壳画出来、effect 跑完才切到
// 裸视图 → 肉眼可见的「先显示错的、再跳到对的」闪屏（操作员 2026-06-21 反馈）。
//
// 反模式（禁止）：
//   const [embed, setEmbed] = useState(false);
//   useEffect(() => { if (...search...) setEmbed(true); }, []);  // ← 第一帧 false
//
// 正确：SSR/hydration 都先返回 false，确保 React 树一致；EmbedChrome 已在首帧绘制前
// 用 CSS 隐藏 SSR 外壳。hydration 完成后 useSyncExternalStore 读取真实 URL 并摘掉外壳。
// ============================================================================

function readFlag(name: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).get(name) === "1";
  } catch {
    return false;
  }
}

/** 当前是否处于主站 iframe 内嵌（?embed=1）。同步、首帧即正确。 */
export function isEmbed(): boolean {
  return readFlag("embed");
}

/** 当前是否处于「只渲染单个功能区」内嵌（?solo=1）。 */
export function isSolo(): boolean {
  return readFlag("solo");
}

import { useSyncExternalStore } from "react";

function subscribeUrlFlags(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function serverFlag(): boolean {
  return false;
}

/**
 * React hook：SSR 与 hydration 使用同一快照；pre-paint CSS 负责隐藏 SSR 外壳，
 * hydration 后再读取真实 URL，既不闪整壳，也不制造 React #418。
 *
 *   const embed = useIsEmbed();
 *   if (embed) return <div className="min-h-dvh bg-stone-50">{children}</div>;
 */
export function useIsEmbed(): boolean {
  return useSyncExternalStore(subscribeUrlFlags, isEmbed, serverFlag);
}

/** React hook：同样以 hydration-safe 快照返回 solo 状态。 */
export function useIsSolo(): boolean {
  return useSyncExternalStore(subscribeUrlFlags, isSolo, serverFlag);
}
