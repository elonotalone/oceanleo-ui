/**
 * Material library scoping (两段式作用域).
 *
 * `primary` 此 app ｜ `site` 本站素材。
 *
 * 曾经的第三档 `more`（更多素材 = 全平台）已按 `01-decisions.md` D1 整层下线：
 * 每个站只展示属于该站的素材，用户可见的货架不再兼任「每个高级功能在每个站都能跑」
 * 的测试夹具——那件事由 W6 的跨站能力一致性门禁接管。
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

export type MaterialLibraryLevel = "primary" | "site";

export const MATERIAL_LIBRARY_LEVELS: readonly MaterialLibraryLevel[] = [
  "primary",
  "site",
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
    originSiteKey: siteKey,
    originAppId: scope.level === "primary" ? appId : "",
  };
}

/**
 * Fail-closed 判据（合同 §3 W4 必做 2）。非空即「这个 scope 没法被真正执行」，
 * 字符串本身是可直接展示的中文原因。
 *
 * 两层都以 `originSiteKey` 为前提：没有站点身份就没有「本站」，而缺了它旧实现会
 * 悄悄退化成全平台搜索，把别站素材摆到本站货架上——D1 要根除的正是这个。
 */
export function materialScopeViolation(scope: {
  level: MaterialLibraryLevel;
  siteKey?: string;
  appId?: string;
}): string {
  const siteKey = String(scope.siteKey ?? "").trim();
  const appId = String(scope.appId ?? "").trim();
  if (!siteKey) {
    return `本站素材缺少 ${MATERIAL_SCOPE_PARAM_NAMES.siteKey}，已按 fail-closed 停用（不退化成全平台搜索）。`;
  }
  if (scope.level === "primary" && !appId) {
    return `此 app 素材缺少 ${MATERIAL_SCOPE_PARAM_NAMES.appId}，已按 fail-closed 停用。`;
  }
  return "";
}

/** `ArtifactApiResult.code` 上出现它就表示请求被 fail-closed 拦下，压根没发出去。 */
export const MATERIAL_SCOPE_UNENFORCEABLE_CODE = "scope-unenforceable";

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

/** `olctx:v1:<siteKey>:app:<encodeURIComponent(appId)>` — the app identity a binding carries. */
function appContextParts(
  contextId: string,
): { siteKey: string; appId: string } | null {
  const match = /^olctx:v1:([^:]+):app:(.+)$/.exec(
    String(contextId || "").trim(),
  );
  if (!match) return null;
  let appId = match[2];
  try {
    appId = decodeURIComponent(appId);
  } catch {
    // A malformed escape is still a usable literal app id.
  }
  return { siteKey: match[1], appId: appId.trim() };
}

/**
 * Which app a material belongs to. The three sources disagree by construction:
 * durable rows carry `owner.originAppId`, official template catalog rows only
 * carry `template_material_app_id`, and an artifact minted on another site is
 * tied to this one through its binding context id alone. Returns "" when none
 * of them answers.
 */
export function libraryItemOriginAppId(
  item: LibraryItem | null | undefined,
  siteKey = "",
): string {
  if (!item) return "";
  const site = String(siteKey ?? "").trim();
  const durable = isDurableLibraryItem(item);
  const ownerAppId = durable
    ? String(item.artifact.owner.originAppId ?? "").trim()
    : "";
  const ownerSiteKey = durable
    ? String(item.artifact.owner.originSiteKey ?? "").trim()
    : "";
  // An artifact born elsewhere belongs, on this site, to the app its binding
  // names — not to the app it happened to be minted in.
  if (ownerAppId && (!site || !ownerSiteKey || ownerSiteKey === site)) {
    return ownerAppId;
  }
  const templateAppId =
    typeof item.meta?.template_material_app_id === "string"
      ? item.meta.template_material_app_id.trim()
      : "";
  if (templateAppId) return templateAppId;
  for (const binding of durable ? item.artifact.bindings : []) {
    const parts = appContextParts(binding.contextId);
    if (parts?.appId && (!site || parts.siteKey === site)) return parts.appId;
  }
  return ownerAppId;
}

