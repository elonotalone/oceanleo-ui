// Site workspaces live under the main site (session/sites wave 2026-11-21, contract §2.5):
//   /workspace                      the desk (one card per site)
//   /workspace/<siteKey>            that site's app cards
//   /workspace/<siteKey>/<app...>   the app's function area
// There are no sub-site hosts any more; every link to a site's workspace is same-origin.
export const SITE_WORKSPACE_ROOT = "/workspace";

export function siteWorkspaceBase(siteKey: string): string {
  return `${SITE_WORKSPACE_ROOT}/${encodeURIComponent(siteKey)}`;
}

export function siteWorkspaceHref(
  siteKey: string,
  segments: readonly string[] = [],
  query?: Record<string, string | number | boolean | null | undefined>,
): string {
  const path = [siteWorkspaceBase(siteKey), ...segments.filter(Boolean).map((part) => encodeURIComponent(part))].join("/");
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `${path}?${text}` : path;
}

/** `/workspace/image/poster` → `{ siteKey: "image", segments: ["poster"] }`; the desk itself → `siteKey: null`. */
export function parseSiteWorkspacePath(pathname: string): { siteKey: string | null; segments: string[] } {
  const parts = pathname.split("?")[0].split("#")[0].split("/").filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  if (parts[0] !== "workspace" || parts.length < 2) return { siteKey: null, segments: [] };
  return { siteKey: parts[1], segments: parts.slice(2) };
}

/** Historical site keys that still arrive from stored rows → today's key. */
const SITE_WORKSPACE_KEY_ALIASES: Readonly<Record<string, string>> = { money: "finance" };
/** Ids that name the main site itself, never a site workspace. */
const NOT_A_SITE_WORKSPACE = new Set(["oceanleo", "home", "portal"]);
const SITE_WORKSPACE_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * A stored `site_id` → the key of its workspace under `/workspace/<key>`, or "" when it does not name a site
 * (empty, the main site, or not a plain key). Aliases: `money` → `finance`.
 */
export function siteWorkspaceKey(siteId: string | null | undefined): string {
  const raw = String(siteId ?? "").trim().toLowerCase();
  const key = Object.prototype.hasOwnProperty.call(SITE_WORKSPACE_KEY_ALIASES, raw)
    ? SITE_WORKSPACE_KEY_ALIASES[raw]
    : raw;
  if (!key || NOT_A_SITE_WORKSPACE.has(key) || !SITE_WORKSPACE_KEY.test(key)) return "";
  return key;
}
