// LeoBay 买家评论区的接口客户端（服务、课程、套餐共用）。网关路由 `/v1/bay/reviews*`。
// 只有付过款、订单已完成的买家能写；写完立刻公开。字段名与网关出参逐字一致。

import { bayDelete, bayGet, bayPost } from "./http";
import { bayQuery } from "./directory";

export type BayReviewItemKind = "service" | "lesson" | "bundle" | "app";
/** all 全部 / good 好评（4–5 星）/ mid 中评（3 星）/ bad 差评（1–2 星）/ photos 有图 / followup 有追评。 */
export type BayReviewFilter = "all" | "good" | "mid" | "bad" | "photos" | "followup";

export interface BayItemReview {
  id: string;
  rating: number;
  body: string;
  photos: string[];
  anonymous: boolean;
  /** 匿名时是「匿名买家」，没有头像和主页。 */
  author: { user_id: string | null; handle: string | null; display_name: string; avatar_url: string | null };
  created_at: string | null;
  seller_reply: string;
  seller_replied_at: string | null;
  followup_body: string | null;
  followup_photos: string[];
  followup_at: string | null;
  followup_reply: string | null;
  followup_replied_at: string | null;
  helpful_count: number;
  /** 当前登录的人有没有点过「有用」。 */
  viewer_voted: boolean;
  /** 当前登录的人是不是这条评价的作者 / 被评的卖家。 */
  viewer_is_author: boolean;
  viewer_is_seller: boolean;
}

export interface BayItemReviewSummary {
  total: number;
  /** 平均星级，保留一位小数；没有评价时是 0。 */
  avg: number;
  good: number;
  mid: number;
  bad: number;
  photos: number;
  followup: number;
}

export interface BayItemReviewPage {
  summary: BayItemReviewSummary;
  items: BayItemReview[];
  next_offset: number | null;
}

/** 我能评价的一笔订单。 */
export interface BayReviewableOrder {
  contract_id: string;
  item_kind: BayReviewItemKind;
  item_id: string;
  item_title: string;
  completed_at: string | null;
  /** 已经写过的那条（可以追评）；没写过是 null。 */
  review: BayItemReview | null;
}

export interface BayItemReviewInput {
  contract_id: string;
  rating: number;
  body: string;
  /** 最多 9 张，每个都是 https 图片地址。 */
  photos?: string[];
  anonymous?: boolean;
}

const R = "/v1/bay/reviews";
const enc = encodeURIComponent;

export function listBayItemReviews(
  itemKind: BayReviewItemKind,
  itemId: string,
  params: { filter?: BayReviewFilter; offset?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<BayItemReviewPage> {
  return bayGet(`${R}${bayQuery({ item_kind: itemKind, item_id: itemId, filter: params.filter, offset: params.offset, limit: params.limit })}`, { anonymous: true, signal });
}
/** 我对这件商品有没有可以评价 / 追评的订单。 */
export function getBayReviewableOrder(itemKind: BayReviewItemKind, itemId: string): Promise<{ order: BayReviewableOrder | null }> {
  return bayGet(`${R}/reviewable${bayQuery({ item_kind: itemKind, item_id: itemId })}`);
}
export function createBayItemReview(input: BayItemReviewInput): Promise<{ review: BayItemReview; moderation_hidden: boolean; moderation_message: string }> {
  return bayPost(R, input);
}
/** 追评：每条评价只能追一次，评价发出 180 天内。 */
export function addBayItemReviewFollowup(reviewId: string, body: string, photos?: string[]): Promise<{ review: BayItemReview }> {
  return bayPost(`${R}/${enc(reviewId)}/followup`, { body, photos: photos ?? [] });
}
/** 卖家回复评价（`to: "review"`）或回复追评（`to: "followup"`），各一次。 */
export function replyBayItemReview(reviewId: string, body: string, to: "review" | "followup" = "review"): Promise<{ review: BayItemReview }> {
  return bayPost(`${R}/${enc(reviewId)}/reply`, { body, to });
}
export function voteBayItemReview(reviewId: string): Promise<{ helpful_count: number; viewer_voted: boolean }> {
  return bayPost(`${R}/${enc(reviewId)}/helpful`);
}
export function unvoteBayItemReview(reviewId: string): Promise<{ helpful_count: number; viewer_voted: boolean }> {
  return bayDelete(`${R}/${enc(reviewId)}/helpful`);
}
