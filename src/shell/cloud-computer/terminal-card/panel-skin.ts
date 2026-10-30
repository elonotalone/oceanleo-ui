import { tone } from "../server-page/tone";

/**
 * Class set for the shared terminal/CLI settings panels. The standalone
 * Computers page keeps its own server-page palette; the task page passes the
 * host palette from `native-surface/host-style.ts` so one UI system shows.
 */
export type PanelSkin = {
  muted: string;
  input: string;
  divide: string;
  border: string;
  frame: string;
  check: string;
  heading: string;
};

export const SERVER_PANEL_SKIN: PanelSkin = {
  muted: tone.muted,
  input: tone.input,
  divide: tone.divide,
  border: tone.border,
  frame: `rounded-lg border p-3 ${tone.border} ${tone.panel}`,
  check: "size-4 shrink-0 accent-zinc-900 dark:accent-neutral-100",
  heading: "text-sm font-semibold",
};
