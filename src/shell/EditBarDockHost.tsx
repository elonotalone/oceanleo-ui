"use client";

import type { CSSProperties, RefObject } from "react";
import { useUI } from "../i18n/ui/useUI";
import { advancedWorkbenchStyle } from "./advanced-workbench-chrome";
import type { EditBarDockMode } from "./edit-bar-dock-state";

export interface EditBarDockPresentation {
  ownerId: string;
  mode: EditBarDockMode;
  dropActive: boolean;
  accent: string;
}

export function EditBarDockHost({
  hostRef,
  presentation,
}: {
  hostRef: RefObject<HTMLDivElement | null>;
  presentation: EditBarDockPresentation | null;
}) {
  const tt = useUI();
  const floating = presentation?.mode === "floating";
  const highlighted = Boolean(floating && presentation?.dropActive);
  const collapsed = Boolean(floating && !highlighted);
  return (
    <div
      ref={hostRef}
      hidden={!presentation}
      data-workspace-edit-bar-dock
      data-edit-bar-dock-state={presentation?.mode || "inactive"}
      data-drop-highlight={highlighted}
      data-edit-bar-dock-collapsed={collapsed}
      role={collapsed ? undefined : "region"}
      aria-label={collapsed ? undefined : tt("编辑栏停靠区")}
      aria-hidden={collapsed || undefined}
      style={
        presentation
          ? (advancedWorkbenchStyle(presentation.accent) as CSSProperties)
          : undefined
      }
      className={`relative min-w-0 max-w-full shrink-0 items-center justify-center ${
        presentation ? "flex" : "hidden"
      } ${
        collapsed
          ? "h-0 min-h-0 overflow-hidden border-0 p-0"
          : "min-h-[3.5rem] border-b px-2 py-1"
      } ${
        highlighted
          ? "border-dashed border-[var(--awb-border)] bg-[var(--awb-chrome-bg)]"
          : collapsed
            ? "bg-transparent"
            : "border-stone-100 bg-transparent"
      } ${
        highlighted
          ? "ring-2 ring-inset ring-[var(--awb-accent)] bg-[var(--awb-accent-soft)]"
          : ""
      }`}
    >
      {presentation && (
        <span
          data-edit-bar-dock-sentinel
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-14"
        />
      )}
      {highlighted && (
        <span
          data-edit-bar-dock-placeholder
          aria-live="polite"
          className={`pointer-events-none truncate text-[11px] font-medium ${
            highlighted
              ? "text-[var(--awb-accent)]"
              : "text-[var(--awb-muted)]"
          }`}
        >
          {tt(
            highlighted
              ? "松开以固定编辑栏"
              : "将编辑栏拖到这里固定",
          )}
        </span>
      )}
    </div>
  );
}
