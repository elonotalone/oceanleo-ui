// ============================================================================
// @oceanleo/ui — 全页「我的库」点编辑的落点（DEV-U6）
// ----------------------------------------------------------------------------
// 门户 /library 没有挂 SiteCatalogConsole。货架跨应用「编辑」若仍深链到
// `/workspace/<归属>`，门户那条路不是归属工作台；用户作品若用 originSiteKey /
// 项目 UUID 去 ensure 一条会话，再拿这条会话当 `/history/<id>` 回看，门户
// history 页在 SITES 里找不到 site_id，就会写出「所属网站已下线」。
//
// 本模块是那条落点的唯一出口：全页库按素材类型就地打开编辑器，禁止用对不上
// 清册的历史会话当落点。explore / 站内工作台的跨 app 深链一字不改。
// ============================================================================

const PROJECT_OR_SESSION_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type LibraryEditRoute = "deep-link" | "in-place" | "none";

export interface LibraryEditHost {
  appId?: string;
  /** ArtifactLibrary / 门户 /library 传 true；工作台抽屉是 false。 */
  plain?: boolean;
}

/** `/history/<uuid>` 以及带融合前缀的同形地址。 */
export function isHistorySessionPath(href: string): boolean {
  return /(?:^|\/)history\/[^/?#]+/.test(String(href || ""));
}

/**
 * 全页库：没有锚定 app，也不是工作台抽屉。门户 /library 就是这一档。
 */
export function isFullPageLibraryEditHost(host: LibraryEditHost): boolean {
  return Boolean(host.plain) && !String(host.appId || "").trim();
}

/**
 * 门户 history 页只认 SITES 子站 key。项目 UUID、门户自己的 oceanleo / library
 * 都不在清册里，拿去当 session.site_id 再回看就会「所属网站已下线」。
 */
export function isUnmountablePortalHistorySiteId(siteId: string): boolean {
  const key = String(siteId || "").trim();
  if (!key) return true;
  if (PROJECT_OR_SESSION_UUID.test(key)) return true;
  return key === "library" || key === "oceanleo";
}

/**
 * 全页库把跨应用深链收成就地编辑；其余宿主保持传入的 editRoute。
 */
export function resolveLibraryEditRoute(
  editRoute: LibraryEditRoute,
  host: LibraryEditHost = {},
): LibraryEditRoute {
  if (isFullPageLibraryEditHost(host) && editRoute === "deep-link") {
    return "in-place";
  }
  return editRoute;
}

export type LibraryEditLanding =
  | { kind: "typed-editor"; href: null }
  | { kind: "owning-workbench"; href: string };

/**
 * 编辑落点。全页库永远是类型编辑器；深链只有在仍是 deep-link 且地址不是
 * `/history/` 时才算归属工作台。
 */
export function libraryEditLanding(
  editRoute: LibraryEditRoute,
  host: LibraryEditHost = {},
  owningAppHref = "",
): LibraryEditLanding {
  const route = resolveLibraryEditRoute(editRoute, host);
  const href = String(owningAppHref || "").trim();
  if (route === "deep-link" && href && !isHistorySessionPath(href)) {
    return { kind: "owning-workbench", href };
  }
  return { kind: "typed-editor", href: null };
}

/**
 * 全页库就地编辑器用的会话身份。app 固定为 library，不用宿主 siteId 冒充 app。
 * site 只用清册里能挂工作台的子站 key；项目 UUID / 门户宿主键不用。
 */
export function libraryStandaloneEditorBinding(input: {
  hostSiteId?: string;
  itemSiteId?: string;
}): { siteId: string; appId: "library" } {
  const host = String(input.hostSiteId || "").trim();
  const item = String(input.itemSiteId || "").trim();
  for (const candidate of [host, item]) {
    if (candidate && !isUnmountablePortalHistorySiteId(candidate)) {
      return { siteId: candidate, appId: "library" };
    }
  }
  return { siteId: "library", appId: "library" };
}
