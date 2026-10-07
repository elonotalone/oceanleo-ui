// 订单关于的作品在它那个站打开（契约 §4.2 末段）：子域名只来自 W03 的 bay-links，origin 只来自域名家族。
import { currentFamilySubsiteOrigin } from "../../../contracts/domain-family";
import { orderWorkHref, type BayOrderWork } from "../../../lib/bay/orders";
import { baySubsiteLabel } from "../shell/bay-links";

/** 作品的绝对地址；当前家族没有那个子站、站 key 不认识、或路径不安全 → null（不给链接）。 */
export function bayOrderWorkHref(work: BayOrderWork | null | undefined): string | null {
  return orderWorkHref(work, { label: baySubsiteLabel, origin: currentFamilySubsiteOrigin });
}
