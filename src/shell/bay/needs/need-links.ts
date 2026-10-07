import { currentFamilySubsiteOrigin, portalHref } from "../../../contracts/domain-family";
import type { BayWorkRef } from "../../../lib/bay/types";
import { baySubsiteLabel } from "../shell/bay-links";
import { bayHrefOnSite, type BayTarget } from "../shell/bay-state";

function keyOf(siteKey: string | null | undefined): string {
  return typeof siteKey === "string" ? siteKey.trim().toLowerCase() : "";
}

/** 「去 LeoXX 处理」：要去的站就是当前站时不给链接。 */
export function handlingHref(
  currentSite: string | null | undefined,
  handlingSite: string | null | undefined,
  target: BayTarget,
): string | null {
  const to = keyOf(handlingSite);
  if (!to || to === keyOf(currentSite)) return null;
  return bayHrefOnSite(to, target);
}

/** 只认站内绝对路径（`/x/y?z`）：不认协议、不认 `//host`、不认反斜杠与空白。 */
export function safeSitePath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const value = path.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.length > 2000) return null;
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

/** 附带作品的只读预览：在作品所在站打开（不在 Bay 里内嵌）。当前家族没有那个站、或拿不到地址 → null。 */
export function workPreviewHref(work: Pick<BayWorkRef, "site_key" | "preview_url"> | null | undefined): string | null {
  const path = safeSitePath(work?.preview_url);
  if (!path) return null;
  const site = keyOf(work?.site_key) || "oceanleo";
  try {
    if (site === "oceanleo") return portalHref(path);
    const label = baySubsiteLabel(site);
    const origin = label ? currentFamilySubsiteOrigin(label) : undefined;
    return origin ? `${origin}${path}` : null;
  } catch {
    return null;
  }
}

/** 用户填的外链只放行 http(s)。 */
export function safeHttpLink(href: unknown): string | null {
  if (typeof href !== "string") return null;
  const value = href.trim();
  if (!/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
