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
}: {
  title?: string;
  description?: string;
  hint?: string;
  icon?: ReactNode;
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
    </div>
  );
}
