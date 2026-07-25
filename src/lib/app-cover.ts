// ============================================================================
// @oceanleo/ui — 首页「成品 app 卡」封面图直链工具（2026-07-25，大工程 W5）
// ----------------------------------------------------------------------------
// 每个成品 app 有一张**我们自己生成**的无文字抽象封面（渐变底 + 光斑 + 几何构成 +
// 该 app 的语义图形），上线在 asset OSS 公有读桶，key 形如：
//
//   cover-app/<siteKey>-<appId>
//     缩略图（卡面）  …/assets/image/cover-app/<siteKey>-<appId>.thumb.webp   960×600
//     大图（lightbox）…/assets/image/cover-app/<siteKey>-<appId>.webp        1920×1200
//
// ⚠️ 大图就是 `<key>.webp`。`<key>.preview.webp` 在 OSS 上**不存在**（404）——和
// `asset-thumb.ts` 里记的同一个坑，这里复用它的拼链实现，避免两处漂移。
//
// 产出流水线与视觉规范：`docs/runbooks/oceanleo-app-cover-pipeline.md`（oceandino 仓）。
// 图片只在 OSS：**禁止**把封面图提交进任何 git 仓库、**禁止**放进本包。
// ============================================================================

import { assetPreviewUrl, assetThumbUrl } from "./asset-thumb";

/** 封面素材的 OSS 分类前缀（与生成脚本、`platform_assets.category` 一致）。 */
export const APP_COVER_CATEGORY = "cover-app";

/**
 * slug 规则必须与 `scripts/oceanleo-app-cover-gen.mjs` 的 `coverSlug()` 逐字一致，
 * 否则站点拼出来的 URL 会指向不存在的对象（历史事故：未验证的 key → 大面积 404）。
 */
function coverSlug(raw: string): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 稳定的封面素材 key：`cover-app/<siteKey>-<appId>`。
 * `siteKey` 取 `scripts/oceanleo-sites.tsv` 第一列（站 key，不是 repo 目录名）。
 */
export function appCoverKey(siteKey: string, appId: string): string {
  const site = coverSlug(siteKey);
  const app = coverSlug(appId);
  if (!site || !app) return "";
  return `${APP_COVER_CATEGORY}/${site}-${app}`;
}

/** 卡面缩略图直链（960×600 webp，≤40KB）。key 拼不出来时返回空串。 */
export function appCoverThumbUrl(siteKey: string, appId: string): string {
  const key = appCoverKey(siteKey, appId);
  return key ? assetThumbUrl(key) : "";
}

/** lightbox 大图直链（1920×1200 webp，≤160KB）。 */
export function appCoverPreviewUrl(siteKey: string, appId: string): string {
  const key = appCoverKey(siteKey, appId);
  return key ? assetPreviewUrl(key) : "";
}

/** 已经拿到 key（例如站点 catalog 里存的就是 key）时，一次取两条直链。 */
export function appCoverUrlsFromKey(coverKey: string): { thumb: string; preview: string } {
  const key = (coverKey || "").trim();
  if (!key) return { thumb: "", preview: "" };
  return { thumb: assetThumbUrl(key), preview: assetPreviewUrl(key) };
}
