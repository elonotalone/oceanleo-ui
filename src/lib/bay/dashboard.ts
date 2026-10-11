// LeoBay 开发者面板的接口客户端：一个人在 Bay 上卖的全部东西（作品、课程、套餐、服务）合在一页的数字。
// 网关路由 `GET /v1/bay/dashboard`。字段名与网关出参逐字一致，本文件是合同。

import { bayGet } from "./http";
import { bayQuery } from "./directory";

export type BayDashboardRange = 7 | 30 | 90 | 365;
export type BayDashboardItemKind = "app" | "lesson" | "bundle" | "service";

export interface BayDashboardTotals {
  /** 累计已到账收入（款项已放给卖家），分。 */
  income_lifetime_fen: number;
  /** 所选时间段内已到账收入，与紧挨着的上一个同样长的时间段。 */
  income_fen: number;
  income_prev_fen: number;
  /** 买家已付款、还在托管期内的金额。 */
  pending_fen: number;
  /** 累计用户数：用 OceanLeo 账号登录过我任何一个作品的人，加上买过我任何东西的人，去重。 */
  users_lifetime: number;
  /** 所选时间段内新增的用户数，与上一个时间段。 */
  new_users: number;
  new_users_prev: number;
  /** 所选时间段内付过款的人数。 */
  buyers: number;
  /** 所选时间段内作品被打开的次数，与上一个时间段。 */
  opens: number;
  opens_prev: number;
  followers: number;
  /** 还没回复的留言数、还没处理的报错种数。 */
  open_threads: number;
  open_errors: number;
  /** 正在生效的订阅数。 */
  active_subscriptions: number;
}

export interface BayDashboardDay {
  day: string;
  income_fen: number;
  new_users: number;
  opens: number;
}

export interface BayDashboardProduct {
  item_kind: BayDashboardItemKind;
  item_id: string;
  title: string;
  status: string;
  /** 所选时间段内这件商品的已到账收入与订单数。 */
  income_fen: number;
  orders: number;
  /** 占所选时间段总收入的比例，0–1；总收入为 0 时全是 0。 */
  share: number;
  /** 只有作品有：时间段内的打开次数、累计登录用户数、未回复留言、未处理报错。其余种类是 0。 */
  opens: number;
  users: number;
  open_threads: number;
  open_errors: number;
  rating_avg: number;
  rating_count: number;
}

export interface BayDashboard {
  currency: string;
  range_days: BayDashboardRange;
  totals: BayDashboardTotals;
  /** 每天一行，从早到晚，长度等于 range_days（365 天时按周合并，`day` 是那一周的周一）。 */
  days: BayDashboardDay[];
  /** 我的每一件商品，按时间段内收入从高到低；收入相同的按打开次数。 */
  products: BayDashboardProduct[];
}

export function getBayDashboard(days: BayDashboardRange = 30, signal?: AbortSignal): Promise<BayDashboard> {
  return bayGet(`/v1/bay/dashboard${bayQuery({ days })}`, { signal });
}
