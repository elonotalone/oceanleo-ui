// 远程控制的短提示（几秒后自己消失）。纯 TS，计时器经 deps 注入。
import type { ControlNoticeCode } from "./banner-model";

export const CONTROL_NOTICE_TTL_MS = 7_000;
export const CONTROL_NOTICE_MAX = 4;

export interface ControlNotice {
  id: number;
  code: ControlNoticeCode;
  vars: Record<string, string>;
  sessionId: string | null;
  at: number;
}

export interface ControlNoticeStore {
  push(code: ControlNoticeCode, options?: { vars?: Record<string, string>; sessionId?: string | null; ttlMs?: number }): number | null;
  dismiss(id: number): void;
  clear(): void;
  snapshot(): readonly ControlNotice[];
  subscribe(listener: () => void): () => void;
}

export function createNoticeStore(deps: {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}): ControlNoticeStore {
  let items: readonly ControlNotice[] = [];
  let nextId = 1;
  const timers = new Map<number, unknown>();
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch {
        /* ignore */
      }
    }
  }

  const store: ControlNoticeStore = {
    push(code, options = {}) {
      const sessionId = options.sessionId ?? null;
      // 同一会话同一句只出一次（服务端终态改写本端推断时不重复弹）。
      if (items.some((item) => item.code === code && item.sessionId === sessionId)) return null;
      const notice: ControlNotice = { id: nextId++, code, vars: { ...(options.vars ?? {}) }, sessionId, at: deps.now() };
      const kept = items.length >= CONTROL_NOTICE_MAX ? items.slice(items.length - CONTROL_NOTICE_MAX + 1) : items;
      for (const dropped of items.filter((item) => !kept.includes(item))) {
        const handle = timers.get(dropped.id);
        if (handle !== undefined) deps.clearTimer(handle);
        timers.delete(dropped.id);
      }
      items = [...kept, notice];
      timers.set(
        notice.id,
        deps.setTimer(() => store.dismiss(notice.id), Math.max(1_000, options.ttlMs ?? CONTROL_NOTICE_TTL_MS)),
      );
      emit();
      return notice.id;
    },
    dismiss(id) {
      const handle = timers.get(id);
      if (handle !== undefined) deps.clearTimer(handle);
      timers.delete(id);
      const next = items.filter((item) => item.id !== id);
      if (next.length === items.length) return;
      items = next;
      emit();
    },
    clear() {
      for (const handle of timers.values()) deps.clearTimer(handle);
      timers.clear();
      if (items.length === 0) return;
      items = [];
      emit();
    },
    snapshot: () => items,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return store;
}
