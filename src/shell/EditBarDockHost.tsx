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
  return (
    <div
      ref={hostRef}
      hidden={!presentation}
      data-workspace-edit-bar-dock
      data-edit-bar-dock-state={presentation?.mode || "inactive"}
      data-drop-highlight={highlighted}
      role="region"
      aria-label={tt("编辑栏停靠区")}
      style={
        presentation
          ? (advancedWorkbenchStyle(presentation.accent) as CSSProperties)
          : undefined
      }
      className={`relative min-h-[3.5rem] min-w-0 max-w-full shrink-0 items-center justify-center border-b px-2 py-1 ${
        presentation ? "flex" : "hidden"
      } ${
        floating
          ? "border-dashed border-[var(--awb-border)] bg-[var(--awb-chrome-bg)]"
          : "border-stone-100 bg-transparent"
      } ${
        highlighted
          ? "ring-2 ring-inset ring-[var(--awb-accent)] bg-[var(--awb-accent-soft)]"
          : ""
      }`}
    >
      {floating && (
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
