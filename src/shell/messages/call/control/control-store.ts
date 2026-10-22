// 远程控制会话仓（本标签页一份）。纯 TS（时间经 deps 注入），测试直接用真实实现。
//
// 来源有三路，到达顺序不保证：`call_control` 事件、`CallView.controls`（状态提供者，只列待批准与进行中）、
// 本端接口调用的返回体。合并规则：
//  - 状态只往前走：pending → active → 终态（ended/declined/expired/cancelled）；旧状态的迟到消息丢弃。
//  - 第一个「服务端终态」定稿；本端推断的终态（超时没回音、名单里消失）可以被服务端终态改写，反之不行。
//  - `CallView.controls` 里没有、而本仓认为还活着、且 3 秒没再见过的会话 → 本端推断为 ended（漏了事件也能收尾）。
//  - 被控方收到的请求（`call_control_request`）单独存，会话一离开 pending 或过期就撤掉。
import type {
  CallControlRequestEvent,
  ControlState,
  ControlView,
} from "../../../../lib/im/call-types";
import { CONTROL_PENDING_MS } from "./protocol";

export const CONTROL_RECONCILE_GRACE_MS = 3_000;
export const CONTROL_EXPIRY_GRACE_MS = 3_000;

const RANK: Record<ControlState, number> = {
  pending: 0,
  active: 1,
  ended: 2,
  declined: 2,
  expired: 2,
  cancelled: 2,
};

export function isControlState(value: unknown): value is ControlState {
  return typeof value === "string" && value in RANK;
}

export function isLiveControlState(state: ControlState): boolean {
  return state === "pending" || state === "active";
}

export function isTerminalControlState(state: ControlState): boolean {
  return RANK[state] === 2;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** 收进来的任何形状先过一遍：缺关键字段就不收。 */
export function normalizeControlView(raw: unknown): ControlView | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const session_id = str(r.session_id);
  const call_id = str(r.call_id);
  const controller_id = str(r.controller_id);
  const target_id = str(r.target_id);
  if (!session_id || !call_id || !controller_id || !target_id || !isControlState(r.state)) return null;
  return {
    session_id,
    call_id,
    controller_id,
    target_id,
    state: r.state,
    created_at: str(r.created_at) ?? "",
    expires_at: str(r.expires_at) ?? "",
    approved_at: str(r.approved_at),
    ended_at: str(r.ended_at),
    end_reason: str(r.end_reason),
  };
}

export function normalizeControlRequest(raw: unknown): CallControlRequestEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const call_id = str(r.call_id);
  const session_id = str(r.session_id);
  const controller_id = str(r.controller_id);
  if (!call_id || !session_id || !controller_id) return null;
  return {
    type: "call_control_request",
    call_id,
    conversation_id: str(r.conversation_id) ?? "",
    session_id,
    controller_id,
    expires_at: str(r.expires_at) ?? "",
  };
}

function sameView(a: ControlView, b: ControlView): boolean {
  return (
    a.state === b.state &&
    a.call_id === b.call_id &&
    a.controller_id === b.controller_id &&
    a.target_id === b.target_id &&
    a.created_at === b.created_at &&
    a.expires_at === b.expires_at &&
    a.approved_at === b.approved_at &&
    a.ended_at === b.ended_at &&
    a.end_reason === b.end_reason
  );
}

/** 待批准会话的截止时间（毫秒）：优先 expires_at，缺了按 created_at + 90 秒，再缺按首次见到 + 90 秒。 */
export function pendingDeadlineMs(view: { expires_at?: string; created_at?: string }, fallbackStart: number): number {
  const expires = Date.parse(view.expires_at ?? "");
  if (Number.isFinite(expires)) return expires;
  const created = Date.parse(view.created_at ?? "");
  if (Number.isFinite(created)) return created + CONTROL_PENDING_MS;
  return fallbackStart + CONTROL_PENDING_MS;
}

interface Entry {
  view: ControlView;
  seenAt: number;
  firstSeenAt: number;
  local: boolean;
}

interface RequestEntry {
  request: CallControlRequestEvent;
  receivedAt: number;
}

export interface ControlStoreSnapshot {
  version: number;
  /** 新的在前。 */
  sessions: readonly ControlView[];
  requests: readonly CallControlRequestEvent[];
}

export interface ControlTransition {
  previous: ControlView | null;
  next: ControlView;
  /** true = 本端推断（不是服务端说的）。 */
  local: boolean;
}

export interface ControlStore {
  ingest(raw: unknown, options?: { local?: boolean }): ControlTransition | null;
  reconcileCall(callId: string, controls: readonly unknown[] | null | undefined): ControlTransition[];
  addRequest(raw: unknown): boolean;
  removeRequest(sessionId: string): void;
  markLocal(sessionId: string, state: ControlState, reason: string): ControlTransition | null;
  expireOverdue(): ControlTransition[];
  /** 只留这通通话的会话与请求（null = 全清）。 */
  retainCall(callId: string | null): void;
  get(sessionId: string): ControlView | null;
  snapshot(): ControlStoreSnapshot;
  subscribe(listener: () => void): () => void;
  onTransition(listener: (transition: ControlTransition) => void): () => void;
}

