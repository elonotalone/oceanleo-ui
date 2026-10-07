// 「我的订单」的分组、身份切换与搜索（纯函数）。同一个人可能既买又卖：按每单里的身份分开，不按账号分。
import {
  orderGroupOf,
  orderRoleOf,
  type BayOrder,
  type BayOrderGroup,
  type BayOrderPaymentsGate,
  type BayOrderRole,
} from "../../../lib/bay/orders";

/** 显示顺序：进行中 / 待我处理 / 已完成 / 已取消。 */
export const MY_ORDER_GROUPS: readonly BayOrderGroup[] = ["active", "todo", "done", "cancelled"];

export type BayOrderGroupCounts = Record<BayOrderGroup, number>;

export function ordersForRole(items: readonly BayOrder[], role: BayOrderRole): BayOrder[] {
  return items.filter((item) => orderRoleOf(item) === role);
}

export function countOrderGroups(items: readonly BayOrder[], gate?: BayOrderPaymentsGate | null): BayOrderGroupCounts {
  const counts: BayOrderGroupCounts = { active: 0, todo: 0, done: 0, cancelled: 0 };
  for (const item of items) counts[orderGroupOf(item, gate)] += 1;
  return counts;
}

/** 默认看买家；我没买过但卖过时看卖家。 */
export function defaultOrderRole(items: readonly BayOrder[]): BayOrderRole {
  if (ordersForRole(items, "buyer").length === 0 && ordersForRole(items, "seller").length > 0) return "seller";
  return "buyer";
}

/** 默认打开「待我处理」；它是空的就依次退到进行中、已完成、已取消。 */
export function defaultOrderGroup(counts: BayOrderGroupCounts): BayOrderGroup {
  for (const group of ["todo", "active", "done", "cancelled"] as const) {
    if (counts[group] > 0) return group;
  }
  return "active";
}

export function matchesOrderQuery(order: BayOrder, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const other = orderRoleOf(order) === "buyer" ? order.seller : order.buyer;
  return [order.title, other?.display_name, other?.handle]
    .filter((value): value is string => typeof value === "string" && Boolean(value))
    .some((value) => value.toLocaleLowerCase().includes(needle));
}

function stamp(order: BayOrder): number {
  const value = Date.parse(order.updated_at || order.created_at || "");
  return Number.isFinite(value) ? value : 0;
}

/** 最近有动静的在前。 */
export function sortMyOrders(items: readonly BayOrder[]): BayOrder[] {
  return [...items].sort((a, b) => stamp(b) - stamp(a));
}

export function visibleMyOrders(
  items: readonly BayOrder[],
  opts: { role: BayOrderRole; group: BayOrderGroup; query?: string; gate?: BayOrderPaymentsGate | null },
): BayOrder[] {
  return sortMyOrders(
    ordersForRole(items, opts.role).filter(
      (item) => orderGroupOf(item, opts.gate) === opts.group && matchesOrderQuery(item, opts.query || ""),
    ),
  );
}
