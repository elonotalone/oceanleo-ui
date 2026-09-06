// ============================================================================
// @oceanleo/ui — 标题/侧栏小图标（app-icon/*）直链
// ----------------------------------------------------------------------------
// 与 `capabilityImageKey` 同一套 slug：trim → lower → [^a-z0-9]+ → `-` → 去首尾 `-`。
// catalog 存裸 key（`app-icon/<site>-<app>`）或完整 URL；渲染层只走 `appIconThumbSrc`。
// ============================================================================

import { assetThumbUrl } from "./asset-thumb";

export const APP_ICON_IMAGE_CATEGORY = "app-icon";

function capSlug(raw: string): string {
  return (raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `app-icon/<siteKey>-<appId>`。任一段 slug 为空时返回空串。 */
export function appIconImageKey(siteKey: string, appId: string): string {
  const site = capSlug(siteKey);
  const app = capSlug(appId);
  if (!site || !app) return "";
  return `${APP_ICON_IMAGE_CATEGORY}/${site}-${app}`;
}

/** key → 缩略图直链；完整 http(s) URL 原样透传；空 → 空串。 */
export function appIconThumbSrc(keyOrUrl: string | undefined | null): string {
  return assetThumbUrl((keyOrUrl || "").trim());
}
