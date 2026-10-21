// ============================================================================
// @oceanleo/ui — 全页「我的库」点编辑的落点（DEV-U6）
// ----------------------------------------------------------------------------
// 门户 /library 没有挂 SiteCatalogConsole。货架跨应用「编辑」若仍深链到
// `/workspace/<归属>`，门户那条路不是归属工作台；用户作品若用 originSiteKey /
// 项目 UUID 去 ensure 一条会话，再拿这条会话当 `/history/<id>` 回看，门户
// history 页在 SITES 里找不到 site_id，就会写出「所属网站已下线」。
//
// 本模块是那条落点的唯一出口：按素材类型就地打开编辑器，禁止用对不上
// 清册的历史会话当落点。跨 app 也不再跳到归属工作台。
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
 * 任何宿主上的「编辑」都就地打开类型插件。跨应用深链曾经把 Word 里的网站素材
 * 送去 `/workspace/<归属>`，人还在 Word，那个工作台并不存在。
 */
export function resolveLibraryEditRoute(
  editRoute: LibraryEditRoute,
  _host: LibraryEditHost = {},
): LibraryEditRoute {
  if (editRoute === "deep-link") return "in-place";
  return editRoute;
}

export type LibraryEditLanding =
  | { kind: "typed-editor"; href: null }
  | { kind: "owning-workbench"; href: string };

/**
 * 编辑落点永远是当前站的类型编辑器。`owningAppHref` 不再当跳转。
 */
export function libraryEditLanding(
  editRoute: LibraryEditRoute,
  host: LibraryEditHost = {},
  _owningAppHref = "",
): LibraryEditLanding {
  void resolveLibraryEditRoute(editRoute, host);
  return { kind: "typed-editor", href: null };
}

/**
 * 全页库就地编辑器用的会话身份。app 固定为 library，不用宿主 siteId 冒充 app。
 * 新任务归当前宿主，不归素材的原始站点。全局 Library 默认属于门户；
 * HistoryDetail 直接复用 TaskFileWorkspace 恢复 library session，不依赖子站 iframe。
 */
export function libraryStandaloneEditorBinding(input: {
  hostSiteId?: string;
  itemSiteId?: string;
}): { siteId: string; appId: "library" } {
  const host = String(input.hostSiteId || "").trim();
  if (host === "oceanleo" || (host && !isUnmountablePortalHistorySiteId(host))) {
    return { siteId: host, appId: "library" };
  }
  return { siteId: "oceanleo", appId: "library" };
}
