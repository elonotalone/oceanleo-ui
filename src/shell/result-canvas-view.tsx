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

export function FixedWorkspaceTabs({
  slots,
  selected,
  onSelect,
  accent,
}: {
  slots: WorkspaceSlotId[];
  selected: WorkspaceSlotId;
  onSelect: (slot: WorkspaceSlotId) => void;
  accent: string;
}) {
  const tt = useUI();
  return (
    <nav
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto rounded-xl bg-stone-100 p-1"
      aria-label={tt("工作区")}
    >
      {slots.map((slot) => {
        const active = selected === slot;
        return (
          <button
            key={slot}
            type="button"
            onClick={() => onSelect(slot)}
            className={`min-w-fit flex-1 whitespace-nowrap rounded-lg px-2 py-1 text-[12px] font-medium transition-colors ${
              active
                ? "bg-white shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
            style={active ? { color: accent } : undefined}
          >
            {tt(WORKSPACE_SLOT_LABELS[slot])}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * 右栏没有被 `SplitWorkspace` 接管时的独立外框（自带一条槽位标签条）。原样从
 * `ResultCanvas.tsx` 搬来，class 与 DOM 结构逐字未变；拆分理由只有尺寸闸。
 */
export function StandaloneWorkspaceFrame({
  slots,
  selected,
  onSelect,
  accent,
  className = "",
  children,
}: {
  slots: readonly WorkspaceSlotId[];
  selected: WorkspaceSlotId;
  onSelect: (slot: WorkspaceSlotId) => void;
  accent: string;
  className?: string;
  children: ReactNode;
}) {
  const tt = useUI();
  return (
    <section
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white ${className}`}
      style={{ boxShadow: "0 1px 3px rgba(0,0,0,.035)" }}
    >
      <nav
        className="v-scroll shrink-0 overflow-x-auto border-b border-stone-200 bg-stone-50/80 px-2"
        aria-label={tt("工作区")}
      >
        <div className="flex min-w-max items-center">
          {slots.map((slot) => {
            const isActive = selected === slot;
            return (
              <button
                key={slot}
                type="button"
                onClick={() => onSelect(slot)}
                aria-current={isActive ? "page" : undefined}
                className={`relative h-10 whitespace-nowrap px-3 text-[12px] font-medium transition ${
                  isActive
                    ? "text-stone-900"
                    : "text-stone-400 hover:text-stone-700"
                }`}
              >
                {tt(WORKSPACE_SLOT_LABELS[slot])}
                {isActive && (
                  <span
                    className="absolute inset-x-3 bottom-0 h-0.5 rounded-full"
                    style={{ background: accent }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>
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
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
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
