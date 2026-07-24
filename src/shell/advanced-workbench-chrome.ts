import type { CSSProperties, ReactNode } from "react";
import type { WorkbenchIconName } from "./AdvancedEditorIcon";

export const ADVANCED_HEADER_ACTION_CLASS =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 text-[11px] font-semibold text-[var(--fg-2,#57534e)] shadow-sm transition hover:border-[var(--border-strong,#d6d3d1)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] hover:text-[var(--fg,#292524)] disabled:pointer-events-none disabled:opacity-40";

export const ADVANCED_HEADER_ICON_ACTION_CLASS =
  "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-transparent text-[var(--fg-2,#57534e)] transition hover:border-[var(--border,#e7e5e4)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] hover:text-[var(--fg,#292524)] disabled:pointer-events-none disabled:opacity-40";

export const ADVANCED_HEADER_PRIMARY_ACTION_CLASS =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[11px] font-semibold text-white shadow-sm transition hover:brightness-95 disabled:pointer-events-none disabled:opacity-40";

export interface AdvancedWorkbenchAction {
  id: string;
  label: string;
  busyLabel?: string;
  icon?: WorkbenchIconName;
  variant?: "default" | "primary" | "danger" | "icon";
  /**
   * Explicit semantic grouping for shared chrome. Download menus never infer
   * membership from translated labels or route-specific ids.
   */
  group?: "download";
  disabled?: boolean;
  busy?: boolean;
  panelId?: string;
  onTrigger?: () => void | Promise<void>;
}

export function advancedWorkbenchStyle(accent: string): CSSProperties {
  return {
    "--awb-shell-bg": "var(--bg,#f7f7f5)",
    "--awb-chrome-bg": "var(--card,#fff)",
    "--awb-stage-bg": "var(--surface,#f2f3f5)",
    "--advanced-stage-bg": "var(--awb-stage-bg)",
    "--awb-popover-bg": "var(--card,#fff)",
    "--awb-border": "var(--border,#e7e5e4)",
    "--awb-text": "var(--fg,#292524)",
    "--awb-muted": "var(--muted,#78716c)",
    "--awb-hover": "var(--surface-hover,rgba(0,0,0,.05))",
    "--awb-accent": accent,
    "--awb-accent-soft": `color-mix(in srgb, ${accent} 10%, transparent)`,
    "--awb-danger": "var(--danger,#dc2626)",
    "--awb-shadow-floating": "0 8px 28px rgba(15,23,42,.12)",
  } as CSSProperties;
}

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
