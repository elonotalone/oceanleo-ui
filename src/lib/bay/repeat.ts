// Bay「再来一单」与回头客（移植自 talent `lib/talent/repeat.ts` 与 `RepeatWithButton`）。
// 按下「再来一单」做两件事，顺序不能反：先把这段合作钉住（失败不拦路，钉住只是记账），
// 再去下单——服务下的单直接再下同一个服务同一档；需求或直接谈成的单，开一个和对方的交易会话谈新报价。
// 端点没上线（404/501/503）时不造假数据：列表显示空态，钉住静默跳过。

import { bayGet, bayPost, BayApiError } from "./http";
import type { BayOrder } from "./orders";

export interface BayRepeatPartner {
  seller_id: string;
  handle: string;
  display_name: string;
  avatar_url?: string | null;
  headline?: string | null;
  collaborations: number;
  last_worked_at: string | null;
  pinned: boolean;
  project_id?: string | null;
}

export interface BayRepeatPinInput {
  seller_id: string;
  project_id?: string | null;
  pinned?: boolean;
}

/** 「这套端点还没上线」，不是「你没有回头客」。 */
export function repeatUnavailable(status: number | undefined | null): boolean {
  return status === 404 || status === 501 || status === 503;
}

export async function listBayRepeatPartners(options: { limit?: number } = {}): Promise<BayRepeatPartner[]> {
  const limit = Math.max(1, Math.min(100, Math.floor(Number(options.limit) || 20)));
  try {
    const data = await bayGet<{ items?: BayRepeatPartner[] }>(`/v1/talent/repeat/partners?limit=${limit}`);
    return Array.isArray(data?.items) ? data.items.filter((item) => item && typeof item.seller_id === "string") : [];
  } catch (error) {
    if (error instanceof BayApiError && repeatUnavailable(error.status)) return [];
    throw error;
  }
}

/** 钉住与取消是同一个端点：取消传 `pinned: false`。 */
export function pinBayRepeatPartner(input: BayRepeatPinInput): Promise<{ pinned: boolean; partner?: BayRepeatPartner }> {
  return bayPost<{ pinned: boolean; partner?: BayRepeatPartner }>("/v1/talent/repeat/pin", {
    seller_id: input.seller_id,
    project_id: input.project_id ?? null,
    pinned: input.pinned !== false,
  });
}

export type BayRepeatPlan =
  | { kind: "checkout"; serviceId: string; tier?: string; sellerId: string }
  | { kind: "direct"; userId: string; sellerId: string };

const TIER = /^[a-z0-9][a-z0-9_-]{0,23}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

/** 「再来一单」去哪：只有买家、只有完成的单才有。服务单 → 同一服务同一档；其余 → 和接单方的交易会话。 */
export function repeatOrderPlan(order: BayOrder | null | undefined): BayRepeatPlan | null {
  if (!order || order.my_role !== "buyer" || order.status !== "completed") return null;
  const sellerId = typeof order.seller_user_id === "string" ? order.seller_user_id : "";
  if (!sellerId) return null;
  const serviceId =
    order.source_service_id || (order.origin_kind === "service" && typeof order.origin_ref === "string" ? order.origin_ref : null);
  if (serviceId && ID.test(serviceId)) {
    const tier = typeof order.source_tier === "string" && TIER.test(order.source_tier) ? order.source_tier : undefined;
    return tier ? { kind: "checkout", serviceId, tier, sellerId } : { kind: "checkout", serviceId, sellerId };
  }
  return { kind: "direct", userId: sellerId, sellerId };
}

/** 钉住这段合作；端点没上线或失败都不拦路。 */
export async function pinBeforeRepeat(order: BayOrder): Promise<void> {
  if (!order.seller_user_id) return;
  try {
    await pinBayRepeatPartner({ seller_id: order.seller_user_id, project_id: order.project_id ?? null, pinned: true });
  } catch {
    /* 钉住只是记账，不是前置条件 */
  }
}
