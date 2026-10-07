// 订单关于的作品在它那个站打开（契约 §4.2 末段）：站名、子域名只来自 W03 的 bay-links，origin 只来自域名家族。
import { currentFamilySubsiteOrigin } from "../../../contracts/domain-family";
import type { UITranslate } from "../../../i18n/ui/useUI";
import { orderWorkHref, type BayOrderWork } from "../../../lib/bay/orders";
import { baySiteName, baySubsiteLabel } from "../shell/bay-links";

/** 作品的绝对地址；当前家族没有那个子站、站 key 不认识、或路径不安全 → null（不给链接）。 */
export function bayOrderWorkHref(work: BayOrderWork | null | undefined): string | null {
  if (!work || !baySiteName(work.site_key)) return null;
  return orderWorkHref(work, { label: baySubsiteLabel, origin: currentFamilySubsiteOrigin });
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
