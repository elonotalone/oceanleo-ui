/** Route parsing shared by every SiteCatalogConsole consumer. */

import type { OceanLeoWorkspaceRouteContract } from "../contracts/site-manifest";

function decoded(segment: string | undefined): string {
  if (!segment) return "";
  try {
    return decodeURIComponent(segment).trim();
  } catch {
    return "";
  }
}

function segmentAfterBase(pathname: string, basePath: string): string {
  const parts = (pathname || "").split("/").filter(Boolean);
  const base = (basePath || "").split("/").filter(Boolean);
  if (base.length === 0) return "";
  for (let index = 0; index <= parts.length - base.length; index += 1) {
    if (base.every((segment, offset) => parts[index + offset] === segment)) {
      return decoded(parts[index + base.length]);
    }
  }
  return "";
}

export function workspaceAppIdFromPath(
  pathname: string,
  route?: Pick<OceanLeoWorkspaceRouteContract, "canonicalBasePath">,
): string {
  return segmentAfterBase(
    pathname,
    route?.canonicalBasePath || "/workspace",
  );
}

export function historySessionIdFromPath(
  pathname: string,
  route?: Pick<OceanLeoWorkspaceRouteContract, "historyBasePath">,
): string {
  return segmentAfterBase(pathname, route?.historyBasePath || "/history");
}

export function legacyWorkspaceAppId(
  search: string | URLSearchParams,
  route?: Pick<OceanLeoWorkspaceRouteContract, "legacyQueryKeys">,
): string {
  const params =
    search instanceof URLSearchParams
      ? search
      : new URLSearchParams(String(search || "").replace(/^\?/, ""));
  for (const key of route?.legacyQueryKeys || ["fn", "mode"]) {
    const value = (params.get(key) || "").trim();
    if (value) return value;
  }
  return "";
}

export function workspaceAppHref(
  appId: string,
  route?: Pick<OceanLeoWorkspaceRouteContract, "canonicalBasePath">,
): string {
  const id = (appId || "").trim();
  const base = route?.canonicalBasePath || "/workspace";
  return id ? `${base}/${encodeURIComponent(id)}` : base;
}

export function historySessionHref(
  sessionId: string,
  route?: Pick<OceanLeoWorkspaceRouteContract, "historyBasePath">,
): string {
  const id = (sessionId || "").trim();
  const base = route?.historyBasePath || "/history";
  return id ? `${base}/${encodeURIComponent(id)}` : base;
}
