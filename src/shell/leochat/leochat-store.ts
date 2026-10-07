"use client";

// LeoBay 待处理数：入口图标、小窗的栏目标签、整页的栏目标签看的是同一个数。
// 全页只有一份轮询（登录时每 60 秒取一次，切回标签页时再取一次）；最后一个使用方卸载就停。
import { useEffect, useSyncExternalStore } from "react";
import { fetchBaySummary } from "../../lib/bay/feed";

const POLL_MS = 60_000;

let count = 0;
let users = 0;
let timer: ReturnType<typeof setInterval> | null = null;
/** 每次开始轮询换一个号：停掉之后才回来的旧请求不许再改数。 */
let generation = 0;
const listeners = new Set<() => void>();

function setCount(next: number): void {
  const value = Number.isFinite(next) && next > 0 ? Math.trunc(next) : 0;
  if (value === count) return;
  count = value;
  for (const listener of Array.from(listeners)) listener();
}

function refresh(): void {
  if (typeof document !== "undefined" && document.hidden) return;
  const started = generation;
  fetchBaySummary().then(
    (summary) => {
      if (started === generation && users > 0) setCount(summary.needs_action);
    },
    () => {
      /* 取不到就不显示角标 */
    },
  );
}

function onVisible(): void {
  if (!document.hidden) refresh();
}

function acquire(): () => void {
  users += 1;
  if (users === 1) {
    generation += 1;
    refresh();
    timer = setInterval(refresh, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    users = Math.max(0, users - 1);
    if (users > 0) return;
    generation += 1;
    if (timer) clearInterval(timer);
    timer = null;
    document.removeEventListener("visibilitychange", onVisible);
    setCount(0);
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `enabled` = 已登录且本站有 LeoBay。没启用时恒为 0，也不发请求。 */
export function useBayNeedsAction(enabled: boolean): number {
  const value = useSyncExternalStore(subscribe, () => count, () => 0);
  useEffect(() => (enabled ? acquire() : undefined), [enabled]);
  return enabled ? value : 0;
}
