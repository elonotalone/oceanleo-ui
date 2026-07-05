// ============================================================================
// @oceanleo/ui — asset.oceanleo.com 素材缩略图直链工具（宗旨 v15，2026-07-05）
// ----------------------------------------------------------------------------
// 成品卡片 / 导航模板卡的「示意图」要用 AI 风格素材（来自 asset.oceanleo.com 素材库，
// 存在阿里云 OSS 公有读桶）。站点数据里给每个成品/示例填一个**稳定的素材 key**（短、
// 可读，如 "design-scene/design-scene-cafe-01"），运行时用本工具拼成 OSS 缩略图直链
// ——**不在渲染时打网关搜索**（N 张卡 = N 个请求 + 结果不稳定）。key 从
// `api.oceanleo.com/v1/assets/library/search?category=<cat>` 离线挑好写进站点 catalog。
//
// OSS 命名约定（见 asset 站 lib/assets.ts）：
//   缩略图  https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image/<key>.thumb.webp
//   预览图  …/<key>.preview.webp （更大，本工具默认给缩略图，卡片够用）
// 其中 <key> = "<category>/<slug>"（如 "design-scene/design-scene-cafe-01"）。
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
  const clean = k.replace(/^\/+/, "").replace(/\.(thumb|preview)\.webp$/i, "");
  return `${OSS_BASE}/${clean}.thumb.webp`;
}

/** 预览图（更大）直链——需要更清晰的场景用。 */
export function assetPreviewUrl(key: string): string {
  const k = (key || "").trim();
  if (!k) return "";
  if (/^https?:\/\//i.test(k)) return k;
  const clean = k.replace(/^\/+/, "").replace(/\.(thumb|preview)\.webp$/i, "");
  return `${OSS_BASE}/${clean}.preview.webp`;
}
