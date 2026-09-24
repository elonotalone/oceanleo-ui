// ============================================================================
// @oceanleo/ui — leo 的站点口径
// ----------------------------------------------------------------------------
// leo 请求里的 site_id、记录与任务的来源标记一律是 scripts/oceanleo-sites.tsv 的
// site key。子站 app/layout.tsx 仍在发的历史 siteId 在这里收口；不认识的值原样返回，
// 所以新站不必先登记才能用 leo。
// ============================================================================

const LEGACY_LEO_SITE_IDS: ReadonlyMap<string, string> = new Map([
  ["leostudio", "ecommerce"],
  ["leoslides", "ppt"],
  ["leosheet", "excel"],
  ["leoconvert", "converter"],
  ["leohuman", "aihuman"],
  ["studio", "video"],
]);

/** 各站 layout 给 leo 的 docType；没列出的站是 "doc"。壳挂载不带 docType 时按这里取。 */
const LEO_SITE_DOC_TYPES: ReadonlyMap<string, string> = new Map([
  ["ecommerce", "image"],
  ["ppt", "ppt"],
  ["aihuman", "video"],
  ["image", "image"],
  ["video", "video"],
  ["logo", "image"],
  ["interior", "image"],
  ["threed", "threed"],
  ["music", "audio"],
  ["design", "image"],
  ["make", "image"],
]);

/** 调用方没给站点 key 时 leo 记在门户名下（建任务要求 site_id 非空）。 */
export const LEO_DEFAULT_SITE_ID = "oceanleo";

export function canonicalLeoSiteId(raw?: string): string {
  const value = (raw ?? "").trim();
  return LEGACY_LEO_SITE_IDS.get(value.toLowerCase()) ?? value;
}

export function leoDocTypeForSite(raw?: string): string {
  return LEO_SITE_DOC_TYPES.get(canonicalLeoSiteId(raw)) ?? "doc";
}
