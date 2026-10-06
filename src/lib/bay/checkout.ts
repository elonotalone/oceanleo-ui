// Bay 下单（移植自 talent `app/orders/new/page.tsx` 的服务下单段与 `lib/talent/orders.ts` 的两个接口）。
// 下单只建订单，从不发起付款：付款按钮只在 `buyer_ready` 为 true 时出现，由用户自己点（契约 §7）。
// 付款就绪判断与发起付款都从 W09 的 `payments.ts` 取，这里不直接调付款接口。

import { bayPost } from "./http";
import { fetchBayPaymentConfig, type BayPaymentConfig } from "./payments";
import { serviceSelection, type BayServiceDetail, type BayServiceSelection, type BayServiceTierName } from "./services";

export interface BayCheckoutForm {
  title: string;
  what: string;
  /** 每行一个链接。 */
  links: string;
  /** YYYY-MM-DD 或空。 */
  deadline: string;
  notes: string;
}

export interface BayOrderRequirements {
  title: string;
  what: string;
  reference_links: string[];
  deadline: string;
  notes: string;
}

export interface BayServiceOrderInput {
  service_id: string;
  tier: BayServiceTierName;
  addon_ids: string[];
  requirements: BayOrderRequirements;
}

export interface BayOrderContract {
  id: string;
  title?: string;
  status?: string;
  payment_state?: string;
  total_fen?: number;
  currency?: string;
  thread_id?: string | null;
  [key: string]: unknown;
}

export const BAY_CHECKOUT_LIMITS = { title: 200, what: 10000, notes: 5000, links: 20 } as const;

export function emptyCheckoutForm(title = ""): BayCheckoutForm {
  return { title, what: "", links: "", deadline: "", notes: "" };
}

/** 表单 → 后端 `requirements`（与 talent 下单页同形）。 */
export function checkoutRequirements(form: BayCheckoutForm): BayOrderRequirements {
  return {
    title: form.title.trim().slice(0, BAY_CHECKOUT_LIMITS.title),
    what: form.what.trim().slice(0, BAY_CHECKOUT_LIMITS.what),
    reference_links: form.links
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, BAY_CHECKOUT_LIMITS.links),
    deadline: /^\d{4}-\d{2}-\d{2}$/.test(form.deadline.trim()) ? form.deadline.trim() : "",
    notes: form.notes.trim().slice(0, BAY_CHECKOUT_LIMITS.notes),
  };
}

export type BayCheckoutProblem = "tier" | "addons" | "title" | "what";

/** 还差什么才能下单；能下单时返回 null。 */
export function checkoutProblem(selection: BayServiceSelection, form: BayCheckoutForm): BayCheckoutProblem | null {
  if (!selection.tier) return "tier";
  if (selection.invalidAddonIds.length) return "addons";
  if (!form.title.trim()) return "title";
  if (!form.what.trim()) return "what";
  return null;
}

export function checkoutInput(
  service: Pick<BayServiceDetail, "id" | "tiers" | "addons" | "delivery_days">,
  tierName: string | null | undefined,
  addonIds: Iterable<string>,
  form: BayCheckoutForm,
): BayServiceOrderInput | null {
  const selection = serviceSelection(service, tierName, addonIds);
  if (checkoutProblem(selection, form) || !selection.tier) return null;
  return {
    service_id: service.id,
    tier: selection.tier.tier,
    addon_ids: selection.addons.map((addon) => addon.id),
    requirements: checkoutRequirements(form),
  };
}

export function createBayServiceOrder(input: BayServiceOrderInput): Promise<{ contract: BayOrderContract }> {
  return bayPost<{ contract: BayOrderContract }>("/v1/talent/orders", input);
}

/** 下单之后怎么付：免费单不用付；付款没就绪就是「付款暂未开放」；就绪才给付款按钮。 */
export type BayPayStep = "pay" | "unavailable" | "free";

export function payStepFor(config: Pick<BayPaymentConfig, "buyer_ready"> | null | undefined, totalFen: number): BayPayStep {
  if (!(totalFen > 0)) return "free";
  return config?.buyer_ready === true ? "pay" : "unavailable";
}

/** 取付款配置；取不到一律按「没就绪」处理（宁可不给按钮，也不给一个点了会失败的按钮）。 */
export async function loadBayPaymentConfig(): Promise<BayPaymentConfig> {
  try {
    const config = await fetchBayPaymentConfig();
    return { ...config, buyer_ready: config?.buyer_ready === true };
  } catch {
    return { enabled: false, buyer_ready: false, seller_ready: false, currency: "" };
  }
}

/** 建订单并决定下一步。只建订单，绝不在这里发起付款。 */
export async function placeBayServiceOrder(
  input: BayServiceOrderInput,
  totalFen: number,
): Promise<{ contract: BayOrderContract; payStep: BayPayStep }> {
  const { contract } = await createBayServiceOrder(input);
  const config = await loadBayPaymentConfig();
  return { contract, payStep: payStepFor(config, totalFen) };
}
