import type { AdvancedPersistenceNudgeReason } from "./advanced-persistence-controller";

/** Same literal as `AUTH_STATE_EVENT` in lib/auth/client (kept local so tests need no auth client). */
const AUTH_STATE_EVENT_NAME = "oceanleo:auth-state";

/**
 * Events that mean "saving may work now": the network came back, the tab is
 * visible again, or a session exists again. Used by mounted editors and the
 * background saver so nobody has to click a retry button.
 */
export function subscribeAutosaveNudges(
  nudge: (reason: AdvancedPersistenceNudgeReason) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onOnline = () => nudge("online");
  const onVisibility = () => {
    if (typeof document !== "undefined" && document.visibilityState === "visible") nudge("visible");
  };
  const onAuth = (event: Event) => {
    const detail = (event as CustomEvent<{ event?: string; userId?: string | null }>).detail;
    if (detail && detail.userId === null) return; // signed out: nothing to resume yet
    if (detail?.event === "SIGNED_OUT") return;
    nudge("auth");
  };
  window.addEventListener("online", onOnline);
  window.addEventListener(AUTH_STATE_EVENT_NAME, onAuth);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener(AUTH_STATE_EVENT_NAME, onAuth);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
