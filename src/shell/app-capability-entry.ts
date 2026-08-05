// ============================================================================
// @oceanleo/ui — 操控台按键条的数据面：这个 app 配了哪几件工具
// ----------------------------------------------------------------------------
// 一个 app 的操控台里要长出哪几枚**按自己名字命名**的按钮，答案不在前端。
// 它来自 W10 手写的清册 `oceandino:scripts/data/oceanleo-plugin-registry.json`
// （一件工具问一次「哪些 app 需要它」，每条都要写理由；写不出理由就不发按键），
// 经生成器算成派生视图 `oceandino:scripts/data/oceanleo-app-plugins.json`，
// 再由本仓 `scripts/sync-app-plugins.mjs` 同步进 `./app-plugins-generated.ts`。
//
// **数据源整条换过**（操作员 2026-08-05 裁定）。旧数据 `oceanleo-app-capability-map.json`
// 是「L4 站级装配单点了这个族 × 该族有编辑器实现 ⇒ 发按钮」算出来的：前者是一张按 12 个
// 货架位次凑数的素材备货配额单，后者只说明这个族有编辑器实现，两个条件都与「这个 app 的
// 用户需不需要这件工具」无关。它算出 2177 枚按钮铺在 532 个 app 上（中位数 5 枚/app）。
// 那条通路连同它的生成物一起删掉了，不留第二份数据。
//
// 只有**非编辑类**工具进这张表。编辑类工具（图片编辑器、PPT 编辑器…）的入口是
// 「用户从库里打开一件素材」，它们没有按键，所以清册里根本没有它们；`PLUGIN_RUNTIMES`
// 那三个内核是兜底闸：万一有编辑类条目混进数据，它在这里就长不成按钮。
//
// **本文件不得出现任何站点清单、app 清单或工具清单**（删掉清册里一行，对应按钮必须
// 消失）。这里只有「怎么按 (siteKey, appId) 查表」和「怎么把选中态编进 URL」两件事，
// 全部是纯函数，没有 React、没有 JSX——focused test 可以直接 import。
//
// 运行时覆盖（`registerAppCapabilityMap`）存在的理由只有一个：宿主/判据脚本要能在不
// 重新发包的前提下换一份数据来验「数据驱动」。生产路径上没人调它。
// ============================================================================

import { GENERATED_APP_PLUGIN_MAP } from "./app-plugins-generated";

/** 清册派生视图的 schema 名（与 W10 的生成器逐字对齐；对不上的数据一律不采信）。 */
export const APP_CAPABILITY_MAP_SCHEMA = "oceanleo.app-plugins.v1";

/**
 * 选中态在 URL 上的键名：`/workspace/<appId>?cap=<工具 id>`。
 *
 * 与 `?fn=` 同一套约定（单一事实源在 URL，组件受控），但**刻意是另一个键**：
 * `?fn=` 选的是「哪个 app」，`cap` 选的是「这个 app 里打开哪件工具」，两者正交。
 * 路由本体必须仍是 `/workspace/<appId>`——打开工具只加 query，不许跳出 app。
 */
export const APP_CAPABILITY_QUERY_KEY = "cap";

/**
 * 三个非编辑类运行时内核（分类裁定 §4.3：`geo-map` 3 件、`grid` 3 件、
 * `interactive-doc` 15 件，共 21 件）。
 *
 * 这不是「族清单」——它是内核的闭集，也是**编辑类条目混进数据时的兜底闸**：
 * 编辑类工具（`image` / `deck` / `richdoc` / `design-canvas` …）的 runtime 不在这三个
 * 里，于是它即使被写进清册也长不出按键。`scripts/sync-app-plugins.mjs` 有同一份表并在
 * 生成时就报错：生成器负责让坏数据进不来，本层负责让坏数据即使进来了也不渲染。
 *
 * 注意 `grid` 内核一身二任：它既是编辑类的「表格编辑器」（打开用户上传的 xlsx），
 * 又是台账 / 文献矩阵 / 三表模型三件非编辑类工具的渲染内核。入口规则不同，内核相同。
 */
const PLUGIN_RUNTIMES = new Set(["geo-map", "grid", "interactive-doc"]);

