import type { AdvancedFlushResult } from "./advanced-session-context";

export type AdvancedAutoSaveState = "saved" | "saving" | "error";

/**
 * A flush that came back with a reason is a visible failure (W04, D11): the
 * controller keeps retrying transient failures in the background, but the
 * top bar must say 「保存失败」 with the reason and a retry, never sit on
 * 「保存中」 forever or look saved. Even a bare `{ ok: false }` counts: some
 * routes keep the reason on the editor (PdfRoute), and hiding it would hide
 * a real failure.
 */
export function advancedFlushFailureVisible(result: AdvancedFlushResult): boolean {
  return !result.ok;
}

export function advancedAutoSaveDisplayState(input: {
  state: AdvancedAutoSaveState;
  failedAttempt: boolean;
  restorationError?: string;
  restorationPaused: boolean;
}): AdvancedAutoSaveState {
  if (input.restorationError) return "error";
  if (input.restorationPaused) return "saving";
  if (input.failedAttempt && input.state !== "saved") return "error";
  return input.state;
}
