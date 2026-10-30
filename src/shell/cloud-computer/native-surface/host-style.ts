import type { PanelSkin } from "../terminal-card/panel-skin";

/**
 * Host (task page) classes for computer surfaces. Same tokens as LeoComposer,
 * ComputerDock and the SplitWorkspace pane: neutral palette, rounded-xl,
 * 12/13px text. The Computers-page palette never enters native-surface.
 */
export const HOST = {
  muted: "text-neutral-500",
  faint: "text-neutral-400",
  groupTitle: "text-[12px] font-medium text-neutral-500",
  group: "grid gap-3 border-b border-neutral-100 px-4 py-4 last:border-b-0",
  label: "grid gap-1 text-[13px] text-neutral-800",
  hint: "text-[12px] leading-5 text-neutral-500",
  input:
    "h-9 w-full rounded-xl border border-neutral-200 bg-white px-3 text-[13px] text-neutral-900 outline-none focus-visible:border-neutral-400",
  check: "size-4 shrink-0 accent-neutral-900",
  primary:
    "rounded-lg bg-neutral-900 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:opacity-50",
  secondary:
    "rounded-lg border border-neutral-200 px-3 py-1.5 text-[13px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50",
  quiet:
    "rounded-lg px-2.5 py-1.5 text-[13px] text-neutral-600 hover:bg-neutral-100 disabled:opacity-50",
  error: "text-[12px] leading-5 text-red-600",
  ok: "text-[12px] leading-5 text-emerald-700",
} as const;

/** Host palette for the shared AppearancePanel / CliSettingsPanel. */
export const HOST_PANEL_SKIN: PanelSkin = {
  muted: "text-neutral-500",
  input: "border-neutral-200 bg-white text-[13px] text-neutral-900",
  divide: "divide-neutral-100",
  border: "border-neutral-100",
  frame: "",
  check: HOST.check,
  heading: "text-[13px] font-medium text-neutral-800",
};
