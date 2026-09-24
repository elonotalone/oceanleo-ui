"use client";

// ============================================================================
// @oceanleo/ui — 一个文档只有一个 leo 面板
// ----------------------------------------------------------------------------
// 共享壳（LeoShellMount）挂的实例优先于子站 layout / 门户 launcher 里直接写的
// <LeoAssistant>；同一级别先挂的留下。让位的实例渲染 null：不监听打开事件、不发请求。
// 留下的那个卸载后，下一个自动接手。
// 登记表挂在 globalThis 上：同一页面即使打进了两份 @oceanleo/ui，也只认这一张表。
// 服务端渲染与水合那一帧照旧渲染（HTML 与只有一个实例时相同），挂载后再裁决。
// ============================================================================

import { createContext, useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type LeoMountKind = "shell" | "layout";

/** LeoShellMount 渲染的 LeoAssistant 读到 "shell"；其它写法读到默认的 "layout"。 */
export const LeoMountKindContext = createContext<LeoMountKind>("layout");

interface LeoMountClaim {
  id: number;
  rank: number;
}

interface LeoMountRegistry {
  nextId: number;
  claims: LeoMountClaim[];
  listeners: Set<() => void>;
}

const RANK: Record<LeoMountKind, number> = { layout: 1, shell: 2 };
const REGISTRY_KEY = Symbol.for("oceanleo.leo-mounts");

function registry(): LeoMountRegistry {
  const host = globalThis as unknown as Record<symbol, LeoMountRegistry | undefined>;
  let reg = host[REGISTRY_KEY];
  if (!reg) {
    reg = { nextId: 1, claims: [], listeners: new Set() };
    host[REGISTRY_KEY] = reg;
  }
  return reg;
}

function notify(reg: LeoMountRegistry): void {
  for (const listener of Array.from(reg.listeners)) listener();
}

function subscribe(listener: () => void): () => void {
  const reg = registry();
  reg.listeners.add(listener);
  return () => {
    reg.listeners.delete(listener);
  };
}

/** 这个实例是否该渲染 leo：文档里没有更高级别、或同级别更早挂上的实例。 */
export function useLeoMountSlot(kind: LeoMountKind): boolean {
  const rank = RANK[kind];
  const [id] = useState(() => registry().nextId++);
  const getSnapshot = useCallback(
    () =>
      !registry().claims.some(
        (claim) => claim.id !== id && (claim.rank > rank || (claim.rank === rank && claim.id < id)),
      ),
    [id, rank],
  );
  const active = useSyncExternalStore(subscribe, getSnapshot, () => true);
  useEffect(() => {
    const reg = registry();
    const claim: LeoMountClaim = { id, rank };
    reg.claims.push(claim);
    notify(reg);
    return () => {
      reg.claims = reg.claims.filter((entry) => entry !== claim);
      notify(reg);
    };
  }, [id, rank]);
  return active;
}
