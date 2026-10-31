"use client";

// ============================================================================
// One loading look for a task switch (2026-10-31 W5, operator point 11)
// ----------------------------------------------------------------------------
// Before: clicking a task went 「加载工作会话…」 (HistoryDetail reading the session)
// → the cloud transcript (AgentChat's first task read) → blank + spinner (a
// computer task then resolved to its native chat, whose saved copy was still on
// its way) → the conversation. Three looks from three layers, each hydrating on
// its own.
//
// Now the detail area is wrapped in ONE gate. Every layer that is still
// hydrating reports "not ready" (`useTaskLoadingReport`); while anything is
// pending the gate lays the page-level skeleton (`RoutePageSkeleton`, the
// `/projects` loading look) OVER the children — they stay mounted underneath, so
// they hydrate, lay out and place their scroll position while covered. Once a
// key has been ready the gate never covers it again (later refreshes are silent).
//
// Registration happens in layout effects and is kept in a ref: a child that
// mounts in the same commit the host becomes ready is already counted when the
// gate decides to latch (children's layout effects run before the parent's), so
// the content never flashes for one frame between two loading states.
//
// A nested gate (AgentChat inside HistoryDetail) passes through to the outer one.
// Without an outer gate, `useTaskLoadingReport` is a no-op.
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RoutePageSkeleton } from "./nav-source/route-boundary";
import { cacheUser, onUserScopedClear } from "../lib/user-scoped-cache";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** A stuck read (no answer, no error) must not hide the page forever. */
export const TASK_LOADING_MAX_MS = 10_000;

// Keys that have been ready once in this tab (2026-10-31 task switch speed): the
// gate remounts with the detail area, so its own state forgets; this does not.
// Coming back to a task never shows the cover again (its caches paint at once).
const SEEN_MAX = 300;
const seenGateKeys = new Set<string>();
onUserScopedClear(() => seenGateKeys.clear());
function rememberSeenGateKey(key: string): void {
  // Per signed-in user, like the caches that make a revisit paint at once.
  if (!key || seenGateKeys.has(key) || !cacheUser()) return;
  seenGateKeys.add(key);
  if (seenGateKeys.size > SEEN_MAX) {
    const oldest = seenGateKeys.values().next().value;
    if (oldest !== undefined) seenGateKeys.delete(oldest);
  }
}
/** True once `key` has been shown ready in this tab. */
export function taskLoadingSeen(key: string): boolean {
  return Boolean(key) && seenGateKeys.has(key);
}
/** Test seam. */
export function clearTaskLoadingSeen(): void {
  seenGateKeys.clear();
}

interface TaskLoadingGateApi {
  set: (id: object, ready: boolean) => void;
  remove: (id: object) => void;
}

const TaskLoadingGateContext = createContext<TaskLoadingGateApi | null>(null);

/** Pure decision (tested): cover while the key was never ready and anything is pending. */
export function taskLoadingCovered(input: {
  gateKey: string;
  readyKey: string | null;
  hostReady: boolean;
  reporters: Iterable<boolean>;
}): boolean {
  if (input.readyKey === input.gateKey) return false;
  if (!input.hostReady) return true;
  for (const ready of input.reporters) if (!ready) return true;
  return false;
}

export function TaskLoadingGate({
  gateKey,
  hostReady = true,
  className = "",
  label,
  children,
}: {
  /** What is being opened (the selected task / session). A new key may cover again. */
  gateKey: string;
  /** The host's own read (e.g. HistoryDetail's session/task GET) has settled. */
  hostReady?: boolean;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  const outer = useContext(TaskLoadingGateContext);
  // Nested: report the host part to the outer gate and render through.
  useTaskLoadingReport(hostReady, Boolean(outer));
  if (outer) return <>{children}</>;
  return (
    <OwnTaskLoadingGate gateKey={gateKey} hostReady={hostReady} className={className} label={label}>
      {children}
    </OwnTaskLoadingGate>
  );
}

function OwnTaskLoadingGate({
  gateKey,
  hostReady,
  className,
  label,
  children,
}: {
  gateKey: string;
  hostReady: boolean;
  className: string;
  label?: string;
  children: ReactNode;
}) {
  const reportersRef = useRef(new Map<object, boolean>());
  const [, bump] = useState(0);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [expiredKey, setExpiredKey] = useState<string | null>(null);
  const api = useMemo<TaskLoadingGateApi>(() => ({
    set(id, ready) {
      if (reportersRef.current.get(id) === ready) return;
      reportersRef.current.set(id, ready);
      bump((n) => n + 1);
    },
    remove(id) {
      if (!reportersRef.current.delete(id)) return;
      bump((n) => n + 1);
    },
  }), []);
  const covered = useCallback(() => taskLoadingCovered({
    gateKey,
    readyKey: expiredKey === gateKey || taskLoadingSeen(gateKey) ? gateKey : readyKey,
    hostReady,
    reporters: reportersRef.current.values(),
  }), [gateKey, readyKey, expiredKey, hostReady]);
  const cover = covered();
  // Every commit: once nothing is pending for this key, latch it (never covered again).
  useIsoLayoutEffect(() => {
    if (readyKey !== gateKey && !covered()) {
      rememberSeenGateKey(gateKey);
      setReadyKey(gateKey);
    }
  });
  useEffect(() => {
    if (!cover) return;
    const timer = setTimeout(() => setExpiredKey(gateKey), TASK_LOADING_MAX_MS);
    return () => clearTimeout(timer);
  }, [cover, gateKey]);
  return (
    <TaskLoadingGateContext.Provider value={api}>
      <div className={`relative min-h-0 ${className}`} data-task-loading-gate={cover ? "loading" : "ready"}>
        {children}
        {cover && (
          <div className="absolute inset-0 z-30 overflow-hidden bg-white" data-task-loading-cover="">
            <RoutePageSkeleton variant="list" label={label} />
          </div>
        )}
      </div>
    </TaskLoadingGateContext.Provider>
  );
}

/**
 * A layer still hydrating says so. `enabled=false` (e.g. a hidden pane) drops the
 * report. No gate above → no-op.
 */
export function useTaskLoadingReport(ready: boolean, enabled = true): void {
  const gate = useContext(TaskLoadingGateContext);
  const idRef = useRef<object | null>(null);
  if (!idRef.current) idRef.current = {};
  const id = idRef.current;
  useIsoLayoutEffect(() => {
    if (!gate) return;
    if (enabled) gate.set(id, ready);
    else gate.remove(id);
  }, [gate, id, ready, enabled]);
  useIsoLayoutEffect(() => () => gate?.remove(id), [gate, id]);
}
