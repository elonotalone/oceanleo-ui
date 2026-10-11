// LeoBay 作品的「报错」与「流量来源」接口客户端。
// 报错：作者把一段脚本放进自己的作品，作品在访客浏览器里出错时自动上报，作者在这里看列表。
// 来源：访客从哪里进到作品页（哪个站的 Bay、搜索、新作品位、分享链接、关注、站外）。
// 网关路由 `/v1/bay/app-insights*`（作者，要登录）；上报口 `/v1/bay/pub/errors/*`（公开，给作品调）。本文件是合同。

import { bayGet, bayPost } from "./http";
import { bayQuery } from "./directory";

export type BayAppErrorStatus = "open" | "resolved" | "ignored";

export interface BayAppError {
  id: string;
  app_id: string;
  message: string;
  /** 出错的脚本地址（去掉查询参数）。 */
  source: string;
  line: number;
  col: number;
  stack: string;
  /** 最近一次出错时访客所在的页面路径。 */
  page_path: string;
  /** 最近一次出错的浏览器，已归纳成「Chrome 126 · Windows」这样的短名。 */
  browser: string;
  events: number;
  status: BayAppErrorStatus;
  first_seen_at: string | null;
  last_seen_at: string | null;
}

export interface BayAppErrorPage {
  summary: { open: number; resolved: number; ignored: number; events_7d: number };
  /** 最近 30 天每天的报错次数，从早到晚。 */
  days: { day: string; events: number }[];
  items: BayAppError[];
  next_offset: number | null;
}

export interface BayAppErrorSetup {
  /** 作者要粘进作品 `<head>` 的那一行。 */
  snippet: string;
  /** 最近 7 天收到过上报 = 已经接好。 */
  receiving: boolean;
  last_event_at: string | null;
}

export interface BayAppSourceRow {
  /** 例：`site:game`、`search`、`fresh`、`shelf`、`share`、`follow`、`direct`、`ext:example.com`。 */
  source: string;
  views: number;
  opens: number;
}

export interface BayAppSources {
  range_days: number;
  totals: { views: number; opens: number };
  /** 按打开数从高到低，最多 30 行；更多的并进 `source = "other"`。 */
  rows: BayAppSourceRow[];
}

const I = "/v1/bay/app-insights";
const enc = encodeURIComponent;

export function listBayAppErrors(appId: string, params: { status?: BayAppErrorStatus; offset?: number; limit?: number } = {}): Promise<BayAppErrorPage> {
  return bayGet(`${I}/apps/${enc(appId)}/errors${bayQuery(params)}`);
}
export function setBayAppErrorStatus(errorId: string, status: BayAppErrorStatus): Promise<{ error: BayAppError }> {
  return bayPost(`${I}/errors/${enc(errorId)}/status`, { status });
}
export function getBayAppErrorSetup(appId: string): Promise<BayAppErrorSetup> {
  return bayGet(`${I}/apps/${enc(appId)}/errors/setup`);
}
export function getBayAppSources(appId: string, days = 30): Promise<BayAppSources> {
  return bayGet(`${I}/apps/${enc(appId)}/sources${bayQuery({ days })}`);
}
