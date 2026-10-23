"use client";

// 「我的」页的视图状态：交易里选了哪个类别、最近看的是哪个列表。
//
// 为什么不放在 BayMine 的 useState 里：LeoBayPage 的详情与右侧栏都用 `formatBayParam(target)` 当 key 包着 BayMine，
// 地址 `mine:published` → `mine:sold` 一变，BayMine 整个重挂，本地 state 会丢（类别回到「全部」、从主页点回「交易」
// 又回到「我发布的」）。所以放进模块级的小仓里，BayMine 挂着的时候它算数；BayMine 真正离开后（延迟一拍，
// 给「重挂」让路）复位，下次进「我的」从头开始。
import { useEffect, useSyncExternalStore } from "react";
import { DEFAULT_MINE_LIST, type MineList } from "./mine-blocks";
import type { MineCategory } from "./mine-category";

export interface MineView {
  /** 最近一次看的交易列表。地址上有列表时以地址为准；这里只在从主页 / 数据面板点回「交易」时用。 */
  list: MineList;
  category: MineCategory;
}

const INITIAL: MineView = { list: DEFAULT_MINE_LIST, category: "all" };

let view: MineView = INITIAL;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

export function getMineView(): MineView {
  return view;
}

/** 没变化就不换对象、不通知，useSyncExternalStore 才不会白渲染。 */
export function setMineView(patch: Partial<MineView>): void {
  const next: MineView = { ...view, ...patch };
  if (next.list === view.list && next.category === view.category) return;
  view = next;
  emit();
}

export function resetMineView(): void {
  if (view === INITIAL) return;
  view = INITIAL;
  emit();
}

export function subscribeMineView(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMineView(): MineView {
  return useSyncExternalStore(subscribeMineView, getMineView, getMineView);
}

let resetTimer: ReturnType<typeof setTimeout> | null = null;

function cancelPendingReset(): void {
  if (resetTimer === null) return;
  clearTimeout(resetTimer);
  resetTimer = null;
}

function schedulePendingReset(): void {
  cancelPendingReset();
  resetTimer = setTimeout(() => {
    resetTimer = null;
    resetMineView();
  }, 0);
}

/** BayMine 挂载时调用：卸载后延迟一拍复位；同一拍里又挂上来（地址变化引起的重挂）就取消。 */
export function useMineViewLifecycle(): void {
  useEffect(() => {
    cancelPendingReset();
    return schedulePendingReset;
  }, []);
}
