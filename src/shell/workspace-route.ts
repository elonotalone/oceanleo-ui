/** Route parsing shared by every SiteCatalogConsole consumer. */

import type { OceanLeoWorkspaceRouteContract } from "../contracts/site-manifest";

// ── 库深链的 query 形状（合同 §3.1）─────────────────────────────────────────
// 常量定义放在**本模块**而不是 `site-catalog-controller`：路由解析要认这几个键，而
// controller 已经 import 本模块，反向再 import 会成环（`tests/*.test.mjs` 的 data: 模块
// 编译器明确拒绝循环依赖）。controller 原样 re-export，公共导出面不变。

/** `?tab=library`：工作台切到「我的库」这一栏。 */
export const LIBRARY_TAB_QUERY_KEY = "tab";
export const LIBRARY_TAB_VALUE = "library";
/** `?item=<artifactId>`：库里要打开的那一份 artifact。 */
export const LIBRARY_ITEM_QUERY_KEY = "item";
/** `?mode=preview`：只读预览，**不进重型编辑器**（预览页内点「编辑」才 fork）。 */
export const LIBRARY_MODE_QUERY_KEY = "mode";
export const LIBRARY_MODE_PREVIEW_VALUE = "preview";
/** `?app=<appId>`：库预览页与探索页共用的 app 锚点。 */
export const CATALOG_APP_QUERY_KEY = "app";

function paramsOf(search: string | URLSearchParams): URLSearchParams {
  return search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search || "").replace(/^\?/, ""));
}

/**
 * 这条 query 是不是**库深链**（`workspaceTemplatePreviewHref()` 产出的那种）。
 *
 * 存在的理由是一条真实事故（V5 判定书 §2）：库深链带 `mode=preview`，而 `mode` 同时是
 * 历史遗留的 app 深链键（`legacyQueryKeys` 默认 `["fn","mode"]`），于是 `preview` 被当成
 * app id 解析，整站预览落点渲染成「这个 App 不存在或已下线 / preview」。
 *
 * 判据刻意**不是**「`mode` 的值等于 `preview`」：那会让某个真叫 `preview` 的 app 的老式
 * `?mode=preview` 链接一起失效。只有当 query 同时带着库深链的结构特征（`tab=library`
 * 或 `item=`）时，`mode` 才按预览模式解释。
 */
export function isLibraryDeepLinkSearch(
  search: string | URLSearchParams,
): boolean {
  const params = paramsOf(search);
  return (
    params.get(LIBRARY_TAB_QUERY_KEY) === LIBRARY_TAB_VALUE ||
    params.has(LIBRARY_ITEM_QUERY_KEY)
  );
}

/** `?app=<appId>`：库深链把 app 锚点放在 query 里（路径段留给 canonical 形态）。 */
export function catalogQueryAppId(search: string | URLSearchParams): string {
  return (paramsOf(search).get(CATALOG_APP_QUERY_KEY) || "").trim();
}

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
  const params = paramsOf(search);
  const libraryDeepLink = isLibraryDeepLinkSearch(params);
  for (const key of route?.legacyQueryKeys || ["fn", "mode"]) {
    // 库深链里的 `mode=` 是**预览模式**，不是老式 app id（见 isLibraryDeepLinkSearch）。
    if (libraryDeepLink && key === LIBRARY_MODE_QUERY_KEY) continue;
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
