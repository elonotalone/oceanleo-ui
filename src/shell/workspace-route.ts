/** Route parsing shared by every SiteCatalogConsole consumer. */

function decoded(segment: string | undefined): string {
  if (!segment) return "";
  try {
    return decodeURIComponent(segment).trim();
  } catch {
    return "";
  }
}

export function workspaceAppIdFromPath(pathname: string): string {
  const parts = (pathname || "").split("/").filter(Boolean);
  const index = parts.indexOf("workspace");
  return index >= 0 ? decoded(parts[index + 1]) : "";
}

export function historySessionIdFromPath(pathname: string): string {
  const parts = (pathname || "").split("/").filter(Boolean);
  const index = parts.indexOf("history");
  return index >= 0 ? decoded(parts[index + 1]) : "";
}

export function workspaceAppHref(appId: string): string {
  const id = (appId || "").trim();
  return id ? `/workspace/${encodeURIComponent(id)}` : "/workspace";
}

export function historySessionHref(sessionId: string): string {
  const id = (sessionId || "").trim();
  return id ? `/history/${encodeURIComponent(id)}` : "/history";
}
