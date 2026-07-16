"use client";

import type { PointerEventHandler, ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  AdvancedEditorIcon,
  type WorkbenchIconName,
} from "./AdvancedEditorIcon";

export interface WorkbenchNavItem {
  id: string;
  label: string;
  icon: WorkbenchIconName;
}

export function AdvancedWorkbenchSidebar({
  tools,
  activeTool,
  activeLabel,
  panelVisible,
  panelWidth,
  panel,
  accent,
  onChooseTool,
  onClosePanel,
  onBeginResize,
}: {
  tools: readonly WorkbenchNavItem[];
  activeTool: string;
  activeLabel?: string;
  panelVisible: boolean;
  panelWidth: number;
  panel: ReactNode;
  accent: string;
  onChooseTool: (id: string) => void;
  onClosePanel: () => void;
  onBeginResize: PointerEventHandler<HTMLDivElement>;
}) {
  const tt = useUI();
  return (
    <>
      <nav className="flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] py-2.5">
        {tools.map((tool) => {
          const active = activeTool === tool.id && panelVisible;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onChooseTool(tool.id)}
              className={`group relative flex h-[56px] w-[64px] flex-col items-center justify-center gap-1 rounded-2xl transition ${
                active
                  ? "bg-[var(--surface-hover,rgba(0,0,0,.06))] text-[var(--fg,#292524)]"
                  : "text-[var(--muted,#78716c)] hover:bg-[var(--surface-hover,rgba(0,0,0,.05))] hover:text-[var(--fg,#292524)]"
              }`}
              style={active ? { color: accent } : undefined}
              aria-label={tool.label}
              aria-pressed={active}
            >
              <AdvancedEditorIcon name={tool.icon} className="h-5 w-5" />
              <span className="max-w-[58px] truncate text-[9px] font-medium">
                {tool.label}
              </span>
            </button>
          );
        })}
      </nav>
      {panelVisible && (
        <>
          <aside
            className="min-h-0 max-w-[calc(100vw-72px)] shrink-0 overflow-hidden border-r border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] shadow-[4px_0_18px_rgba(0,0,0,.035)] md:max-w-[48vw]"
            style={{ width: panelWidth }}
          >
            <div className="flex h-11 items-center border-b border-[var(--divider,#e7e5e4)] px-3 text-[12px] font-semibold">
              <span className="min-w-0 flex-1 truncate">
                {activeLabel || tools.find((tool) => tool.id === activeTool)?.label}
              </span>
              <button
                type="button"
                onClick={onClosePanel}
                aria-label={tt("收起工具区")}
                className="grid h-7 w-7 place-items-center rounded-lg text-[var(--muted,#78716c)] hover:bg-[var(--surface-hover,rgba(0,0,0,.06))] hover:text-[var(--fg,#292524)]"
              >
                ×
              </button>
            </div>
            <div className="h-[calc(100%-2.75rem)] min-h-0 overflow-y-auto">
              {panel}
            </div>
          </aside>
          <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={onBeginResize}
            className="-ml-1 hidden w-2 shrink-0 cursor-col-resize touch-none bg-transparent transition hover:bg-[var(--border,#e7e5e4)] md:block"
            title={tt("拖动调整工具区宽度")}
          />
        </>
      )}
    </>
  );
}
