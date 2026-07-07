// ============================================================================
// @oceanleo/ui — asset.oceanleo.com 素材缩略图直链工具（宗旨 v15，2026-07-05）
// ----------------------------------------------------------------------------
// 成品卡片 / 导航模板卡的「示意图」要用 AI 风格素材（来自 asset.oceanleo.com 素材库，
// 存在阿里云 OSS 公有读桶）。站点数据里给每个成品/示例填一个**稳定的素材 key**（短、
// 可读，如 "design-scene/design-scene-cafe-01"），运行时用本工具拼成 OSS 缩略图直链
// ——**不在渲染时打网关搜索**（N 张卡 = N 个请求 + 结果不稳定）。key 从
// `api.oceanleo.com/v1/assets/library/search?category=<cat>` 离线挑好写进站点 catalog。
//
// OSS 命名约定（2026-07-07 实测校正，见 api.oceanleo.com/v1/assets/library/search 回包）：
//   缩略图    https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image/<key>.thumb.webp
//   原图/预览 …/<key>.webp （1536×1024 左右，约 150KB）
// 其中 <key> = "<category>/<slug>"（如 "design-scene/design-scene-cafe-01"）。
// ⚠️ 历史坑：曾以为大图是 `<key>.preview.webp`——那个 **404**（OSS 上不存在该变体）。
// 大图就是 `<key>.webp`。assetPreviewUrl 已按实测改成 `<key>.webp`。
// ============================================================================

const OSS_BASE = "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image";

/**
 * 把一个稳定素材 key（"<category>/<slug>"）拼成 OSS 缩略图直链。
 * 已是完整 http(s) URL 的原样返回（方便站点混用外链）。
 */
export function assetThumbUrl(key: string): string {
  const k = (key || "").trim();
  if (!k) return "";
  if (/^https?:\/\//i.test(k)) return k;
  const clean = k.replace(/^\/+/, "").replace(/\.(thumb|preview)?\.webp$/i, "");
  return `${OSS_BASE}/${clean}.thumb.webp`;
}

/** 原图/预览（更清晰）直链——放大查看用。实测大图 = `<key>.webp`（非 `.preview.webp`）。 */
export function assetPreviewUrl(key: string): string {
  const k = (key || "").trim();
  if (!k) return "";
  if (/^https?:\/\//i.test(k)) return k;
  const clean = k.replace(/^\/+/, "").replace(/\.(thumb|preview)?\.webp$/i, "");
  return `${OSS_BASE}/${clean}.webp`;
}
