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
