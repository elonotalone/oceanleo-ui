// 「我的」类别选择条的纯逻辑（不带组件，便于测试）。类别的名字与标签见 PublishedCategoryTag.tsx。
import type { PublishedCategory } from "./PublishedCategoryTag";

export type MineCategory = "all" | PublishedCategory;

/** 选中「全部」时每一行都留；否则只留这一类。 */
export function rowMatchesCategory(filter: MineCategory, category: PublishedCategory): boolean {
  return filter === "all" || filter === category;
}

export function categoryOfListingKind(kind: string | null | undefined): PublishedCategory {
  if (kind === "digital" || kind === "app" || kind === "lesson" || kind === "other") return kind;
  return "service";
}

export function listingStatusText(status: string | null | undefined, hidden?: boolean): string {
  if (hidden) return "已被平台隐藏";
  if (status === "published") return "已上架";
  if (status === "paused") return "已暂停";
  if (status === "offline") return "已下架";
  return "草稿";
}

export function purchaseStatusText(status: string | null | undefined): string {
  if (status === "refund_requested") return "待处理退款";
  if (status === "refund_declined") return "已拒绝退款";
  if (status === "disputed") return "平台介入中";
  if (status === "refunded") return "已退款";
  if (status === "completed") return "已确认";
  return "托管中";
}

export function subscriptionStatusText(status: string | null | undefined): string {
  if (status === "past_due") return "续费失败";
  if (status === "cancelled") return "已取消订阅";
  if (status === "expired") return "已到期";
  return "订阅中";
}

export function mineEmptyText(tab: "published" | "sold" | "bought" | "favorites"): string {
  if (tab === "published") return "这一类还没有发布的东西。";
  if (tab === "favorites") return "这一类还没有收藏。";
  return "这一类还没有订单。";
}

export function joinMeta(parts: Array<string | null | undefined>): string {
  return parts.map((part) => (part || "").trim()).filter(Boolean).join(" · ");
}

/** 收藏的挂牌（target_kind 为 service）按 listing_kind 归类；卖家和需求算「其他」。 */
export function favoriteCategory(item: { target_kind: string; target?: Record<string, unknown> | null }): PublishedCategory {
  if (item.target_kind !== "service") return "other";
  const target = item.target && typeof item.target === "object" ? item.target : {};
  const kind = typeof target.listing_kind === "string" ? target.listing_kind : "";
  return categoryOfListingKind(kind);
}

/** 课程 / 网站与软件服务的买断会另建一笔 talent 合同，统一清单里只留购买行。 */
export function isPaidListingContract(order: { id?: string; requirements?: unknown }): boolean {
  if (!order.requirements || typeof order.requirements !== "object") return false;
  return !!(order.requirements as { _lesson_order?: unknown })._lesson_order;
}

export function paidContractIds(...groups: Array<Iterable<{ contract_id?: string | null } | null | undefined>>): Set<string> {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const row of group) {
      const id = typeof row?.contract_id === "string" ? row.contract_id.trim() : "";
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function isMergedPaidOrder(order: { id: string; requirements?: unknown }, paidIds: Set<string>): boolean {
  return paidIds.has(order.id) || isPaidListingContract(order);
}

// ---- 「删除」的门槛 ---------------------------------------------------------------
// 帖子（我发布的）与收藏随时可以删；交易记录只有已了结的才能从自己的列表里移除。

export function orderIsSettled(status: string | null | undefined): boolean {
  return status === "completed" || status === "cancelled";
}

export function purchaseIsSettled(status: string | null | undefined): boolean {
  return status === "completed" || status === "refunded";
}

export function subscriptionIsSettled(status: string | null | undefined): boolean {
  return status === "cancelled" || status === "expired";
}

export function proposalIsSettled(status: string | null | undefined): boolean {
  return status === "declined" || status === "withdrawn";
}