/**
 * 一份素材在某个 app 下的归属（D3）。同一个 `artifact_id` 可以绑在多个 `app_id` 上
 * ——image 站有 9 组——而「同一视图只出一张卡」与「点哪个 app 进哪个工作台」这两条
 * 要求同时成立的前提，就是多归属在数据层可枚举而不是被去重键吃掉。
 */
export interface MaterialAppAttribution {
  /** `olctx:v1:<siteKey>:app:<appId>` 的 appId 段，已 decodeURIComponent。 */
  appId: string;
  /** 该归属所属站点 key；解析不出时 ""。 */
  siteKey: string;
  /**
   * 主归属排序位。durable 条目取 `binding.rank`；铸造地（`owner.originAppId`）
   * 没有自己的 binding rank 时取 0，因为那就是这份素材的老家；其余取
   * `Number.MAX_SAFE_INTEGER`。
   */
  position: number;
  /** 人类可读 app 名；数据层解析不出时为 ""，呈现层自行回退到 appId。 */
  label: string;
  /** 来自 `owner.originAppId`（铸造地）而非 binding。 */
  origin: boolean;
  /** `binding.role`；铸造地归属固定为 `"owner"`。 */
  role: string;
}

/** 合并后的 entry 把归属并集写在 `libraryItem.meta` 的这个 key 下。 */
export const MATERIAL_APP_BINDINGS_META_KEY = "material_app_bindings";

const APP_LABEL_META_KEYS = [
  "template_material_app_title",
  "template_material_app_name",
  "origin_app_title",
  "app_title",
  "app_name",
] as const;

