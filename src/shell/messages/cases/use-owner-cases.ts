"use client";

// 取「针对我内容的案件」：进来取一次，登录状态变了重取，提交完立刻用服务端回的那一件换进列表再静默重取。
// 取不到分三种：没登录（401）→ 提示登录；其他失败 → 带重试；静默重取失败时留着手上的列表，不把刚成功的提交盖掉。
import { useCallback, useEffect, useRef, useState } from "react";
import { AUTH_STATE_EVENT } from "../../../lib/auth/client";
import type { OwnerCase } from "../../../lib/moderation/case-model";
import { classifyModerationError, listMyCases, type ModerationFailure } from "../../../lib/moderation/client";

export type OwnerCasesPhase = "loading" | "ready" | "signed-out" | "error";

export interface OwnerCasesState {
  phase: OwnerCasesPhase;
  cases: OwnerCase[];
  failure: ModerationFailure | null;
}

export interface OwnerCasesHandle extends OwnerCasesState {
  /** `quiet` = 不闪「加载中」，失败也不丢手上的列表。 */
  reload: (options?: { quiet?: boolean }) => Promise<void>;
  /** 用服务端回的更新后案件换掉列表里同 id 的那一件。 */
  apply: (updated: OwnerCase | null) => void;
}

const INITIAL: OwnerCasesState = { phase: "loading", cases: [], failure: null };

export function useOwnerCases(load: () => Promise<OwnerCase[]> = listMyCases): OwnerCasesHandle {
  const [state, setState] = useState<OwnerCasesState>(INITIAL);
  const alive = useRef(true);
  const latest = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async (options?: { quiet?: boolean }) => {
    const quiet = options?.quiet === true;
    const mine = ++latest.current;
    if (!quiet) setState((prev) => (prev.phase === "ready" ? prev : INITIAL));
    try {
      const cases = await loadRef.current();
      if (!alive.current || mine !== latest.current) return;
      setState({ phase: "ready", cases, failure: null });
    } catch (error) {
      if (!alive.current || mine !== latest.current) return;
      const failure = classifyModerationError(error);
      if (failure === "unauthorized") {
        setState({ phase: "signed-out", cases: [], failure });
      } else if (quiet) {
        setState((prev) => (prev.phase === "ready" ? prev : { phase: "error", cases: [], failure }));
      } else {
        setState({ phase: "error", cases: [], failure });
      }
    }
  }, []);

  const apply = useCallback((updated: OwnerCase | null) => {
    if (!updated) return;
    setState((prev) =>
      prev.phase !== "ready" ? prev : { ...prev, cases: prev.cases.map((row) => (row.id === updated.id ? updated : row)) },
    );
  }, []);

  useEffect(() => {
    alive.current = true;
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  // 在别处登录 / 退出：重取（退出后 401 会落到「请先登录」）。
  // 刚挂载时的 INITIAL_SESSION 和每小时一次的 TOKEN_REFRESHED 不是「换人了」，不值得再打一次网关。
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onAuth = (event: Event) => {
      const kind = (event as CustomEvent<{ event?: string } | undefined>).detail?.event;
      if (kind === "INITIAL_SESSION" || kind === "TOKEN_REFRESHED") return;
      void reload({ quiet: true });
    };
    window.addEventListener(AUTH_STATE_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_STATE_EVENT, onAuth);
  }, [reload]);

  return { ...state, reload, apply };
}
