import type { ServerPageCard } from "./href";

export type ServerPageUrlPatch = {
  card?: ServerPageCard;
  /** `null` removes the param; `undefined` keeps whatever is there. */
  program?: string | null;
  session?: string | null;
};

/**
 * Rewrites the device detail query with
 * `history.replaceState`. Next's App Router keeps `useSearchParams()` in sync
 * with native history calls, so this never triggers a server round trip or a
 * remount the way `router.replace` does.
 */
export function replaceServerPageUrl(
  computerId: string,
  patch: ServerPageUrlPatch,
): void {
  if (typeof window === "undefined" || !computerId) return;
  const url = new URL(window.location.href);
  const path = "/devices";
  url.searchParams.set("computer", computerId);
  if (url.pathname !== path) url.pathname = path;
  if (patch.card) url.searchParams.set("view", patch.card);
  else url.searchParams.delete("view");
  for (const key of ["program", "session"] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  window.history.replaceState(window.history.state, "", next);
}
