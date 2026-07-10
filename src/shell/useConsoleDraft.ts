"use client";

// ============================================================================
// @oceanleo/ui — useConsoleDraft：工作会话优先的操作台自动恢复 + 自动保存
// ----------------------------------------------------------------------------
// doctrine 2026-07-09（操作员拍板：默认自动恢复上次草稿）。站点在成品 app 的操作台
// 页里调它一行，即获得：
//   ① 有 AppSession 时恢复版本化 snapshot；旧后端/未登录才回退每-app 本地草稿。
//   ② 用户改动后 debounce 保存；首次有效改动才建立 session，不因 mount 制造空历史。
//   ③ restart() 归档真实 session，成功后才清草稿并复位。
//
// 关键设计（避免存/取回环）：
//   - 恢复只在「首次拿到某 app 的草稿」时做一次（perApp ready ref 把关）。
//   - 保存跳过「恢复动作本身触发的那次 state 变化」（justRestoredRef）。
//   - appId 变化（切成品）时重置 ready 标记，重新走一次恢复。
//
// 用法（站点）：
//   const { restart } = useConsoleDraft({
//     siteId: "word", appId: currentAppId,
//     state: write, setState: setWrite, initialState: writeInitialState,
//   });
//   // 「重新开始」按钮 onClick={restart}
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadConsoleDraft,
  saveConsoleDraft,
  clearConsoleDraft,
} from "../lib/console-draft";
import {
  useOptionalWorkspaceSession,
  type WorkspaceSessionConflict,
} from "./WorkspaceSession";

export interface UseConsoleDraftArgs<S extends Record<string, unknown>> {
  /** 本站 site_id。 */
  siteId: string;
  /** 当前成品 app id（切成品会重新恢复）。空 → Hook 不做任何事。 */
  appId: string;
  /** 当前操作台 state（受站点管理）。 */
  state: S;
  /** 写回操作台 state（恢复草稿时调用）。 */
  setState: (s: S) => void;
  /** 该成品操作台的初值（restart 复位到它；也用于判断「是否值得存」）。 */
  initialState: S;
  /** 关闭自动保存/恢复（极少数不需要续编的成品）。默认开启。 */
  enabled?: boolean;
  /** debounce 保存间隔（ms）。默认 600。 */
  debounceMs?: number;
  /** 当前站点 snapshot schema 版本。默认 1。 */
  schemaVersion?: number;
  /** 旧版本 snapshot → 当前 state。未提供时不拿不兼容快照冒充当前状态。 */
  migrateSnapshot?: (snapshot: unknown, fromVersion: number) => S;
  /** 首次无 session 时判断 state 是否已构成“有意义动作”。默认与 initialState 深比较。 */
  isMeaningful?: (state: S, initialState: S) => boolean;
  /** 首次保存时给 session 的标题。 */
  sessionTitle?: string;
}

export interface UseConsoleDraftReturn {
  /** 清空本 app 草稿并把 state 复位到初值（「重新开始」）。 */
  restart: () => void;
  /** 可等待且可判断归档是否成功的 restart；失败时不会清空本地操作台。 */
  restartAsync: () => Promise<boolean>;
  /** 立即保存（不等 debounce）——如离开前想确保落盘。 */
  flush: () => void;
  /** 当前真实服务端 session；降级草稿不会伪造该值。 */
  sessionId: string | null;
  /** revision 冲突（已重新读取 latest，但没有静默覆盖本地 state）。 */
  conflict: WorkspaceSessionConflict | null;
  /** 用户完成合并/确认后显式解除冲突锁，之后的保存才会继续。 */
  clearConflict: () => void;
  /** 快照版本不兼容 / 迁移失败等恢复错误。 */
  restoreError: string | null;
}

function statesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function useConsoleDraft<S extends Record<string, unknown>>({
  siteId,
  appId,
  state,
  setState,
  initialState,
  enabled = true,
  debounceMs = 600,
  schemaVersion = 1,
  migrateSnapshot,
  isMeaningful,
  sessionTitle,
}: UseConsoleDraftArgs<S>): UseConsoleDraftReturn {
  const workspaceValue = useOptionalWorkspaceSession();
  const workspace =
    workspaceValue &&
    workspaceValue.siteId === siteId &&
    workspaceValue.appId === appId
      ? workspaceValue
      : null;

  const initialRef = useRef(initialState);
  initialRef.current = initialState;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const migrateRef = useRef(migrateSnapshot);
  migrateRef.current = migrateSnapshot;
  const meaningfulRef = useRef(isMeaningful);
  meaningfulRef.current = isMeaningful;
  const titleRef = useRef(sessionTitle);
  titleRef.current = sessionTitle;
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restartEpoch, setRestartEpoch] = useState(0);
  const restartingRef = useRef(false);

  // 每个 app 是否已完成「首次恢复」——防止恢复动作把 state 改了又被当成用户改动存回去，
  // 也防止对同一 app 反复恢复。切 app（appId 变）时复位。
  const readyRef = useRef<string>("");
  // 恢复动作刚写回 state 的那一拍：跳过它触发的保存。
  const justRestoredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionScopeRef = useRef("");
  const dirtyVersionRef = useRef(0);
  const persistedVersionRef = useRef(0);
  const persistPromiseRef = useRef<{
    key: string;
    promise: Promise<void>;
  } | null>(null);
  const pendingStateRef = useRef<{
    key: string;
    state: S;
    workspace: typeof workspace;
  } | null>(null);

  const sessionId = workspace?.session?.id ?? workspace?.sessionId ?? null;
  const key =
    enabled && siteId && appId
      ? `${siteId}:${appId}:${sessionId || "no-session"}`
      : "";

  // ── ① 进入某 app：恢复上次草稿（只一次）───────────────────────────────────
  useEffect(() => {
    if (!key) return;
    if (restartingRef.current) return;
    // Provider 正在只读查最近活跃会话时先等它，避免先恢复“每 app 旧草稿”再闪成 session。
    if (workspace && workspace.availability === "loading") return;
    let alive = true;
    // appId / sessionId 变了 → 允许对新作用域恢复一次。
    if (readyRef.current === key) return;
    if (versionScopeRef.current !== key) {
      versionScopeRef.current = key;
      dirtyVersionRef.current = 0;
      persistedVersionRef.current = 0;
      pendingStateRef.current = null;
    }
    void (async () => {
      setRestoreError(null);

      // 服务端 session snapshot 是单一事实源。历史模式尤其不能拿“当前 app 草稿”冒充旧状态。
      const active = workspace?.session;
      if (active) {
        const raw = active.snapshot;
        if (raw !== undefined && raw !== null) {
          try {
            const fromVersion = active.schema_version || 1;
            const restored =
              fromVersion === schemaVersion
                ? (raw as S)
                : migrateRef.current
                  ? migrateRef.current(raw, fromVersion)
                  : null;
            if (!restored || typeof restored !== "object" || Array.isArray(restored)) {
              if (fromVersion !== schemaVersion && !migrateRef.current) {
                setRestoreError(
                  `快照版本 ${fromVersion} 与当前版本 ${schemaVersion} 不兼容。`,
                );
              } else {
                setRestoreError("工作会话快照格式无效，未自动恢复。");
              }
            } else {
              justRestoredRef.current = true;
              // snapshot 是完整 state，但旧版本/agent-only session 可能只有部分字段或 {}。
              // 以当前初值补齐缺省键，避免把表单恢复成缺字段对象。
              setState({ ...initialRef.current, ...restored });
            }
          } catch {
            setRestoreError("工作会话快照迁移失败，未覆盖当前操作台。");
          }
        }
        readyRef.current = key;
        return;
      }

      // history 没有 snapshot 就必须明确空缺，禁止回退到当前 app 的覆盖式草稿。
      if (workspace?.mode === "history") {
        readyRef.current = key;
        return;
      }

      // 未登录 / 旧后端 / 尚无真实 session：保持原每-app 草稿能力，但它不会进入历史列表。
      const draft = await loadConsoleDraft(siteId, appId);
      if (!alive) return;
      readyRef.current = key;
      if (draft && draft.state && typeof draft.state === "object") {
        justRestoredRef.current = true;
        setState({ ...initialRef.current, ...(draft.state as S) });
      }
    })();
    return () => {
      alive = false;
    };
    // session 从 loading → ready 时也要继续；同一 key 一旦 ready 就不会反复恢复。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    key,
    workspace?.availability,
    workspace?.session?.id,
    workspace?.mode,
    schemaVersion,
    restartEpoch,
  ]);

  const persist = useCallback((): Promise<void> => {
    if (persistPromiseRef.current?.key === key) {
      return persistPromiseRef.current.promise;
    }
    const operation = (async () => {
      // 保存期间若 state 又变了，继续循环保存最新版；Provider 内部 mutation queue 负责
      // revision 串行化。失败/冲突则停下，绝不 while 重试打爆网关。
      while (key && readyRef.current === key) {
        const targetVersion = dirtyVersionRef.current;
        if (targetVersion <= persistedVersionRef.current) return;

        const pendingState = pendingStateRef.current;
        if (!pendingState || pendingState.key !== key) return;
        const currentState = pendingState.state;

        // 使用“发生这次改动时”的 Provider，而不是当前 render 的 Provider；切 app 的
        // cleanup 可能发生在 workspaceRef 已指向新 app 之后。
        const currentWorkspace = pendingState.workspace;
        if (currentWorkspace?.availability === "loading") return;
        let persisted = false;

        if (currentWorkspace) {
          if (currentWorkspace.readOnly) {
            // 历史/归档只读是终态，不能回退写 localStorage 后伪装保存成功。
            persisted = true;
          } else {
            // 尚无 session 时，初值本身不应制造一条空历史；首次非空改动才 ensure。
            const meaningful = meaningfulRef.current
              ? meaningfulRef.current(currentState, initialRef.current)
              : !statesEqual(currentState, initialRef.current);
            if (!currentWorkspace.sessionId && !meaningful) {
              persisted = true;
            } else {
              const result = await currentWorkspace.saveSnapshot(
                currentState,
                schemaVersion,
                {
                  title: titleRef.current,
                  expectedSessionId: currentWorkspace.session?.id,
                },
              );
              if (
                result.ok ||
                result.conflict ||
                result.readOnly ||
                result.stale
              ) {
                persisted = true;
              } else if (
                result.unavailable &&
                currentWorkspace.mode !== "history"
              ) {
                await saveConsoleDraft(siteId, appId, currentState);
                persisted = true;
              } else {
                // 普通服务端错误不双写，避免云端/localStorage 来源分叉。
                return;
              }
            }
          }
        } else {
          await saveConsoleDraft(siteId, appId, currentState);
          persisted = true;
        }

        if (!persisted) return;
        persistedVersionRef.current = Math.max(
          persistedVersionRef.current,
          targetVersion,
        );
        if (dirtyVersionRef.current <= persistedVersionRef.current) {
          pendingStateRef.current = null;
        }
      }
    })();
    persistPromiseRef.current = { key, promise: operation };
    const clearPersistPromise = () => {
      if (persistPromiseRef.current?.promise === operation) {
        persistPromiseRef.current = null;
      }
    };
    void operation.then(clearPersistPromise, clearPersistPromise);
    return operation;
  }, [key, siteId, appId, schemaVersion]);

  // ── ② 操作台改动：debounce 自动保存 ──────────────────────────────────────
  useEffect(() => {
    if (!key) return;
    // 还没完成首次恢复：不存（避免用初值覆盖掉云端草稿）。
    if (readyRef.current !== key) return;
    // 恢复动作触发的这次变化：跳过（不是用户改的）。
    if (justRestoredRef.current) {
      justRestoredRef.current = false;
      return;
    }
    let pendingState: S;
    try {
      pendingState = JSON.parse(JSON.stringify(state)) as S;
    } catch {
      setRestoreError("当前操作台状态无法序列化，未保存工作会话。");
      return;
    }
    dirtyVersionRef.current += 1;
    pendingStateRef.current = { key, state: pendingState, workspace };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void persist();
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // state 变化即安排一次保存；pendingStateRef 固化该 app 的快照，避免切 app 的 effect
    // cleanup 把新 app state 写进旧 session。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, key, debounceMs, persist]);

  const flush = useCallback(() => {
    if (!key) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    void persist();
  }, [key, persist]);

  // debounce cleanup 本身会丢掉最后一次输入；刷新、切后台、路由卸载时统一 flush。底层
  // AppSession PUT 对小快照启用 keepalive，且 expectedSessionId 防止 restart 后旧 flush
  // 创建/覆盖另一条 session。
  useEffect(() => {
    const flushPending = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      void persist();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushPending();
    };
    window.addEventListener("pagehide", flushPending);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushPending);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      flushPending();
    };
  }, [key, persist]);

  const restartAsync = useCallback(async (): Promise<boolean> => {
    if (!siteId || !appId) {
      setState(initialState);
      return true;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    restartingRef.current = true;
    let resetDone = false;
    try {
      const currentWorkspace = workspaceRef.current;
      if (currentWorkspace) {
        const archived = await currentWorkspace.restart();
        if (!archived) return false;
      }
      await clearConsoleDraft(siteId, appId);
      readyRef.current = "";
      justRestoredRef.current = false;
      versionScopeRef.current = "";
      dirtyVersionRef.current = 0;
      persistedVersionRef.current = 0;
      pendingStateRef.current = null;
      setState(initialState);
      resetDone = true;
      return true;
    } finally {
      restartingRef.current = false;
      if (resetDone) setRestartEpoch((value) => value + 1);
    }
  }, [siteId, appId, initialState, setState]);
  const restart = useCallback(() => {
    void restartAsync();
  }, [restartAsync]);

  return {
    restart,
    restartAsync,
    flush,
    sessionId,
    conflict: workspace?.conflict ?? null,
    clearConflict: workspace?.clearConflict ?? (() => {}),
    restoreError,
  };
}
