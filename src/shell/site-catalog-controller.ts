import type { OceanLeoWorkspaceRouteContract } from "../contracts/site-manifest";
import {
  historySessionHref,
  historySessionIdFromPath,
  legacyWorkspaceAppId,
  workspaceAppHref,
  workspaceAppIdFromPath,
} from "./workspace-route";

const DEFAULT_ROUTE: OceanLeoWorkspaceRouteContract = {
  canonicalBasePath: "/workspace",
  historyBasePath: "/history",
  legacyQueryKeys: ["fn", "mode"],
};

export interface SiteCatalogRouteInput {
  pathname: string;
  search?: string;
  controlledValue?: string;
  embed?: boolean;
  solo?: boolean;
  historyAppId?: string;
  aliases?: Readonly<Record<string, string>>;
  knownAppIds: ReadonlySet<string>;
  route?: OceanLeoWorkspaceRouteContract;
}

export interface SiteCatalogRouteState {
  pathAppId: string;
  historySessionId: string;
  legacyAppId: string;
  requestedAppId: string;
  activeAppId: string;
  invalidAppId: string;
}

function activeRoute(
  route?: OceanLeoWorkspaceRouteContract,
): OceanLeoWorkspaceRouteContract {
  return route || DEFAULT_ROUTE;
}

export function resolveSiteCatalogRoute(
  input: SiteCatalogRouteInput,
): SiteCatalogRouteState {
  const route = activeRoute(input.route);
  const pathAppId = workspaceAppIdFromPath(input.pathname, route);
  const historySessionId = historySessionIdFromPath(input.pathname, route);
  const legacyAppId = pathAppId
    ? ""
    : legacyWorkspaceAppId(input.search || "", route);
  const raw = String(
    input.historyAppId ||
      pathAppId ||
      legacyAppId ||
      ((input.embed || input.solo) ? input.controlledValue : "") ||
      "",
  ).trim();
  const requestedAppId =
    input.historyAppId === "home-agent"
      ? "agent"
      : (!input.historyAppId && input.aliases?.[raw]) || raw;
  const invalidAppId =
    requestedAppId && !input.knownAppIds.has(requestedAppId)
      ? requestedAppId
      : "";
  return {
    pathAppId,
    historySessionId,
    legacyAppId,
    requestedAppId,
    activeAppId: invalidAppId ? "" : requestedAppId,
    invalidAppId,
  };
}

export function canonicalCatalogAppHref(
  appId: string,
  search = "",
  preserveQuery = false,
  route?: OceanLeoWorkspaceRouteContract,
): string {
  const contract = activeRoute(route);
  const base = workspaceAppHref(appId, contract);
  if (!preserveQuery) return base;
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  for (const key of contract.legacyQueryKeys) params.delete(key);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function catalogCanonicalRedirect(
  state: SiteCatalogRouteState,
  pathname: string,
  search = "",
  embed = false,
  route?: OceanLeoWorkspaceRouteContract,
): string | null {
  const contract = activeRoute(route);
  const workspaceIndex =
    pathname.replace(/\/+$/, "") ===
    contract.canonicalBasePath.replace(/\/+$/, "");
  if (
    embed ||
    state.historySessionId ||
    (state.pathAppId && state.pathAppId === state.activeAppId) ||
    !state.activeAppId ||
    (!state.pathAppId && !workspaceIndex)
  ) {
    return null;
  }
  return canonicalCatalogAppHref(
    state.activeAppId,
    search,
    true,
    contract,
  );
}

export type SiteCatalogNavigation =
  | { kind: "host"; appId: string }
  | { kind: "route"; appId: string; href: string };

export function catalogNavigationForChange(
  appId: string,
  options: {
    embed?: boolean;
    historySessionId?: string;
    route?: OceanLeoWorkspaceRouteContract;
  } = {},
): SiteCatalogNavigation {
  if (options.embed) return { kind: "host", appId };
  if (options.historySessionId && !appId) {
    return {
      kind: "route",
      appId,
      href: historySessionHref("", activeRoute(options.route)),
    };
  }
  return {
    kind: "route",
    appId,
    href: workspaceAppHref(appId, activeRoute(options.route)),
  };
}
