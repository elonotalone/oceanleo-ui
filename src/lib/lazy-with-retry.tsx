"use client";

// ============================================================================
// 懒加载路由的重试层 —— 退避 + 抖动 + cache-busting + 可重试的失败态
// ----------------------------------------------------------------------------
// 这一份对应操作员亲眼看到的那片红：
//
//     …Model3DRoute_tsx_….js:1
//     Failed to load resource: net::ERR_SSL_VERSION_OR_CIPHER_MISMATCH
//
// 在此之前，`AdvancedContentWorkbench` 的 11 条编辑器路由全是
// `dynamic(…, { ssr: false, loading: WorkbenchRouteLoading })`，chunk 一挂
// **没有任何处理**：用户看到的是一个永远转下去的 spinner。
//
// ----------------------------------------------------------------------------
// 为什么失败态能重试（这一层最不显然的地方）
//
// `next/dynamic` 底下是 `React.lazy`，而 `React.lazy` 把 loader 的 promise
// **记忆化**了：一旦 reject，那个 lazy 对象就永久停在 Rejected，重新挂载也不会
// 再跑一次 loader。所以「重试按钮」不可能建立在「让 loader 抛出去」之上。
//
// 这里的做法是让 loader 的 promise **一直活着**：退避重试耗尽之后不 reject，
// 而是把失败态发布到一个模块级 store，然后 `await` 一个「用户点了重试」的信号；
// 信号来了就继续循环。外面的 gate 组件订阅这个 store，失败时渲染失败态而不是
// `<Dynamic>`。于是：
//   · chunk 分割不变     —— `import()` 字面量还在调用点，webpack 照常切 chunk；
//   · `next/dynamic` 不变 —— 真的只是包了一层，ssr:false / loading 都照旧；
//   · 重试真的能重试     —— promise 没死，循环还在。
//
// 这一层是两个拼件，`dynamic()` 的调用夹在中间、留在调用方：
//
//     const Dynamic = dynamic(chunkRetryLoader(id, () => import("…")), { ssr:false, loading });
//     export const Route = withChunkRetry(id, Dynamic, WorkbenchRouteChunkError);
//
// 这么切是刻意的：`src/lib` 不许 import `src/shell`，而失败态的长相属于 shell；
// 同时 `import()` 字面量与 `{ ssr:false, loading }` 都留在看得见 11 条路由的地方。
//
// ----------------------------------------------------------------------------
// cache-busting 到底 bust 了什么（承诺的边界，别高估）
//
// SSL/网络失败常常伴随**坏缓存**：不换缓存键，重试会一次次命中同一个坏响应。
// 这里做两件事，各有各的用处：
//   ① 带 `?__leoChunkRetry=<token>` 去探一次 —— 换了缓存键，中间层那条坏记录
//      绕过去了，于是我们**问得到真相**：404/410 就是换版了（重试再多次也没用，
//      正确动作是刷新页面），网络错误才是可重试的。
//   ② 对**裸 URL** 再发一次 `cache: "reload"` —— webpack 待会儿真正会去请求的是
//      裸 URL，只有这一次能把浏览器缓存里那条坏记录换掉。加了查询参数的那次落在
//      另一个缓存键上，救不了它。
//
// **做不到的**：如果坏的是共享 CDN 边缘节点上那个裸 URL 的对象，②拿回来的可能
// 还是它。要根治得在部署期换 URL，那不在本波范围内。这条边界写进交付说明。
// ============================================================================

import { createElement, useCallback, useSyncExternalStore, type ComponentType } from "react";

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
  /Loading chunk \S+ failed|Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i;

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
  try {
    const response = await fetch(withCacheBust(url, token), {
      cache: "reload",
      credentials: "same-origin",
    });
    if (response.ok) {
      // 见文件头②：只有这一次打的是 webpack 待会儿真正请求的那把缓存键。
      await fetch(url, { cache: "reload", credentials: "same-origin" }).catch(() => {});
    }
    return { status: response.status, ok: response.ok, cacheBusted: true };
  } catch {
    return { status: null, ok: false, cacheBusted: true };
  }
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
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
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
 * 正确动作是让用户刷新页面。
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
const pendingManualRetry = new Map<string, () => void>();

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

/** 用户点了「重试」。没有等待中的循环就什么都不做。 */
export function requestChunkRetry(routeId: string): void {
  const resume = pendingManualRetry.get(routeId);
  if (!resume) return;
  pendingManualRetry.delete(routeId);
  setRouteState(routeId, INITIAL_STATE);
  resume();
}

/** 测试与 `W10` 的闸用。 */
export function resetChunkRoutes(): void {
  routeStates.clear();
  routeListeners.clear();
  pendingManualRetry.clear();
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
 * loader：退避重试 → 失败就发布状态并等人点重试 → 点了就再来一轮。
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
      const outcome = await loadChunkWithRetry(routeId, load, overrides);
      if (outcome.ok) {
        setRouteState(routeId, { phase: "loading", attempts: outcome.attempts });
        return outcome.value;
      }
      setRouteState(routeId, {
        phase: outcome.kind === "stale-version" ? "stale-version" : "network-error",
        attempts: outcome.attempts,
      });
      await new Promise<void>((resolve) => pendingManualRetry.set(routeId, resolve));
    }
  };
}

/**
 * 给一个已经 `dynamic()` 出来的路由组件套上失败态的闸。
 *
 * `Dynamic` 还在加载（或已成功）时原样渲染它；退避重试耗尽之后渲染 `Failure`，
 * 并把「重试」接回还在 `await` 的那个 loader 循环。
 *
 * 这一层刻意**不自己调 `dynamic()`**：调用留在
 * `AdvancedContentWorkbench.tsx`，那里的 `import("./advanced-routes/XxxRoute")`
 * 字面量是 webpack 切 chunk 的唯一依据，搬到这儿会让 11 条路由退回单块打包
 * （`01-verified-facts.md` §1.7 记的那一轮代码分割会白做）。
 */
export function withChunkRetry<P extends object>(
  routeId: string,
  Dynamic: ComponentType<P>,
  Failure: ComponentType<ChunkErrorProps>,
): ComponentType<P> {
  function ChunkRetryGate(props: P) {
    const state = useChunkRouteState(routeId);
    if (state.phase === "loading") return createElement(Dynamic, props);
    return createElement(Failure, {
      kind: state.phase === "stale-version" ? "stale-version" : "network",
      attempts: state.attempts,
      onRetry: () => requestChunkRetry(routeId),
      onReload: reloadPage,
    });
  }
  ChunkRetryGate.displayName = `ChunkRetryGate(${routeId})`;
  return ChunkRetryGate;
}
