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
// 正确：用本 helper 同步读 URL。SSR 阶段 window 不存在 → 返回 false（SSR 不渲染
// 真实侧栏数据，hydration 后第一帧立刻拿到正确值，无可见闪屏）。客户端首帧即正确。
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

import { useState } from "react";

/**
 * React hook：首帧同步返回 embed 状态（用 lazy initializer，避免「先 false 再 true」
 * 的闪屏）。SiteShell 用它替换 `useState(false)+useEffect` 反模式：
 *
 *   const embed = useIsEmbed();
 *   if (embed) return <div className="min-h-dvh bg-stone-50">{children}</div>;
 */
export function useIsEmbed(): boolean {
  const [embed] = useState<boolean>(() => isEmbed());
  return embed;
}

/** React hook：首帧同步返回 solo 状态。 */
export function useIsSolo(): boolean {
  const [solo] = useState<boolean>(() => isSolo());
  return solo;
}