/** 一枚按钮 = 清册里的一件工具。字段形状与 W10 的派生视图逐字对齐。 */
export interface AppCapabilityEntry {
  /** 清册里的工具 id，如 `ledger`。选中态的稳定键，也是 `?cap=` 的取值。 */
  id: string;
  /** 按钮文案 = 这件工具的中文名（如「台账」）。 */
  label: string;
  /** 渲染内核：`geo-map` / `grid` / `interactive-doc`。 */
  runtime: string;
  /** 这件工具的规格文档路径（`docs/specs/oceanleo-plugins-v1/…`），承载层与人都要用。 */
  doc: string;
}

/** W10 派生视图在共享包里的发布形状。键是拍平后的 `<siteKey>/<appId>`。 */
export interface AppCapabilityMap {
  schema: string;
  generatedAt?: string;
  source?: string;
  /** 键是 `<siteKey>/<appId>`；值是该 app 的按钮，顺序即按钮顺序。 */
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
 * 一条数据是否可用。**fail-closed**：四个字段缺一不可，`runtime` 还必须是三个非编辑类
 * 内核之一——少了 `runtime` 或 `doc` 的按钮点下去无处可挂，长出来只会是死按钮。
 *
 * 额外挡一条红线：面向用户的文案里不许出现「插件」（该词已被 35 个站的 `/plugins`
 * MCP 连接器目录占用）。数据里真写了这个词，这枚按钮不渲染，而不是把词带到界面上。
 */
export function isUsableAppCapabilityEntry(
  entry: AppCapabilityEntry | null | undefined,
): boolean {
  if (entry == null || typeof entry !== "object") return false;
  const filled = (value: unknown) =>
    typeof value === "string" && value.trim() !== "";
  if (
    !filled(entry.id) ||
    !filled(entry.label) ||
    !filled(entry.runtime) ||
    !filled(entry.doc)
  ) {
    return false;
  }
  if (!PLUGIN_RUNTIMES.has(entry.runtime.trim())) return false;
  return !entry.label.includes("插件");
}

/**
 * 纯解析：给一份清册，问 `(siteKey, appId)` 该有哪几枚按钮。
 *
 * schema 对不上一律返回空数组——宁可这个 app 一枚按钮都没有，也不拿一份形状未知的
 * 数据去猜。同一件工具在同一个 app 里出现两次时只保留第一条（按钮不重复）。
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
    const id = row.id.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: row.label.trim(),
      runtime: row.runtime.trim(),
      doc: row.doc.trim(),
    });
  }
  return out;
}

let overrideMap: AppCapabilityMap | null = null;

/**
 * 换掉当前生效的清册（传 `null` 恢复随包发布的那一份）。
 * 判据脚本用它验「按钮真的由数据驱动」；生产宿主不需要调。
 */
export function registerAppCapabilityMap(map: AppCapabilityMap | null): void {
  overrideMap = map;
}

/** 当前生效的清册：运行时覆盖优先，否则是随包发布的生成文件。 */
export function readAppCapabilityMap(): AppCapabilityMap {
  return overrideMap ?? GENERATED_APP_PLUGIN_MAP;
}

/** 这个 app 该有的按钮（顺序即清册里的顺序）。 */
export function appCapabilityEntries(
  siteKey: string,
  appId: string,
): AppCapabilityEntry[] {
  return resolveAppCapabilityEntries(readAppCapabilityMap(), siteKey, appId);
}

/**
 * 按工具 id 取这个 app 的某一枚按钮；不在清册里就是 `null`（不猜、不兜底）。
 * 函数名沿用旧名，只为不动 36 个消费站的 import 面；参数是工具 id。
 */
export function appCapabilityEntryByFamily(
  siteKey: string,
  appId: string,
  pluginId: string,
): AppCapabilityEntry | null {
  const wanted = (pluginId || "").trim();
  if (!wanted) return null;
  return (
    appCapabilityEntries(siteKey, appId).find((entry) => entry.id === wanted) ??
    null
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
 * 从 query 串解析出**这个 app 真有的**那件工具。
 * `?cap=` 指向别的 app 的工具、或指向已被删掉的清册行 → `null`，界面回落到 app 本身。
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
 * 把选中态写回 query 串：给工具 id 就设 `cap`，给空就删掉它。
 * 返回值形如 `"?cap=ledger"` 或 `""`，其余参数原样保留、相对顺序不变。
 */
export function appCapabilitySearch(
  search: string,
  pluginId: string | null,
): string {
  const raw = (search || "").trim();
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const next = (pluginId || "").trim();
  if (next) params.set(APP_CAPABILITY_QUERY_KEY, next);
  else params.delete(APP_CAPABILITY_QUERY_KEY);
  const query = params.toString();
  return query ? `?${query}` : "";
}
