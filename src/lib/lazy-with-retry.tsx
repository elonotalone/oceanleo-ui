"use client";

// Dynamic imports keep their promise pending through download failures. Recover while visible
// and online, probe/cache-refresh failed URLs, report telemetry, and reload a stale deployment once.
// Import literals and next/dynamic calls stay at the call site so code splitting stays intact.

import { createElement, useCallback, useSyncExternalStore, lazy, type ComponentType } from "react";

import { waitForRecovery } from "./auto-recovery";
export { startAutoRecovery, useAutoRecovery } from "./auto-recovery";

import {
  reportChunkFailure,
  reportChunkRecovered,
  reportChunkRetry,
  type ChunkFailureKind,
} from "./telemetry/errors";

/**
 * 退避档位。**不是裸时长**：这是网络重试预算，不是动效时长，
 * 与 `motion-system.md` 的 token 无关（红线 9 管的是动效）。
 * 三档 0.5s / 1.5s / 4s，配 equal jitter 之后实际落在
 * 0.25–0.5s / 0.75–1.5s / 2–4s。
 */
export const CHUNK_RETRY_DELAYS_MS: readonly number[] = [500, 1500, 4000];

export const CHUNK_CACHE_BUST_PARAM = "__leoChunkRetry";

// ----------------------------------------------------------------------------
// 错误识别
// ----------------------------------------------------------------------------

const CHUNK_ERROR_SIGNATURES =
  /Loading (?:CSS )?chunk \S+ failed|Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i;

export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "ChunkLoadError") return true;
  return CHUNK_ERROR_SIGNATURES.test(error.message);
}

const URL_IN_MESSAGE = /https?:\/\/[^\s)"']+/;

/**
 * 从错误里抠出那个 chunk 的 URL。webpack 5 会挂 `error.request`；
 * 原生 ESM / Turbopack 只把 URL 写进消息里。两条都认。
 */
export function chunkUrlFromError(error: unknown): string | null {
  const request = (error as { request?: unknown } | null)?.request;
  if (typeof request === "string" && request) return request;
  if (!(error instanceof Error)) return null;
  return URL_IN_MESSAGE.exec(error.message)?.[0] ?? null;
}

/** 探不到 URL 时的兜底判定：消息里明写了 404/410 就当换版了。 */
function messageLooksStale(error: unknown): boolean {
  return error instanceof Error && /\b(?:404|410)\b/.test(error.message);
}

// ----------------------------------------------------------------------------
// cache-busting
// ----------------------------------------------------------------------------

