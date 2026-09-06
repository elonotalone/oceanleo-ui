// ============================================================================
// @oceanleo/ui — 「有编辑器 / 详情面板正开着」的共享开关（workbenchOpen）
// ----------------------------------------------------------------------------
// 为什么要有它（plugin-chrome X4，2026-09-06）
//
// 右上角「模型组合」选择框原来只按路由判显隐（`model-picker-visibility.ts`）：
// `/history/<id>` 是对话页 → 显示。可 /history 页里点开「我的库」的一件素材之后，
// 同一条路由上叠出来的是**编辑器**，选择框仍按对话页的规则留在那里，正好压住
// 素材库面板自己的页签（操作员截图：「模型组合 Lite」盖住「我的库」）。
//
// 路由不知道覆盖层的事，所以这里给一个与路由无关的开关：任何一处编辑器 / 详情面板
// 挂上就登记（claim），卸下就注销；`ModelPicker` 看到有登记就不渲染。
//
// 形状是**计数器**而不是布尔：工作台里同一时刻可能有多层（ResultCanvas 的前台 +
// 它挂出的 AdvancedContentWorkbench），任何一个卸载都不该把别人的登记清掉。
// 用 `useSyncExternalStore` 订阅，SSR 首帧固定 false（服务端没有「已打开」的编辑器），
// 客户端等编辑器真挂上再翻成 true，不制造 hydration 不一致。
// ============================================================================

import { useEffect, useSyncExternalStore } from "react";

const owners = new Set<string>();
const listeners = new Set<() => void>();
let sequence = 0;

function emit() {
  listeners.forEach((listener) => listener());
}

/** 当前是否有任意编辑器 / 详情面板登记为「打开」。 */
export function workbenchOpenSnapshot(): boolean {
  return owners.size > 0;
}

function serverSnapshot(): boolean {
  return false;
}

export function subscribeWorkbenchOpen(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 登记一处「已打开」。返回注销函数；重复注销幂等。
 * 非 React 场景（或测试）直接用；组件里请用 `useWorkbenchOpenClaim`。
 */
export function claimWorkbenchOpen(ownerId?: string): () => void {
  sequence += 1;
  const id = ownerId || `workbench-open:${sequence}`;
  const wasOpen = owners.size > 0;
  owners.add(id);
  if (!wasOpen) emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (!owners.delete(id)) return;
    if (owners.size === 0) emit();
  };
}

/** 只给测试用：清空所有登记，避免用例之间串台。 */
export function resetWorkbenchOpenForTests() {
  if (owners.size === 0) return;
  owners.clear();
  emit();
}

/** 订阅开关；SSR / hydration 首帧固定 false。 */
export function useWorkbenchOpen(): boolean {
  return useSyncExternalStore(
    subscribeWorkbenchOpen,
    workbenchOpenSnapshot,
    serverSnapshot,
  );
}

/**
 * 组件挂着且 `active` 为 true 的整段时间内登记为「打开」；`active` 翻回 false
 * 或组件卸载时注销。用在 `AdvancedContentWorkbench`（任何编辑器）与
 * `ResultCanvas`（前台：编辑器 / 详情预览 / 插件模块）。
 */
export function useWorkbenchOpenClaim(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return claimWorkbenchOpen();
  }, [active]);
}
