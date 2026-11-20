// 订单关于的作品在门户上该站的同源路径打开（契约 §4.2 末段；2026-11-21 起没有子站主机）：
// 站名只来自 W03 的 bay-links，路径由 `bayWorkPath` 挪到 `/workspace/<siteKey>…`。
import { portalHref } from "../../../contracts/domain-family";
import type { UITranslate } from "../../../i18n/ui/useUI";
import { safeSitePath, type BayOrderWork } from "../../../lib/bay/orders";
import { baySiteName, bayWorkPath } from "../shell/bay-links";

/** 作品的地址（门户上同源）；站 key 不认识、或路径不安全 → null（不给链接）。 */
export function bayOrderWorkHref(work: BayOrderWork | null | undefined): string | null {
  if (!work || typeof work.site_key !== "string" || !baySiteName(work.site_key)) return null;
  const path = safeSitePath(work.open_path);
  if (!path) return null;
  const onPortal = bayWorkPath(work.site_key, path);
  return onPortal ? portalHref(onPortal) : null;
}

export interface BayOrderWorkLink {
  href: string;
  siteName: string;
  /** 按钮字：「去 <产品名> 打开」，产品名来自 baySiteName。 */
  label: string;
}

export function bayOrderWorkLink(work: BayOrderWork | null | undefined, tt: UITranslate): BayOrderWorkLink | null {
  const href = bayOrderWorkHref(work);
  const siteName = work ? baySiteName(work.site_key, tt) : null;
  if (!href || !siteName) return null;
  return { href, siteName, label: tt("去 {site} 打开", { site: siteName }) };
}