function attributionLabelHint(item: LibraryItem): string {
  for (const key of APP_LABEL_META_KEYS) {
    const value = item.meta?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function compareAttributions(
  a: MaterialAppAttribution,
  b: MaterialAppAttribution,
): number {
  return a.position - b.position || a.appId.localeCompare(b.appId);
}

/**
 * 并集，不是拼接：同一个 `(siteKey, appId)` 出现多次时取最小 position、保留任一非空
 * label、`origin` 取或。返回值已排好序，`[0]` 即 D3.3 说的主 app。
 */
export function mergeAppAttributions(
  ...groups: readonly (readonly MaterialAppAttribution[])[]
): MaterialAppAttribution[] {
  const byApp = new Map<string, MaterialAppAttribution>();
  for (const group of groups) {
    for (const attribution of group) {
      if (!attribution.appId) continue;
      const key = `${attribution.siteKey}\u0000${attribution.appId}`;
      const existing = byApp.get(key);
      if (!existing) {
        byApp.set(key, { ...attribution });
        continue;
      }
      existing.position = Math.min(existing.position, attribution.position);
      existing.label = existing.label || attribution.label;
      existing.origin = existing.origin || attribution.origin;
      existing.role = existing.role || attribution.role;
    }
  }
  return [...byApp.values()].sort(compareAttributions);
}

/**
 * 一份素材在（可选地）某个站下的全部归属 app。三个来源合流，和
 * `libraryItemOriginAppId` 读的是同一批字段，区别只在这里**不挑一个赢家**：
 * durable 条目的 `owner.originAppId`、官方模板目录行的 `template_material_app_id`、
 * 以及 binding 的 context id。
 *
 * 传 `siteKey` 时只返回该站的归属。站内货架请一律传——不传会把别站的绑定也列出来，
 * 那正是 D1 要根除的污染。
 */
export function libraryItemAppAttributions(
  item: LibraryItem | null | undefined,
  siteKey = "",
): MaterialAppAttribution[] {
  if (!item) return [];
  const site = String(siteKey ?? "").trim();
  const label = attributionLabelHint(item);
  const inScope = (candidate: string): boolean =>
    !site || !candidate || candidate === site;
  const found: MaterialAppAttribution[] = [];
  // `isDurableLibraryItem` 只核对身份三件套，`owner` / `bindings` 仍可能缺席
  // （老投影与手写 fixture 都会）。归属解析不出来是正常输入，不该把货架整个打崩。
  const durable = isDurableLibraryItem(item);
  if (durable) {
    const owner = item.artifact.owner ?? {};
    const ownerAppId = String(owner.originAppId ?? "").trim();
    const ownerSiteKey = String(owner.originSiteKey ?? "").trim();
    if (ownerAppId && inScope(ownerSiteKey)) {
      found.push({
        appId: ownerAppId,
        siteKey: ownerSiteKey || site,
        position: 0,
        label,
        origin: true,
        role: "owner",
      });
    }
    for (const binding of item.artifact.bindings ?? []) {
      const parts = appContextParts(binding.contextId);
      if (!parts?.appId || (site && parts.siteKey !== site)) continue;
      found.push({
        appId: parts.appId,
        siteKey: parts.siteKey,
        position:
          typeof binding.rank === "number" && Number.isFinite(binding.rank)
            ? binding.rank
            : Number.MAX_SAFE_INTEGER,
        label,
        origin: false,
        role: binding.role || "",
      });
    }
  }
  const templateAppId =
    typeof item.meta?.template_material_app_id === "string"
      ? item.meta.template_material_app_id.trim()
      : "";
  const templateSiteKey =
    typeof item.meta?.template_material_site_key === "string"
      ? item.meta.template_material_site_key.trim()
      : "";
  if (templateAppId && inScope(templateSiteKey)) {
    found.push({
      appId: templateAppId,
      siteKey: templateSiteKey || site,
      position: Number.MAX_SAFE_INTEGER,
      label,
      origin: false,
      role: "template",
    });
  }
  return mergeAppAttributions(found);
}

/** 读回 `mergeMaterialEntries` 写下的归属并集；没有就现算。 */
export function libraryItemStoredAppAttributions(
  item: LibraryItem | null | undefined,
  siteKey = "",
): MaterialAppAttribution[] {
  const stored = item?.meta?.[MATERIAL_APP_BINDINGS_META_KEY];
  if (Array.isArray(stored)) {
    return mergeAppAttributions(
      stored.filter(
        (value): value is MaterialAppAttribution =>
          Boolean(value) &&
          typeof value === "object" &&
          typeof (value as MaterialAppAttribution).appId === "string" &&
          Boolean((value as MaterialAppAttribution).appId),
      ),
    );
  }
  return libraryItemAppAttributions(item, siteKey);
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
}

/**
 * Applies the scope the backend was asked for. Until W7 ships, an old backend
 * answers scoped requests with the global page; we narrow it here rather than
 * showing the wrong shelf.
 *
 * 收窄后为空就是空（D1 / 合同 §3 W4 必做 2）。旧实现在这里退回整页，理由是
 * 「空的探索页永远不可接受」；那条理由被操作员推翻了——摆一屏别站素材比空货架糟得多。
 * 数据库侧也证明了这一步不会让任何站变空：677 个 `(site_key, app_id)` 槽位每个恰好
 * 4 份、全部 published。
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
    return { items: [...items], degraded: false };
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
  return { items: kept, degraded: kept.length !== items.length };
}

const warnedScopeKeys = new Set<string>();

/** One console line per degraded scope, so a stale backend is visible but quiet. */
export function warnMaterialScopeDegraded(
  key: string,
  detail: { level: MaterialLibraryLevel },
): void {
  if (warnedScopeKeys.has(key)) return;
  warnedScopeKeys.add(key);
  if (typeof console === "undefined") return;
  console.warn(
    `[material-library] 后端未按合同 §3.2 应用 ${MATERIAL_SCOPE_PARAM_NAMES.siteKey}/` +
      `${MATERIAL_SCOPE_PARAM_NAMES.appId}/${MATERIAL_SCOPE_PARAM_NAMES.types}` +
      `（level=${detail.level}）；已在浏览器侧按作用域收窄本页结果。`,
  );
}

export function resetMaterialScopeWarnings(): void {
  warnedScopeKeys.clear();
}
