"use client";

import {
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import type { WorkspaceSlotId } from "./workspace-actions";

export const WORKSPACE_SLOT_LABELS: Record<WorkspaceSlotId, string> = {
  template: "灵感",
  preview: "生成",
  materials: "素材库",
  mine: "我的库",
  browser: "云端浏览器",
};

export interface LiveWorkspaceNodeStore {
  node: ReactNode;
  version: number;
  listeners: Set<() => void>;
}

export function createLiveWorkspaceNodeStore(): LiveWorkspaceNodeStore {
  return { node: null, version: 0, listeners: new Set() };
}

export function LiveWorkspaceNode({
  store,
}: {
  store: LiveWorkspaceNodeStore;
}) {
  useSyncExternalStore(
    (listener) => {
      store.listeners.add(listener);
      return () => store.listeners.delete(listener);
    },
    () => store.version,
    () => store.version,
  );
  return <>{store.node}</>;
}

/**
 * 右栏没有被 `SplitWorkspace` 接管时的独立外框。顶上不再是槽位标签条：
 * 有 `header` 时画返回行，卡片首页时不画。
 */
export function StandaloneWorkspaceFrame({
  header,
  className = "",
  children,
}: {
  header: ReactNode | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white ${className}`}
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,.035)" }}
    >
      {header != null ? (
        <div
          data-workspace-frame-header
          className="flex min-h-[2.5rem] shrink-0 items-center border-b border-stone-200 bg-stone-50/80 px-2 py-1"
        >
          {header}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  );
}

/** Secondary tabs inside a Preview card; kept API-compatible with all sites. */
export function CanvasSubTabs({
  tabs,
  active,
  onChange,
  accent = "#4f46e5",
  right,
  className = "",
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
  accent?: string;
  right?: ReactNode;
  className?: string;
}) {
  const tt = useUI();
  return (
    <div className={`mb-3 flex flex-wrap items-center gap-2 ${className}`}>
      {tabs.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
 selected
 ? "text-white"
 : "bg-stone-100 text-stone-600 hover:bg-stone-200"
 }`}
            style={selected ? { background: accent } : undefined}
          >
            {tt(tab.label)}
          </button>
        );
      })}
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

export function CanvasEmpty({
  title = "结果将在这里显示",
  description = "在左侧设置参数并开始后，可在这里查看和下载。",
  hint,
  icon,
  action,
}: {
  title?: string;
  description?: string;
  hint?: string;
  icon?: ReactNode;
  /**
   * 空态下方的动作插槽。**必须保持可选**：36 个站直接 import 本组件，加必填字段会让
   * 它们一起 typecheck 变红（`OperatorConsole.tsx:39-43` 的前车之鉴）。不传时这块
   * 空态与今天逐字相同。
   */
  action?: ReactNode;
}) {
  const tt = useUI();
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-8 text-center">
      {icon ?? (
        <svg
          className="mb-3 h-10 w-10 text-stone-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 9h10M7 13h7M7 17h4" strokeLinecap="round" />
        </svg>
      )}
      <h3 className="text-[13px] font-semibold text-stone-700">
        {tt(title)}
      </h3>
      <p className="mt-1.5 max-w-xs text-[11px] leading-relaxed text-stone-400">
        {tt(hint || description)}
      </p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