export function createControlStore(deps: { now(): number }): ControlStore {
  const entries = new Map<string, Entry>();
  const requests = new Map<string, RequestEntry>();
  const listeners = new Set<() => void>();
  const transitionListeners = new Set<(transition: ControlTransition) => void>();
  let version = 0;
  let cached: ControlStoreSnapshot = { version: 0, sessions: [], requests: [] };

  function rebuild(): void {
    version += 1;
    const sessions = Array.from(entries.values())
      .map((entry) => entry.view)
      .sort((a, b) => (a.created_at === b.created_at ? (a.session_id < b.session_id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1));
    cached = {
      version,
      sessions,
      requests: Array.from(requests.values())
        .sort((a, b) => a.receivedAt - b.receivedAt)
        .map((entry) => entry.request),
    };
    for (const listener of Array.from(listeners)) {
      try {
        listener();
      } catch {
        /* ignore */
      }
    }
  }

  function emitTransition(transition: ControlTransition): void {
    for (const listener of Array.from(transitionListeners)) {
      try {
        listener(transition);
      } catch {
        /* ignore */
      }
    }
  }

  function ingestQuiet(raw: unknown, local: boolean): ControlTransition | null {
    const view = normalizeControlView(raw);
    if (!view) return null;
    const now = deps.now();
    const prev = entries.get(view.session_id);
    if (prev) {
      const rankPrev = RANK[prev.view.state];
      const rankNext = RANK[view.state];
      if (rankNext < rankPrev) return null; // 迟到的旧状态
      if (rankPrev === 2) {
        // 已经终态：只有「本端推断的终态」可以被服务端终态改写
        if (!(prev.local && !local)) return null;
      }
      if (rankNext === rankPrev && rankNext < 2 && sameView(prev.view, view)) {
        prev.seenAt = now;
        return null;
      }
    }
    entries.set(view.session_id, {
      view,
      seenAt: now,
      firstSeenAt: prev?.firstSeenAt ?? now,
      local,
    });
    if (view.state !== "pending") requests.delete(view.session_id);
    return { previous: prev?.view ?? null, next: view, local };
  }

  const store: ControlStore = {
    ingest(raw, options = {}) {
      const transition = ingestQuiet(raw, Boolean(options.local));
      if (transition) {
        rebuild();
        emitTransition(transition);
      }
      return transition;
    },
    reconcileCall(callId, controls) {
      if (!callId || !Array.isArray(controls)) return [];
      const now = deps.now();
      const present = new Set<string>();
      const transitions: ControlTransition[] = [];
      for (const raw of controls) {
        const view = normalizeControlView(raw);
        if (!view || view.call_id !== callId) continue;
        present.add(view.session_id);
        const transition = ingestQuiet(view, false);
        if (transition) transitions.push(transition);
        const entry = entries.get(view.session_id);
        if (entry && isLiveControlState(entry.view.state) && isLiveControlState(view.state)) entry.seenAt = now;
      }
      for (const [sessionId, entry] of Array.from(entries.entries())) {
        if (entry.view.call_id !== callId || present.has(sessionId)) continue;
        if (!isLiveControlState(entry.view.state)) continue;
        if (now - entry.seenAt < CONTROL_RECONCILE_GRACE_MS) continue;
        const transition = ingestQuiet(
          { ...entry.view, state: "ended", end_reason: entry.view.end_reason ?? "gone", ended_at: new Date(now).toISOString() },
          true,
        );
        if (transition) transitions.push(transition);
      }
      if (transitions.length > 0) {
        rebuild();
        for (const transition of transitions) emitTransition(transition);
      }
      return transitions;
    },
    addRequest(raw) {
      const request = normalizeControlRequest(raw);
      if (!request) return false;
      const known = entries.get(request.session_id);
      if (known && known.view.state !== "pending") return false;
      if (requests.has(request.session_id)) return false;
      requests.set(request.session_id, { request, receivedAt: deps.now() });
      rebuild();
      return true;
    },
    removeRequest(sessionId) {
      if (!requests.delete(sessionId)) return;
      rebuild();
    },
    markLocal(sessionId, state, reason) {
      const entry = entries.get(sessionId);
      if (!entry || isTerminalControlState(entry.view.state)) return null;
      return store.ingest(
        { ...entry.view, state, end_reason: reason, ended_at: new Date(deps.now()).toISOString() },
        { local: true },
      );
    },
    expireOverdue() {
      const now = deps.now();
      const transitions: ControlTransition[] = [];
      let changed = false;
      for (const entry of Array.from(entries.values())) {
        if (entry.view.state !== "pending") continue;
        if (now <= pendingDeadlineMs(entry.view, entry.firstSeenAt) + CONTROL_EXPIRY_GRACE_MS) continue;
        const transition = ingestQuiet(
          { ...entry.view, state: "expired", end_reason: "timeout", ended_at: new Date(now).toISOString() },
          true,
        );
        if (transition) transitions.push(transition);
      }
      for (const [sessionId, entry] of Array.from(requests.entries())) {
        if (now > pendingDeadlineMs(entry.request, entry.receivedAt) + CONTROL_EXPIRY_GRACE_MS) {
          requests.delete(sessionId);
          changed = true;
        }
      }
      if (transitions.length > 0 || changed) {
        rebuild();
        for (const transition of transitions) emitTransition(transition);
      }
      return transitions;
    },
    retainCall(callId) {
      let changed = false;
      for (const [sessionId, entry] of Array.from(entries.entries())) {
        if (entry.view.call_id !== callId) {
          entries.delete(sessionId);
          changed = true;
        }
      }
      for (const [sessionId, entry] of Array.from(requests.entries())) {
        if (entry.request.call_id !== callId) {
          requests.delete(sessionId);
          changed = true;
        }
      }
      if (changed) rebuild();
    },
    get(sessionId) {
      return entries.get(sessionId)?.view ?? null;
    },
    snapshot: () => cached,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onTransition(listener) {
      transitionListeners.add(listener);
      return () => {
        transitionListeners.delete(listener);
      };
    },
  };
  return store;
}
