import type { ReactNode } from "react";

export const ADVANCED_HEADER_ACTION_CLASS =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 text-[11px] font-semibold text-[var(--fg-2,#57534e)] shadow-sm transition hover:border-[var(--border-strong,#d6d3d1)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] hover:text-[var(--fg,#292524)] disabled:pointer-events-none disabled:opacity-40";

export const ADVANCED_HEADER_ICON_ACTION_CLASS =
  "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-transparent text-[var(--fg-2,#57534e)] transition hover:border-[var(--border,#e7e5e4)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] hover:text-[var(--fg,#292524)] disabled:pointer-events-none disabled:opacity-40";

export const ADVANCED_HEADER_PRIMARY_ACTION_CLASS =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[11px] font-semibold text-white shadow-sm transition hover:brightness-95 disabled:pointer-events-none disabled:opacity-40";

export interface AdvancedHistoryActions {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

export interface AdvancedViewportActions {
  /** User-facing percent value, for example 100. */
  value: number;
  min?: number;
  max?: number;
  step?: number;
  setValue: (value: number) => void;
  fit?: () => void;
}

export interface AdvancedStageChromeProps {
  toolbar?: ReactNode;
  viewport?: AdvancedViewportActions;
}
