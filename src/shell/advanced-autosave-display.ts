import type { AdvancedFlushResult } from "./advanced-session-context";
import type { AdvancedEditRevision } from "./advanced-persistence-controller";
import { AUTOSAVE_ERROR_NETWORK, mapAutosaveErrorMessage } from "../lib/auth/autosave-error-message";

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

/**
 * Draft-tier editors publish the version this soon after the server draft is
 * acknowledged (was 20 s; W08-to-W04 #1: closing and reopening inside that
 * window showed the old version, and the library card lagged).
 */
export const DRAFT_VERSION_IDLE_MS = 1_500;

export function withErrorMessage(result: AdvancedFlushResult): AdvancedFlushResult {
  if (result.ok) return result;
  // Offline is named as such, whatever wording the failing step used.
  return { ...result, errorMessage: browserOffline() ? AUTOSAVE_ERROR_NETWORK : mapAutosaveErrorMessage(result) };
}

export function advancedAutoSaveDisplayState(input: {
  state: AdvancedAutoSaveState;
  failedAttempt: boolean;
  restorationError?: string;
  restorationPaused: boolean;
  /** A server draft is acknowledged but its version is not committed yet: not 「已保存」 (§5). */
  versionOwed?: boolean;
}): AdvancedAutoSaveState {
  if (input.restorationError) return "error";
  if (input.restorationPaused) return "saving";
  const state = input.state === "saved" && input.versionOwed ? "saving" : input.state;
  if (input.failedAttempt && state !== "saved") return "error";
  return state;
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
  /** When the opened revision was committed. A local copy last edited before it is stale, not new work. */
  baseSavedAt?: number;
}): boolean {
  if (!input.dirty) return false;
  if (input.localPromotion && Object.is(input.localPromotion.revision, input.revision)) return true;
  // A restored server draft already said 「已保存」 in an earlier visit; it still has to become a
  // version (W08-to-W04 #1), so publishing it is owed work even before this visit's first edit.
  if (input.draftTier && input.serverRestoredRevision !== undefined) return Object.is(input.serverRestoredRevision, input.revision);
  if (!input.draftTier || input.draftRestoredAt === undefined) return false;
  return !(Number.isFinite(input.baseSavedAt) && input.draftRestoredAt <= (input.baseSavedAt as number));
}

export function browserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Draft-tier attempts fail visibly like a version flush (W09-to-W04 #3): the
 * controller keeps retrying, but the bar says 「保存失败」 and why instead of
 * sitting on 「保存中」. A refused session record only counts when offline;
 * otherwise it is a benign "revision moved on" and the next attempt covers it.
 */
export async function visibleDraftAttempt<T>(
  attempt: () => Promise<T>,
  fail: (error: string) => void,
  offline: () => boolean = browserOffline,
): Promise<T> {
  try {
    const saved = await attempt();
    if (saved === false && offline()) fail(AUTOSAVE_ERROR_NETWORK);
    return saved;
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

