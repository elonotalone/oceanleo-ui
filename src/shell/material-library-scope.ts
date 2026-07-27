/**
 * Material library scoping (三段式作用域).
 *
 * `primary` 此 app ｜ `site` 本站素材 ｜ `more` 更多素材（全平台）。
 *
 * The wire parameter names below are locked with the backend owner in
 * `docs/work-logs/2026-07/oceanleo-cards-explore-materials/00-dispatch-contract.md` §3.2:
 * `artifactTypes` / `originSiteKey` / `originAppId`. Renaming either side
 * requires editing that contract section first.
 */

import {
  ARTIFACT_TYPES,
  canonicalArtifactContextId,
  type ArtifactType,
} from "./artifact-contract";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";

export type MaterialLibraryLevel = "primary" | "site" | "more";

export const MATERIAL_LIBRARY_LEVELS: readonly MaterialLibraryLevel[] = [
  "primary",
  "site",
  "more",
];

/** Contract §3.1 — the scope shape W7 mirrors on the backend. */
export interface MaterialScope {
  level: MaterialLibraryLevel;
  siteKey?: string;
  appId?: string;
  types: ArtifactType[];
}

/** Contract §3.2 — every wire name this client is allowed to send. */
export const MATERIAL_SCOPE_PARAM_NAMES = {
  types: "artifactTypes",
  siteKey: "originSiteKey",
  appId: "originAppId",
} as const;

export interface MaterialLibrarySearchParams {
  q: string;
  role: string;
  /** Legacy single-value filter; kept so a one-type request stays exact today. */
  artifactType: ArtifactType | "";
  /** §3.2 `artifactTypes` CSV. */
  artifactTypes: string;
  /** §3.2 `originSiteKey`. */
  originSiteKey: string;
  /** §3.2 `originAppId`. */
  originAppId: string;
}

function uniqueTypes(
  values: readonly (ArtifactType | "")[] | undefined,
): ArtifactType[] {
  const seen = new Set<ArtifactType>();
  for (const value of values || []) {
    if (value && (ARTIFACT_TYPES as readonly string[]).includes(value)) {
      seen.add(value);
    }
  }
  return [...seen];
}

/**
 * Multi-select chips win; the legacy single `taxonomy` is the fallback so the
 * 36 sites still on `ExploreConfig.type` keep today's behaviour.
 */
export function materialScopeTypes(input: {
  types?: readonly ArtifactType[];
  taxonomy?: ArtifactType | "";
}): ArtifactType[] {
  const selected = uniqueTypes(input.types);
  if (selected.length > 0) return selected;
  return uniqueTypes([input.taxonomy || ""]);
}

export function materialTypesCsv(types: readonly ArtifactType[]): string {
  return uniqueTypes(types).join(",");
}

export function materialTypesFromCsv(value: string): ArtifactType[] {
  return uniqueTypes(
    String(value || "")
      .split(",")
      .map((part) => part.trim() as ArtifactType),
  );
}

/**
 * Builds the §3.2 parameter set. Pure so the wire contract can be asserted
 * without a network stub.
 */
export function materialLibrarySearchParams(scope: {
  level: MaterialLibraryLevel;
  query?: string;
  role?: string;
  siteKey?: string;
  appId?: string;
  types?: readonly ArtifactType[];
  /** True when the caller reached here through the legacy single-type prop. */
  legacyTaxonomyOnly?: boolean;
}): MaterialLibrarySearchParams {
  const types = uniqueTypes(scope.types);
  const siteKey = String(scope.siteKey ?? "").trim();
  const appId = String(scope.appId ?? "").trim();
  const scoped = scope.level === "site" || scope.level === "primary";
  return {
    q: String(scope.query ?? "").trim(),
    role: String(scope.role ?? "").trim(),
    // A single type stays expressible in the pre-§3.2 parameter, so keep
    // sending it: an old backend still filters exactly, a new one agrees.
    artifactType: types.length === 1 ? types[0] : "",
    artifactTypes:
      scope.legacyTaxonomyOnly && types.length <= 1
        ? ""
        : materialTypesCsv(types),
    originSiteKey: scoped ? siteKey : "",
    originAppId: scope.level === "primary" ? appId : "",
  };
}

export function materialLibrarySearchQuery(
  params: MaterialLibrarySearchParams,
): URLSearchParams {
  const query = new URLSearchParams();
  for (const [key, value] of [
    ["q", params.q],
    ["artifactType", params.artifactType],
    [MATERIAL_SCOPE_PARAM_NAMES.types, params.artifactTypes],
    [MATERIAL_SCOPE_PARAM_NAMES.siteKey, params.originSiteKey],
    [MATERIAL_SCOPE_PARAM_NAMES.appId, params.originAppId],
    ["role", params.role],
  ] as const) {
    if (value) query.set(key, value);
  }
  return query;
}

