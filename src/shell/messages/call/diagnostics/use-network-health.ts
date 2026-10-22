"use client";

// `useNetworkHealth()`：每 2 秒取一次 `callActions.getStats()`，换算成好/一般/差，持续变差时给出建议（仅语音）。
// 全页面共用一个采样器（见 health-monitor.ts），不在通话中时不取统计、结果清零。
import { useSyncExternalStore } from "react";
import { callActions, callStore } from "../engine";
import { createHealthMonitor, monitorContextFromSnapshot, type HealthMonitor } from "./health-monitor";
import type { NetworkHealth } from "./health";

let shared: HealthMonitor | null = null;

function monitor(): HealthMonitor {
  if (!shared) {
    shared = createHealthMonitor({
      getStats: () => callActions.getStats(),
      getContext: () => monitorContextFromSnapshot(callStore.getSnapshot()),
      subscribeCall: (listener) => callStore.subscribe(listener),
      now: () => Date.now(),
      setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
      clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>),
    });
  }
  return shared;
}

export function useNetworkHealth(): NetworkHealth {
  const m = monitor();
  return useSyncExternalStore(m.subscribe, m.getSnapshot, m.getServerSnapshot);
}
