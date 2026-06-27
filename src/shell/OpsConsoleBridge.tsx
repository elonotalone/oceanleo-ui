"use client";

// ============================================================================
// @oceanleo/ui — 操作台 ⟷ leo 助手浮窗 的全局桥（单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v9 修订（理解 A，操作员 2026-06-27）：
//   左栏只保留 agent；「操作台」不再是左栏的一页，而是搬进右下角的 **leo 助手浮窗**，
//   作为浮窗里的第二页（「leo 建议 | 操作台」一对切换键，共用同一个浮窗显示框）。
//
//   难点：操作台表单（opsContent / schema / state）由各功能区组件（FunctionAgentChat）
//   持有，而浮窗是 layout 级别的全局单例。需要一个跨树的轻量桥：
//     - 持有操作台的组件在「成为当前活跃功能区」时 register 自己（拿到一个 handle）；
//     - 每次 state 变化只 update handle 内容（不 unregister/re-register，避免抖动）；
//     - leo 助手浮窗 subscribe，拿到当前活跃操作台 → 渲染「操作台」页；
//     - 没有任何注册项时，浮窗只显示「leo 建议」页（纯输入框站零影响）。
//
//   update 时 bump `rev`，浮窗据 rev 变化把 getState() 整理成文本、单向同步进当前
//   AI 输入框。
// ============================================================================

import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { OpsSchema } from "../lib/fn-agent";

/** 一份「可被浮窗承载」的操作台注册项。 */
export interface OpsConsoleEntry {
  /** 注册者唯一 id（一般 = 功能区 agentId）。 */
  id: string;
  /** 操作台 schema（把已填字段整理成「字段：值」文本时用）。 */
  schema: OpsSchema;
  /** 操作台表单内容（各站现成的 StudioSection 表单，**不含生成按钮**）。 */
  content: ReactNode;
  /** 读当前操作台 state（整理成 prompt 文本同步进输入框）。 */
  getState: () => Record<string, unknown>;
  /** 不计入 prompt 文本的字段 key（结果/输出类）。 */
  excludeKeys?: string[];
  /** 强调色（操作台页序号徽章等）。 */
  accent?: string;
  /** 操作台页标签，默认「操作台」。 */
  label?: string;
  /** 该操作台所属功能区/ app 名（浮窗操作台页顶部小标签）。 */
  appLabel?: string;
  /**
   * 单调递增的版本号：各站 state 变了 → update 时 bump → 浮窗据此重新整理文本。
   */
  rev: number;
}

/** register 返回的句柄：原地更新内容 / 注销。 */
export interface OpsConsoleHandle {
  update: (next: Omit<OpsConsoleEntry, "id">) => void;
  unregister: () => void;
}

// module-level 单例 store。多个功能区同时挂载时（如某站多 agent），后注册的压栈顶，
// 当前活跃 = 栈顶。从功能区 A 切到 B 再切回 A 时行为可预期。
type Listener = () => void;

const stack: OpsConsoleEntry[] = [];
const listeners = new Set<Listener>();
let snapshot: OpsConsoleEntry | null = null;

function recomputeSnapshot() {
  snapshot = stack.length ? stack[stack.length - 1] : null;
}

function emit() {
  recomputeSnapshot();
  for (const l of listeners) l();
}

/**
 * 注册一份操作台，返回句柄。同 id 已注册则复用其栈位（只更新内容）。
 */
export function registerOpsConsole(entry: OpsConsoleEntry): OpsConsoleHandle {
  const existing = stack.findIndex((e) => e.id === entry.id);
  if (existing >= 0) {
    stack[existing] = entry;
  } else {
    stack.push(entry);
  }
  emit();

  return {
    update: (next) => {
      const i = stack.findIndex((e) => e.id === entry.id);
      if (i < 0) return;
      stack[i] = { id: entry.id, ...next };
      emit();
    },
    unregister: () => {
      const i = stack.findIndex((e) => e.id === entry.id);
      if (i >= 0) {
        stack.splice(i, 1);
        emit();
      }
    },
  };
}

function getSnapshot(): OpsConsoleEntry | null {
  return snapshot;
}

function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** 浮窗订阅当前活跃操作台（无则 null）。 */
export function useActiveOpsConsole(): OpsConsoleEntry | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