export function withCacheBust(url: string, token: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${CHUNK_CACHE_BUST_PARAM}=${encodeURIComponent(token)}`;
}

export interface ChunkProbe {
  /** HTTP 状态码；连接都没建起来时为 `null`。 */
  readonly status: number | null;
  readonly ok: boolean;
  /** 这次探测有没有真的带上 cache-busting 参数。遥测要记。 */
  readonly cacheBusted: boolean;
}

/**
 * 把文档里那条已经失败的 `<script>` / `<link>` 摘掉。
 * 留着它，浏览器与 webpack 都可能认为「这个资源已经在处理中」而不再发起请求。
 */
function dropStaleChunkTags(url: string): void {
  if (typeof document === "undefined") return;
  const base = url.split("?")[0];
  const nodes = document.querySelectorAll("script[src], link[href]");
  for (const node of Array.from(nodes)) {
    const value = node.getAttribute("src") ?? node.getAttribute("href") ?? "";
    if (value.split("?")[0] === base) node.remove();
  }
}

async function defaultProbe(url: string, token: string): Promise<ChunkProbe> {
  if (typeof fetch !== "function") {
    return { status: null, ok: false, cacheBusted: false };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(withCacheBust(url, token), {
      signal: controller.signal,
      cache: "reload",
      credentials: "same-origin",
    });
    if (response.ok) {
      // 见文件头②：只有这一次打的是 webpack 待会儿真正请求的那把缓存键。
      await fetch(url, { cache: "reload", credentials: "same-origin", signal: controller.signal }).catch(() => {});
    }
    return { status: response.status, ok: response.ok, cacheBusted: true };
  } catch {
    return { status: null, ok: false, cacheBusted: true };
  } finally { clearTimeout(timer); }
}

// ----------------------------------------------------------------------------
// 重试循环
// ----------------------------------------------------------------------------

export interface ChunkRetryRuntime {
  sleep(ms: number): Promise<void>;
  random(): number;
  probe(url: string, token: string): Promise<ChunkProbe>;
  delays: readonly number[];
}

/**
 * cache-busting token 的单调序号。
 *
 * 只靠 `Date.now()` + 随机数是不够的：退避很短或时钟精度不足时，两次重试可能落在
 * **同一毫秒**，token 于是相同，缓存键没换 —— cache-busting 就白做了，
 * 而这正是它要解决的那个问题（坏缓存被反复命中）。序号让同进程内不可能撞。
 */
let cacheBustSeq = 0;

const DEFAULT_RUNTIME: ChunkRetryRuntime = {
  sleep: waitForRecovery,
  random: Math.random,
  probe: defaultProbe,
  delays: CHUNK_RETRY_DELAYS_MS,
};

/**
 * equal jitter：一半固定、一半随机。
 * 全随机会退化出「几乎立刻重试」，完全不抖则所有客户端在同一毫秒一起回来（惊群）。
 */
export function jitteredDelay(base: number, random: () => number): number {
  return Math.round(base / 2 + random() * (base / 2));
}

export type ChunkLoadOutcome<T> =
  | { readonly ok: true; readonly value: T; readonly attempts: number }
  | {
      readonly ok: false;
      readonly kind: ChunkFailureKind;
      readonly attempts: number;
      readonly error: unknown;
    };

/**
 * 退避重试一个动态 import。**不抛**——结局全部走返回值。
 *
 * 一次首发 + `delays.length` 次重试。遇到 404/410 立刻停：
 * 部署换版之后旧 chunk 名就不存在了，再退避也变不出这个文件，
 * stale-version is handled by the caller with one guarded automatic reload.
 */
export async function loadChunkWithRetry<T>(
  routeId: string,
  load: () => Promise<T>,
  overrides: Partial<ChunkRetryRuntime> = {},
): Promise<ChunkLoadOutcome<T>> {
  const runtime: ChunkRetryRuntime = { ...DEFAULT_RUNTIME, ...overrides };
  let attempts = 0;
  let lastError: unknown = null;
  let kind: ChunkFailureKind = "network";

  for (let index = 0; index <= runtime.delays.length; index += 1) {
    attempts += 1;
    try {
      const value = await load();
      if (attempts > 1) reportChunkRecovered({ routeId, attempts });
      return { ok: true, value, attempts };
    } catch (error) {
      lastError = error;
      let cacheBusted = false;
      const url = chunkUrlFromError(error);
      if (url) {
        dropStaleChunkTags(url);
        cacheBustSeq += 1;
        const token = `${Date.now().toString(36)}-${cacheBustSeq.toString(36)}-${Math.floor(
          runtime.random() * 0xffffff,
        ).toString(36)}`;
        const probe = await runtime.probe(url, token);
        cacheBusted = probe.cacheBusted;
        if (probe.status === 404 || probe.status === 410) {
          kind = "stale-version";
          break;
        }
      } else if (messageLooksStale(error)) {
        kind = "stale-version";
        break;
      }
      if (index === runtime.delays.length) break;
      const delayMs = jitteredDelay(runtime.delays[index], runtime.random);
      reportChunkRetry({ routeId, attempt: index + 1, delayMs, cacheBusted, error });
      await runtime.sleep(delayMs);
    }
  }

  reportChunkFailure({ routeId, attempts, kind, error: lastError });
  return { ok: false, kind, attempts, error: lastError };
}

// ----------------------------------------------------------------------------
// 每条路由的加载态 store
// ----------------------------------------------------------------------------

export type ChunkPhase = "loading" | "network-error" | "stale-version";

export interface ChunkRouteState {
  readonly phase: ChunkPhase;
  /** 已经试过几次（含首发）。 */
  readonly attempts: number;
}

const INITIAL_STATE: ChunkRouteState = Object.freeze({ phase: "loading", attempts: 0 });

const routeStates = new Map<string, ChunkRouteState>();
const routeListeners = new Map<string, Set<() => void>>();

export function chunkRouteState(routeId: string): ChunkRouteState {
  return routeStates.get(routeId) ?? INITIAL_STATE;
}

function setRouteState(routeId: string, next: ChunkRouteState): void {
  const current = chunkRouteState(routeId);
  if (current.phase === next.phase && current.attempts === next.attempts) return;
  routeStates.set(routeId, Object.freeze(next));
  for (const listener of routeListeners.get(routeId) ?? []) listener();
}

function subscribeRoute(routeId: string, listener: () => void): () => void {
  let set = routeListeners.get(routeId);
  if (!set) {
    set = new Set();
    routeListeners.set(routeId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

/** 测试与 `W10` 的闸用。 */
export function resetChunkRoutes(): void {
  routeStates.clear();
  routeListeners.clear();
}

export function useChunkRouteState(routeId: string): ChunkRouteState {
  const subscribe = useCallback(
    (listener: () => void) => subscribeRoute(routeId, listener),
    [routeId],
  );
  const snapshot = useCallback(() => chunkRouteState(routeId), [routeId]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// ----------------------------------------------------------------------------
// React 层
// ----------------------------------------------------------------------------

export interface ChunkErrorProps {
  kind: ChunkFailureKind;
  attempts: number;
  /** 「重试」：再走一遍退避循环。 */
  onRetry: () => void;
  /** 「刷新」：换版之后唯一正确的动作。 */
  onReload: () => void;
}

function reloadPage(): void {
  if (typeof window !== "undefined") window.location.reload();
}

/**
 * loader: automatic visible/online recovery; never rejects a module download.
 * 永远不 reject，所以 `React.lazy` 不会被钉死在 Rejected。
 *
 * 交给 `dynamic()` 的就是它。**`dynamic()` 的调用留在调用方**
 * （`AdvancedContentWorkbench.tsx`），不搬进这一层：那里的
 * `import("./advanced-routes/XxxRoute")` 字面量是 webpack 切 chunk 的依据，
 * 而 `{ ssr: false, loading }` 也该留在看得见路由的地方。
 */
export function chunkRetryLoader<T>(
  routeId: string,
  load: () => Promise<T>,
  overrides: Partial<ChunkRetryRuntime> = {},
): () => Promise<T> {
  return async () => {
    for (;;) {
      setRouteState(routeId, INITIAL_STATE);
      const outcome = await loadChunkWithRetry(routeId, async () => {
        try { return { value: await load() }; }
        catch (error) {
          if (!isChunkLoadError(error)) return { error };
          throw error;
        }
      }, overrides);
      if (outcome.ok) {
        setRouteState(routeId, { phase: "loading", attempts: outcome.attempts });
        if ("error" in outcome.value) throw outcome.value.error;
        return outcome.value.value as T;
      }
      setRouteState(routeId, { phase: "loading", attempts: outcome.attempts });
      if (outcome.kind === "stale-version") reloadChunkOnce();
      await (overrides.sleep ?? waitForRecovery)(30_000);
    }
  };
}

export const CHUNK_RELOAD_STORAGE_KEY = "leo:chunk-load-reload";

export interface ChunkReloadRuntime {
  sleep(ms: number): Promise<void>;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  reload?: () => void;
}

function defaultSessionStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

/** Persist the marker across all imports: an unrelated successful chunk must not re-arm reload. */
export function reloadChunkOnce(overrides: Partial<ChunkReloadRuntime> = {}): boolean {
  const storage = overrides.storage !== undefined ? overrides.storage : defaultSessionStorage();
  try {
    // Without storage a document reload cannot be guarded across documents.
    if (!storage || storage.getItem(CHUNK_RELOAD_STORAGE_KEY) === "1") return false;
    storage.setItem(CHUNK_RELOAD_STORAGE_KEY, "1");
    (overrides.reload ?? reloadPage)();
    return true;
  } catch { return false; }
}

export async function importWithChunkReload<T>(
  load: () => Promise<T>,
  overrides: Partial<ChunkReloadRuntime> = {},
): Promise<T> {
  for (;;) {
    // Only module-download failures are recoverable imports. Programming errors still reach a boundary.
    const outcome = await loadChunkWithRetry("shell-import", async () => {
      try { return { value: await load() }; }
      catch (error) {
        if (!isChunkLoadError(error)) return { error };
        throw error;
      }
    }, { ...(overrides.sleep ? { sleep: overrides.sleep } : {}) });
    if (outcome.ok) {
      if ("error" in outcome.value) throw outcome.value.error;
      return outcome.value.value as T;
    }
    if (outcome.kind === "stale-version") reloadChunkOnce(overrides);
    await (overrides.sleep ?? waitForRecovery)(30_000);
  }
}

/** React.lazy never sees a rejected download promise, so existing Suspense content can remain mounted. */
export function lazyWithRetry<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => importWithChunkReload(load));
}

/** Preserve the same editor component while its automatic import loop is pending. */
export function withChunkRetry<P extends object>(
  routeId: string,
  Dynamic: ComponentType<P>,
  _Failure: ComponentType<ChunkErrorProps>,
): ComponentType<P> {
  function ChunkRetryGate(props: P) {
    // Keep the same dynamic component mounted while its pending loader recovers.
    useChunkRouteState(routeId);
    return createElement(Dynamic, props);
  }
  ChunkRetryGate.displayName = `ChunkRetryGate(${routeId})`;
  return ChunkRetryGate;
}
