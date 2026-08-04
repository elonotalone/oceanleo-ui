// ============================================================================
// @oceanleo/ui — app→功能（高级能力）入口映射的读取与解析（H 波 W2 产出）
// ----------------------------------------------------------------------------
// 目标形态：`docs/architecture/oceanleo-advanced-capability-entry.md` §7(a)。
// 一个 app 的操控台按键条上要长出哪几枚**按自己名字命名**的功能按钮，答案不在前端。
// 它由 W4 从 L4 装配单算出来，落成单一事实源
// `oceandino:scripts/data/oceanleo-app-capability-map.json`，再由本仓
// `scripts/sync-app-capability-map.mjs` 同步进 `./app-capability-map-generated.ts`。
//
// **本文件不得出现任何站点清单、app 清单或族清单**（判据 H1-a：删掉映射里一行，
// 对应按钮必须消失）。这里只有「怎么按 (siteKey, appId) 查表」和「怎么把选中态编进
// URL」两件事，全部是纯函数，没有 React、没有 JSX——focused test 可以直接 import。
//
// 运行时覆盖（`registerAppCapabilityMap`）存在的理由只有一个：宿主/判据脚本要能在不
// 重新发包的前提下换一份映射来验「数据驱动」。生产路径上没人调它。
// ============================================================================

import { GENERATED_APP_CAPABILITY_MAP } from "./app-capability-map-generated";

/** 映射文件的 schema 名（与 W4 的生成器逐字对齐；对不上的映射一律不采信）。 */
export const APP_CAPABILITY_MAP_SCHEMA = "oceanleo.app-capability-map.v1";

/**
 * 选中态在 URL 上的键名：`/workspace/<appId>?cap=<family>`。
 *
 * 与 `?fn=` 同一套约定（单一事实源在 URL，组件受控），但**刻意是另一个键**：
 * `?fn=` 选的是「哪个 app」，`cap` 选的是「这个 app 里打开哪个功能」，两者正交。
 * 路由本体必须仍是 `/workspace/<appId>`——功能只加 query，不许跳出 app（判据 H1-d）。
 */
export const APP_CAPABILITY_QUERY_KEY = "cap";

/** 一枚功能按钮 = L3 族的一条能力声明。字段形状与 W4 的 JSON 逐字对齐。 */
export interface AppCapabilityEntry {
  /** L3 族 id，如 `financial-calculator`。选中态的稳定键，也是 `?cap=` 的取值。 */
  family: string;
  /** 按钮文案 = 该族的中文名（如「金融计算器」）。24 个名字全部现成，不另起。 */
  label: string;
  /** 编辑器适配器 id，与 `workbench-capability-registry` 的能力名一致。 */
  editorCapability: string;
  /** 该族产出的产物类型，与 `artifact-contract` 的 `ARTIFACT_TYPES` 一致。 */
  artifactType: string;
}

/** W4 交付的映射文件整体形状。 */
export interface AppCapabilityMap {
  schema: string;
  generatedAt?: string;
  source?: string;
  /** 键是 `<siteKey>/<appId>`；值是该 app 的功能按钮，顺序即按钮顺序。 */
  apps: Record<string, AppCapabilityEntry[]>;
}

/** 查表键：`<siteKey>/<appId>`。两段都 trim，空段直接判无。 */
export function appCapabilityMapKey(siteKey: string, appId: string): string {
  const site = (siteKey || "").trim();
  const app = (appId || "").trim();
  if (!site || !app) return "";
  return `${site}/${app}`;
}

/**
 * 一条映射行是否可用。**fail-closed**：四个字段缺一不可——
 * 少了 `editorCapability` 或 `artifactType` 的按钮点下去无处可挂，长出来只会是死按钮。
 *
 * 额外挡一条红线：面向用户的文案里不许出现「插件」（该词已被 35 个站的 `/plugins`
 * MCP 连接器目录占用）。映射里真写了这个词，这枚按钮不渲染，而不是把词带到界面上。
 */
