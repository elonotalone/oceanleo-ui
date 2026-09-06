import type { CSSProperties, ReactNode } from "react";
import type { WorkbenchIconName } from "./AdvancedEditorIcon";

export const ADVANCED_HEADER_ACTION_CLASS =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 text-[11px] font-semibold text-[var(--fg-2,#57534e)] shadow-sm transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-[var(--border-strong,#d6d3d1)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] hover:text-[var(--fg,#292524)] disabled:pointer-events-none disabled:opacity-40";

export const ADVANCED_HEADER_ICON_ACTION_CLASS =
  "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-transparent text-[var(--fg-2,#57534e)] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-[var(--border,#e7e5e4)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] hover:text-[var(--fg,#292524)] disabled:pointer-events-none disabled:opacity-40";

export const ADVANCED_HEADER_PRIMARY_ACTION_CLASS =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 text-[11px] font-semibold text-white shadow-sm transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:brightness-95 disabled:pointer-events-none disabled:opacity-40";

export interface AdvancedWorkbenchAction {
  id: string;
  label: string;
  busyLabel?: string;
  icon?: WorkbenchIconName;
  variant?: "default" | "primary" | "danger" | "icon";
  /**
   * Explicit semantic grouping for shared chrome. Menus never infer
   * membership from translated labels or route-specific ids.
   *
   * 规范 v2 §4：宿主按组分发，三者永不混住——
   *   `"download"` → 第一行下载菜单；`"save"` → 第一行保存菜单；
   *   `"edit"`（缺省，不写即是）→ 编辑栏文档段。
   */
  group?: "download" | "save" | "edit";
  disabled?: boolean;
  busy?: boolean;
  panelId?: string;
  onTrigger?: () => void | Promise<void>;
}

export type AdvancedWorkbenchActionGroup = NonNullable<
  AdvancedWorkbenchAction["group"]
>;

/** 没写 `group` 的动作视为编辑类；宿主判组只走这里，不各自 `?? "edit"`。 */
export function actionGroup(
  action: Pick<AdvancedWorkbenchAction, "group">,
): AdvancedWorkbenchActionGroup {
  return action.group ?? "edit";
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
    // 站点别名路径的 accent 由宿主给（历来是深色），实心底上维持白字。
    "--awb-on-accent": "#ffffff",
    "--awb-danger": "var(--danger,#dc2626)",
    "--awb-danger-soft": "color-mix(in srgb, var(--danger,#dc2626) 10%, transparent)",
    "--awb-warn": "#d97706",
    "--awb-ok": "#059669",
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
