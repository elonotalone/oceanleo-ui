"use client";

// ============================================================================
// @oceanleo/ui — useConsoleDraft：操作台草稿「自动恢复 + 自动保存」Hook（单一事实源）
// ----------------------------------------------------------------------------
// doctrine 2026-07-09（操作员拍板：默认自动恢复上次草稿）。站点在成品 app 的操作台
// 页里调它一行，即获得：
//   ① 进入某成品 app 时，若有上次草稿 → 自动恢复到那份 state（否则保持站点给的初值）。
//   ② 用户在操作台改动 → debounce 后自动保存该成品的最新 state（每 app 覆盖式一份）。
//   ③ restart() → 清空草稿并把 state 复位到初值（供「重新开始」按钮）。
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

import { useCallback, useEffect, useRef } from "react";
import {
  loadConsoleDraft,
  saveConsoleDraft,
  clearConsoleDraft,
} from "../lib/console-draft";

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
}

export interface UseConsoleDraftReturn {
  /** 清空本 app 草稿并把 state 复位到初值（「重新开始」）。 */
  restart: () => void;
  /** 立即保存（不等 debounce）——如离开前想确保落盘。 */
  flush: () => void;
}

export function useConsoleDraft<S extends Record<string, unknown>>({
  siteId,
  appId,
  state,
  setState,
  initialState,
  enabled = true,
  debounceMs = 600,
}: UseConsoleDraftArgs<S>): UseConsoleDraftReturn {
  // 最新 state 的 ref（flush / debounce 里读最新值，不进依赖避免重装定时器）。
  const stateRef = useRef(state);
  stateRef.current = state;

  // 每个 app 是否已完成「首次恢复」——防止恢复动作把 state 改了又被当成用户改动存回去，
  // 也防止对同一 app 反复恢复。切 app（appId 变）时复位。
  const readyRef = useRef<string>("");
  // 恢复动作刚写回 state 的那一拍：跳过它触发的保存。
  const justRestoredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = enabled && siteId && appId ? `${siteId}:${appId}` : "";

  // ── ① 进入某 app：恢复上次草稿（只一次）───────────────────────────────────
  useEffect(() => {
    if (!key) return;
    let alive = true;
    // appId 变了 → 允许对新 app 恢复一次。
    if (readyRef.current === key) return;
    void (async () => {
      const draft = await loadConsoleDraft(siteId, appId);
      if (!alive) return;
      // 标记该 app 已处理（无论有没有草稿，都不再重复恢复）。
      readyRef.current = key;
      if (draft && draft.state && typeof draft.state === "object") {
        justRestoredRef.current = true;
        setState(draft.state as S);
      }
    })();
    return () => {
      alive = false;
    };
    // 依赖只放 key：切 app（key 变）才重新恢复；setState 是站点稳定 setter。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

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
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void saveConsoleDraft(siteId, appId, stateRef.current);
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // state 变化即安排一次保存（stateRef 读最新值；key 变化随 app 切换）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, key, debounceMs]);

  const flush = useCallback(() => {
    if (!key) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    void saveConsoleDraft(siteId, appId, stateRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, siteId, appId]);

  const restart = useCallback(() => {
    if (!siteId || !appId) {
      setState(initialState);
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    // 复位到初值；标记「刚复位」避免这次变化又被存成一份新草稿（复位=清空语义）。
    justRestoredRef.current = true;
    setState(initialState);
    void clearConsoleDraft(siteId, appId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, appId, initialState, setState]);

  return { restart, flush };
}
