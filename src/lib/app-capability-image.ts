// ============================================================================
// @oceanleo/ui — 功能图（capability image）直链工具（2026-07-26，大工程 W5）
// ----------------------------------------------------------------------------
// **功能图**表达"这个 app 干什么"（60px 见方一眼可辨认动作），只出现在首页卡片缩略图，
// 不随模板切换而变。它和「模板素材预览」(`TemplateMaterial.previewUrl`) 职责严格分开——
// 上一轮就是把两者混成一个 `thumb` 才做错的（见 W3-marker「两层图像职责」）。
//
// key 形如：
//   cap-app/<siteKey>-<appId>
//     缩略图（卡面）  …/assets/image/cap-app/<siteKey>-<appId>.thumb.webp   512×512
//     大图            …/assets/image/cap-app/<siteKey>-<appId>.webp        1024×1024
//
// ⚠️ 大图就是 `<key>.webp`。`<key>.preview.webp` 在 OSS 上**不存在**（404）——沿用
// `asset-thumb.ts` 记的同一个坑，这里复用它的拼链实现，避免两处漂移。
//
// 视觉规范与产出流水线：`docs/runbooks/oceanleo-capability-image-spec.md`（oceandino 仓）。
// 图片只在 OSS：**禁止**把功能图提交进任何 git 仓库、**禁止**放进本包。
//
// 与旧的 `app-cover.ts`（`cover-app/*`）的关系：那是上一轮被操作员判定全部错误的占位图
// 封面，本轮由功能图整体取代。新代码一律用本文件，不要再新增 `cover-app/*` 消费点。
// ============================================================================

import { assetPreviewUrl, assetThumbUrl } from "./asset-thumb";

/** 功能图的 OSS 分类前缀（与生成脚本、`platform_assets.category` 一致）。 */
export const APP_CAPABILITY_IMAGE_CATEGORY = "cap-app";

/**
 * slug 规则必须与 `scripts/oceanleo-capability-image-gen.mjs` 的 `capSlug()` 逐字一致，
 * 否则站点拼出来的 URL 会指向不存在的对象（历史事故：未验证的 key → 大面积 404）。
 */
function capSlug(raw: string): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * 稳定的功能图素材 key：`cap-app/<siteKey>-<appId>`（合同 §3）。
 * `siteKey` 取 `scripts/oceanleo-sites.tsv` 第一列（站 key，不是 repo 目录名）。
 * 拼不出来（任一段 slug 为空）时返回空串，调用方按"无图"处理。
 */
export function capabilityImageKey(siteKey: string, appId: string): string {
  const site = capSlug(siteKey);
  const app = capSlug(appId);
  if (!site || !app) return "";
  return `${APP_CAPABILITY_IMAGE_CATEGORY}/${site}-${app}`;
}

/** 卡面缩略图直链（512×512 webp，≤40KB）。key 拼不出来时返回空串。 */
export function capabilityImageThumbUrl(siteKey: string, appId: string): string {
  const key = capabilityImageKey(siteKey, appId);
  return key ? assetThumbUrl(key) : "";
}

/** 大图直链（1024×1024 webp，≤160KB）。 */
export function capabilityImagePreviewUrl(siteKey: string, appId: string): string {
  const key = capabilityImageKey(siteKey, appId);
  return key ? assetPreviewUrl(key) : "";
}

/**
 * 渲染层入口：把 `GoalApp.capabilityImage` 的**原始取值**变成可用的 `<img src>`。
 *
 * W3 把该字段定义成"OSS key 或完整 URL"，且 `capabilityImageOf()` 只做数据源裁决、
 * 不做 key→URL 拼接。所以拼接统一收在这里，**W1 与 30 个站都用这一个函数**，
 * 避免出现"有的站存 key、有的站存 URL，渲染层各写各的"。
 *
 * 传 key（`cap-app/image-poster`）→ 拼成缩略图直链；
 * 传完整 http(s) URL → 原样返回；传空 → 空串。
 */
export function capabilityImageThumbSrc(keyOrUrl: string | undefined | null): string {
  return assetThumbUrl((keyOrUrl || "").trim());
}

/** 同上，取大图变体（大卡片/放大查看用）。 */
export function capabilityImagePreviewSrc(keyOrUrl: string | undefined | null): string {
  return assetPreviewUrl((keyOrUrl || "").trim());
}

/** 已经拿到 key 时一次取两条直链。 */
export function capabilityImageUrlsFromKey(key: string): { thumb: string; preview: string } {
  const k = (key || "").trim();
  if (!k) return { thumb: "", preview: "" };
  return { thumb: assetThumbUrl(k), preview: assetPreviewUrl(k) };
}