export function isUsableAppCapabilityEntry(
  entry: AppCapabilityEntry | null | undefined,
): boolean {
  if (entry == null || typeof entry !== "object") return false;
  const filled = (value: unknown) =>
    typeof value === "string" && value.trim() !== "";
  if (
    !filled(entry.family) ||
    !filled(entry.label) ||
    !filled(entry.editorCapability) ||
    !filled(entry.artifactType)
  ) {
    return false;
  }
  return !entry.label.includes("插件");
}

/**
 * 纯解析：给一份映射，问 `(siteKey, appId)` 该有哪几枚按钮。
 *
 * schema 对不上一律返回空数组——宁可这个 app 一枚功能按钮都没有，也不拿一份形状未知的
 * 数据去猜。同一族在同一个 app 里出现两次时只保留第一条（按钮不重复）。
 */
export function resolveAppCapabilityEntries(
  map: AppCapabilityMap | null | undefined,
  siteKey: string,
  appId: string,
): AppCapabilityEntry[] {
  if (!map || map.schema !== APP_CAPABILITY_MAP_SCHEMA) return [];
  const key = appCapabilityMapKey(siteKey, appId);
  if (!key) return [];
  const rows = map.apps?.[key];
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: AppCapabilityEntry[] = [];
  for (const row of rows) {
    if (!isUsableAppCapabilityEntry(row)) continue;
    const family = row.family.trim();
    if (seen.has(family)) continue;
    seen.add(family);
    out.push({
      family,
      label: row.label.trim(),
      editorCapability: row.editorCapability.trim(),
      artifactType: row.artifactType.trim(),
    });
  }
  return out;
}

let overrideMap: AppCapabilityMap | null = null;

/**
 * 换掉当前生效的映射（传 `null` 恢复随包发布的那一份）。
 * 判据脚本用它验「按钮真的由数据驱动」；生产宿主不需要调。
 */
export function registerAppCapabilityMap(map: AppCapabilityMap | null): void {
  overrideMap = map;
}

/** 当前生效的映射：运行时覆盖优先，否则是随包发布的生成文件。 */
export function readAppCapabilityMap(): AppCapabilityMap {
  return overrideMap ?? GENERATED_APP_CAPABILITY_MAP;
}

/** 这个 app 该有的功能按钮（顺序即映射里的顺序）。 */
export function appCapabilityEntries(
  siteKey: string,
  appId: string,
): AppCapabilityEntry[] {
  return resolveAppCapabilityEntries(readAppCapabilityMap(), siteKey, appId);
}

/** 按族 id 取这个 app 的某一枚功能；不在映射里就是 `null`（不猜、不兜底）。 */
export function appCapabilityEntryByFamily(
  siteKey: string,
  appId: string,
  family: string,
): AppCapabilityEntry | null {
  const wanted = (family || "").trim();
  if (!wanted) return null;
  return (
    appCapabilityEntries(siteKey, appId).find(
      (entry) => entry.family === wanted,
    ) ?? null
  );
}

/** 从 query 串里读 `?cap=` 的原始取值（不校验它是否属于当前 app）。 */
export function appCapabilityFamilyFromSearch(search: string): string {
  const raw = (search || "").trim();
  if (!raw) return "";
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  return (params.get(APP_CAPABILITY_QUERY_KEY) || "").trim();
}

/**
 * 从 query 串解析出**这个 app 真有的**那枚功能。
 * `?cap=` 指向别的 app 的族、或指向已被删掉的映射行 → `null`，界面回落到 app 本身。
 */
export function appCapabilityFromSearch(
  search: string,
  siteKey: string,
  appId: string,
): AppCapabilityEntry | null {
  return appCapabilityEntryByFamily(
    siteKey,
    appId,
    appCapabilityFamilyFromSearch(search),
  );
}

/**
 * 把选中态写回 query 串：给族 id 就设 `cap`，给空就删掉它。
 * 返回值形如 `"?cap=ledger"` 或 `""`，其余参数原样保留、相对顺序不变。
 */
export function appCapabilitySearch(
  search: string,
  family: string | null,
): string {
  const raw = (search || "").trim();
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const next = (family || "").trim();
  if (next) params.set(APP_CAPABILITY_QUERY_KEY, next);
  else params.delete(APP_CAPABILITY_QUERY_KEY);
  const query = params.toString();
  return query ? `?${query}` : "";
}