export function materialScopeRequestsBackendScope(
  params: MaterialLibrarySearchParams,
): boolean {
  return Boolean(
    params.artifactTypes || params.originSiteKey || params.originAppId,
  );
}

/**
 * A material belongs to a site when the catalog says so — either the artifact
 * was minted there (`owner.originSiteKey`) or it is bound to one of that
 * site's canonical app contexts (`olctx:v1:<siteKey>:app:<appId>`).
 */
export function libraryItemMatchesOriginScope(
  item: LibraryItem,
  scope: { siteKey?: string; appId?: string },
): boolean {
  if (!isDurableLibraryItem(item)) return false;
  const siteKey = String(scope.siteKey ?? "").trim();
  const appId = String(scope.appId ?? "").trim();
  if (!siteKey && !appId) return true;
  const owner = item.artifact.owner;
  if (appId) {
    if (owner.originAppId === appId && (!siteKey || owner.originSiteKey === siteKey)) {
      return true;
    }
    const contextId = canonicalArtifactContextId(siteKey, appId);
    return Boolean(
      contextId &&
        item.artifact.bindings.some(
          (binding) => binding.contextId === contextId,
        ),
    );
  }
  if (owner.originSiteKey === siteKey) return true;
  const prefix = `olctx:v1:${siteKey}:`;
  return item.artifact.bindings.some((binding) =>
    binding.contextId.startsWith(prefix),
  );
}

export function libraryItemMatchesTypes(
  item: LibraryItem,
  types: readonly ArtifactType[],
): boolean {
  if (types.length === 0) return true;
  return Boolean(item.artifactType && types.includes(item.artifactType));
}

export interface MaterialScopeFilterOutcome {
  items: LibraryItem[];
  /** The backend ignored at least one §3.2 parameter. */
  degraded: boolean;
  /** Scope was unenforceable, so the unscoped page is shown instead. */
  showedUnscoped: boolean;
}

/**
 * Applies the scope the backend was asked for. Until W7 ships, an old backend
 * answers scoped requests with the global page; we narrow it here rather than
 * showing the wrong shelf, and fall back to the unscoped page when narrowing
 * would leave an empty list (an empty explore page is never acceptable).
 */
export function applyMaterialScope(
  items: readonly LibraryItem[],
  scope: {
    siteKey?: string;
    appId?: string;
    types: readonly ArtifactType[];
  },
): MaterialScopeFilterOutcome {
  const scopeSite = String(scope.siteKey ?? "").trim();
  const scopeApp = String(scope.appId ?? "").trim();
  const wantsScope = Boolean(scopeSite || scopeApp);
  const wantsTypes = scope.types.length > 1;
  if (!wantsScope && !wantsTypes) {
    return { items: [...items], degraded: false, showedUnscoped: false };
  }
  const kept = items.filter(
    (item) =>
      (!wantsScope ||
        libraryItemMatchesOriginScope(item, {
          siteKey: scopeSite,
          appId: scopeApp,
        })) &&
      (!wantsTypes || libraryItemMatchesTypes(item, scope.types)),
  );
  const degraded = kept.length !== items.length;
  if (kept.length > 0 || items.length === 0) {
    return { items: kept, degraded, showedUnscoped: false };
  }
  return { items: [...items], degraded: true, showedUnscoped: true };
}

const warnedScopeKeys = new Set<string>();

/** One console line per degraded scope, so a stale backend is visible but quiet. */
export function warnMaterialScopeDegraded(
  key: string,
  detail: { level: MaterialLibraryLevel; showedUnscoped: boolean },
): void {
  if (warnedScopeKeys.has(key)) return;
  warnedScopeKeys.add(key);
  if (typeof console === "undefined") return;
  console.warn(
    `[material-library] 后端未按合同 §3.2 应用 ${MATERIAL_SCOPE_PARAM_NAMES.siteKey}/` +
      `${MATERIAL_SCOPE_PARAM_NAMES.appId}/${MATERIAL_SCOPE_PARAM_NAMES.types}` +
      `（level=${detail.level}）；` +
      (detail.showedUnscoped
        ? "已退回全局搜索结果。"
        : "已在浏览器侧按作用域收窄本页结果。"),
  );
}

export function resetMaterialScopeWarnings(): void {
  warnedScopeKeys.clear();
}
