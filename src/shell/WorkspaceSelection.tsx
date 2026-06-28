"use client";

// ============================================================================
// @oceanleo/ui — 覆盖式子栏「选中态」桥（doctrine v4，单一事实源）
// ----------------------------------------------------------------------------
// master-detail 版式里，子栏列表渲染在**侧栏**（AppShell 的 subNav.render），
// 选中项的详情渲染在**主区**（路由页 children）。两者不在同一棵渲染子树里，需要
// 一个跨树的轻量状态桥。各站在 <AppShell> 外层包一次 <WorkspaceSelectionProvider>，
// 子栏与主区都用 useWorkspaceSelection() 读写同一份选中态。
//
// 用「命名空间 + key」存：namespace 区分四类子栏（workspace/library/history/
// playground），key 是该类下选中的条目 id（agentId / fileId / taskId / 复合）。
// 这样一个 Provider 同时服务多个子栏，互不串台。
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type SelectionNamespace =
  | "workspace"
  | "library"
  | "history"
  | "playground";

interface SelectionState {
  get: (ns: SelectionNamespace) => string | null;
  set: (ns: SelectionNamespace, value: string | null) => void;
}

const Ctx = createContext<SelectionState | null>(null);

export function WorkspaceSelectionProvider({ children }: { children: ReactNode }) {
  const [map, setMap] = useState<Record<string, string | null>>({});
  const get = useCallback((ns: SelectionNamespace) => map[ns] ?? null, [map]);
  const set = useCallback(
    (ns: SelectionNamespace, value: string | null) =>
      setMap((m) => ({ ...m, [ns]: value })),
    [],
  );
  const value = useMemo<SelectionState>(() => ({ get, set }), [get, set]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * 读写某子栏命名空间的选中项。返回 [selected, select]。
 * 不在 Provider 内时降级为组件局部 state（子栏与主区在同一棵树时仍可用）。
 *
 * 关键（2026-06-28 修目录路由风暴）：返回的 setter 必须是**稳定引用**，否则消费端
 * 依赖它的 useEffect 会因为「每次渲染都是新函数」而反复触发——叠加受控站 fn↔sel
 * 双向同步时会造成 router.replace 风暴（ERR_INSUFFICIENT_RESOURCES）。Provider 的
 * `set` 已是稳定 useCallback；这里把它 bind 到 ns 后再用 useCallback 锁定，使
 * setSelection 跨渲染恒等。`ctx.get(ns)` 仍随选中态变化（这是值，本就该变）。
 */
export function useWorkspaceSelection(
  ns: SelectionNamespace,
): [string | null, (v: string | null) => void] {
  const ctx = useContext(Ctx);
  const [local, setLocal] = useState<string | null>(null);
  const ctxSet = ctx?.set;
  const setSelection = useCallback(
    (v: string | null) => {
      if (ctxSet) ctxSet(ns, v);
      else setLocal(v);
    },
    [ctxSet, ns],
  );
  return [ctx ? ctx.get(ns) : local, setSelection];
}
