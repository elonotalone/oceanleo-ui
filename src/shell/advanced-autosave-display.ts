import type { AdvancedFlushResult } from "./advanced-session-context";
import type { AdvancedEditRevision } from "./advanced-persistence-controller";

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

/**
 * Restored work the server does not have yet must be saved, never shown as
 * 「已保存」 (W04 R2, browser: offline edit → reload → reopened editor showed
 * the edit as saved and sent nothing for 60 s). Non-draft editors publish a
 * local promotion (useAdvancedRecovery). Draft-tier editors restore inside
 * useAdvancedDraftRestore, which marks a server draft with its revision and a
 * local (IndexedDB) copy only with the restore time.
 */
export function advancedRecoveredLocalWork(input: {
  dirty: boolean;
  revision: AdvancedEditRevision;
  localPromotion?: { revision: AdvancedEditRevision };
  draftTier: boolean;
  serverRestoredRevision?: AdvancedEditRevision;
  draftRestoredAt?: number;
}): boolean {
  if (!input.dirty) return false;
  if (input.localPromotion && Object.is(input.localPromotion.revision, input.revision)) return true;
  return input.draftTier && input.serverRestoredRevision === undefined && input.draftRestoredAt !== undefined;
}
