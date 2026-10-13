// LeoBay「课程」栏的接口客户端：卖课、看课，单独定价与打包定价。
// 网关路由 `/v1/bay/lessons*`、`/v1/bay/lesson-bundles*`、`/v1/bay/lesson-orders*`。
// 字段名与网关出参逐字一致；界面不直接拼地址。价格单位是本站账本货币的最小单位（.com 是美分）。

import { bayDelete, bayGet, bayPatch, bayPost } from "./http";
import { bayQuery } from "./directory";
import type { BayAppAuthor } from "./apps";
import type { BayReportReason } from "./services";

export type BayLessonStatus = "draft" | "published" | "offline";

export interface BayLesson {
  id: string;
  owner_id: string;
  title: string;
  summary: string;
  description: string;
  cover_url: string | null;
  gallery_urls?: string[];
  category: string | null;
  posted_site: string | null;
  /** 0 = 免费。 */
  price_fen: number;
  status: BayLessonStatus;
  chapter_count: number;
  sales_count: number;
  rating_avg: number;
  rating_count: number;
  published_at: string | null;
  updated_at: string | null;
  author?: BayAppAuthor | null;
  custom_terms?: string | null;
  audience_mode?: "public" | "verified_first" | "invited" | "group" | null;
  audience_handle?: string | null;
  audience_member_ids?: string[];
  deadline_at?: string | null;
}

export interface BayLessonMine extends BayLesson {
  moderation_hidden: boolean;
  created_at: string | null;
}

/** 大纲里的一节。内容本身不在这里：要调 `openBayLessonChapter` 才拿得到。 */
export interface BayLessonChapter {
  id: string;
  lesson_id: string;
  position: number;
  title: string;
  work_site_key: string | null;
  work_title: string;
  free_preview: boolean;
}

export type BayLessonPurchaseStatus =
  | "active"
  | "refund_requested"
  | "refund_declined"
  | "disputed"
  | "refunded"
  | "completed";

export interface BayLessonPurchase {
  id: string;
  buyer_id: string;
  seller_id: string;
  item_kind: "lesson" | "bundle";
  item_id: string;
  item_title: string;
  contract_id: string | null;
  price_fen: number;
  status: BayLessonPurchaseStatus;
  opened_at: string | null;
  refund_reason: string | null;
  refund_requested_at: string | null;
  /** 卖家超过这个时刻没处理，退款视为同意。 */
  refund_due_at: string | null;
  refund_decided_at: string | null;
  refund_note: string | null;
  /** 到这个时刻自动确认、款项放给卖家。 */
  confirm_due_at: string | null;
  created_at: string | null;
  /** 没打开过付费章节：可以不说理由直接退。 */
  instant_refund: boolean;
}

export interface BayLessonDetail {
  lesson: BayLesson | BayLessonMine;
  chapters: BayLessonChapter[];
  viewer: { is_owner: boolean; owned: boolean; purchase: BayLessonPurchase | null };
}

export interface BayLessonInput {
  title?: string;
  summary?: string;
  description?: string;
  cover_url?: string | null;
  gallery_urls?: string[];
  category?: string | null;
  posted_site?: string | null;
  price_fen?: number;
  custom_terms?: string | null;
  audience_mode?: "public" | "verified_first" | "invited" | "group" | null;
  audience_handle?: string | null;
  audience_member_ids?: string[];
  deadline_at?: string | null;
}

export interface BayLessonChapterInput {
  title?: string;
  /** 卖家库里的一份文件。新建时必填，建好后不能换。 */
  work?: { kind: "task" | "artifact"; id: string };
  free_preview?: boolean;
}

export interface BayLessonListParams {
  site?: string;
  category?: string;
  q?: string;
  offset?: number;
  limit?: number;
}

export interface BayLessonBundle {
  id: string;
  owner_id: string;
  title: string;
  summary: string;
  cover_url: string | null;
  gallery_urls?: string[];
  price_fen: number;
  status: BayLessonStatus;
  sales_count: number;
  rating_avg: number;
  rating_count: number;
  published_at: string | null;
  updated_at: string | null;
  /** 套餐里的课（已上架的）。列表与详情里都带。 */
  lessons?: BayLesson[];
  /** 这些课单买加起来多少钱。 */
  lessons_total_fen?: number;
  author?: BayAppAuthor | null;
}

export interface BayLessonBundleMine extends BayLessonBundle {
  moderation_hidden: boolean;
  created_at: string | null;
  lesson_ids: string[];
}

export interface BayLessonBundleDetail {
  bundle: BayLessonBundle | BayLessonBundleMine;
  viewer: { is_owner: boolean; owned: boolean; purchase: BayLessonPurchase | null; owned_lesson_ids: string[] };
}

export interface BayLessonBundleInput {
  title?: string;
  summary?: string;
  cover_url?: string | null;
  gallery_urls?: string[];
  price_fen?: number;
}

export interface BayLessonChapterOpen {
  chapter: BayLessonChapter;
  /** 只读查看页的地址（作品所在站的 `/share/<id>`）。在新窗口打开。 */
  preview_url: string;
  site_key: string | null;
}

export interface BayPurchasedLesson {
  lesson: BayLesson;
  purchase: BayLessonPurchase;
  /** 经哪个套餐买到的；直接买的为 null。 */
  via_bundle_id: string | null;
  done_count: number;
}

const L = "/v1/bay/lessons";
const B = "/v1/bay/lesson-bundles";
const O = "/v1/bay/lesson-orders";
const enc = encodeURIComponent;

// ---- 课程 ----
export function listBayLessons(params: BayLessonListParams = {}, signal?: AbortSignal): Promise<{ items: BayLesson[]; next_offset: number | null }> {
  return bayGet(`${L}${bayQuery({ site: params.site, category: params.category, q: params.q, offset: params.offset, limit: params.limit })}`, { anonymous: true, signal });
}
export function getBayLesson(id: string, signal?: AbortSignal): Promise<BayLessonDetail> {
  return bayGet(`${L}/${enc(id)}`, { anonymous: true, signal });
}
export function listMyBayLessons(signal?: AbortSignal): Promise<{ items: BayLessonMine[]; limit: number }> {
  return bayGet(`${L}/mine`, { signal });
}
export function createBayLesson(input: BayLessonInput): Promise<{ lesson: BayLessonMine }> {
  return bayPost(L, input);
}
export function updateBayLesson(id: string, patch: BayLessonInput): Promise<{ lesson: BayLessonMine }> {
  return bayPatch(`${L}/${enc(id)}`, patch);
}
/** 上架。缺东西时网关回 400，`BayApiError.message` 是「还差这几项才能上架：…」。 */
export function publishBayLesson(id: string): Promise<{ lesson: BayLessonMine }> {
  return bayPost(`${L}/${enc(id)}/publish`);
}
export function unpublishBayLesson(id: string): Promise<{ lesson: BayLessonMine }> {
  return bayPost(`${L}/${enc(id)}/unpublish`);
}
export function deleteBayLesson(id: string): Promise<{ ok: boolean }> {
  return bayDelete(`${L}/${enc(id)}`);
}
export function addBayLessonChapter(lessonId: string, input: BayLessonChapterInput): Promise<{ chapter: BayLessonChapter; chapters: BayLessonChapter[] }> {
  return bayPost(`${L}/${enc(lessonId)}/chapters`, input);
}
export function updateBayLessonChapter(lessonId: string, chapterId: string, patch: Pick<BayLessonChapterInput, "title" | "free_preview">): Promise<{ chapter: BayLessonChapter; chapters: BayLessonChapter[] }> {
  return bayPatch(`${L}/${enc(lessonId)}/chapters/${enc(chapterId)}`, patch);
}
export function deleteBayLessonChapter(lessonId: string, chapterId: string): Promise<{ chapters: BayLessonChapter[] }> {
  return bayDelete(`${L}/${enc(lessonId)}/chapters/${enc(chapterId)}`);
}
/** 按给出的顺序重排全部章节（必须是这门课全部章节 id 的一个排列）。 */
export function reorderBayLessonChapters(lessonId: string, ids: string[]): Promise<{ chapters: BayLessonChapter[] }> {
  return bayPost(`${L}/${enc(lessonId)}/chapters/order`, { ids });
}

export function reportBayLesson(id: string, reason: BayReportReason, detail?: string): Promise<{ duplicate: boolean }> {
  return bayPost(`${L}/${enc(id)}/report`, { reason, detail: detail ?? "" });
}

// ---- 看课 ----
/** 打开一节。免费试看要登录；付费章节要买过，否则 403。 */
export function openBayLessonChapter(lessonId: string, chapterId: string): Promise<BayLessonChapterOpen> {
  return bayPost(`${L}/${enc(lessonId)}/chapters/${enc(chapterId)}/open`);
}
export function getBayLessonProgress(lessonId: string): Promise<{ done_chapter_ids: string[] }> {
  return bayGet(`${L}/${enc(lessonId)}/progress`);
}
export function setBayLessonProgress(lessonId: string, chapterId: string, done: boolean): Promise<{ done_chapter_ids: string[] }> {
  return bayPost(`${L}/${enc(lessonId)}/progress`, { chapter_id: chapterId, done });
}
export function listPurchasedBayLessons(): Promise<{ items: BayPurchasedLesson[] }> {
  return bayGet(`${L}/purchased`);
}

// ---- 套餐 ----
export function listBayLessonBundles(params: { q?: string; offset?: number; limit?: number } = {}, signal?: AbortSignal): Promise<{ items: BayLessonBundle[]; next_offset: number | null }> {
  return bayGet(`${B}${bayQuery({ q: params.q, offset: params.offset, limit: params.limit })}`, { anonymous: true, signal });
}
export function getBayLessonBundle(id: string, signal?: AbortSignal): Promise<BayLessonBundleDetail> {
  return bayGet(`${B}/${enc(id)}`, { anonymous: true, signal });
}
export function listMyBayLessonBundles(): Promise<{ items: BayLessonBundleMine[]; limit: number }> {
  return bayGet(`${B}/mine`);
}
export function createBayLessonBundle(input: BayLessonBundleInput): Promise<{ bundle: BayLessonBundleMine }> {
  return bayPost(B, input);
}
export function updateBayLessonBundle(id: string, patch: BayLessonBundleInput): Promise<{ bundle: BayLessonBundleMine }> {
  return bayPatch(`${B}/${enc(id)}`, patch);
}
/** 设定套餐里有哪几门课（自己的、已上架的，2–20 门），顺序就是给出的顺序。 */
export function setBayLessonBundleLessons(id: string, lessonIds: string[]): Promise<{ bundle: BayLessonBundleMine }> {
  return bayPost(`${B}/${enc(id)}/lessons`, { lesson_ids: lessonIds });
}
export function publishBayLessonBundle(id: string): Promise<{ bundle: BayLessonBundleMine }> {
  return bayPost(`${B}/${enc(id)}/publish`);
}
export function unpublishBayLessonBundle(id: string): Promise<{ bundle: BayLessonBundleMine }> {
  return bayPost(`${B}/${enc(id)}/unpublish`);
}
export function deleteBayLessonBundle(id: string): Promise<{ ok: boolean }> {
  return bayDelete(`${B}/${enc(id)}`);
}

export function reportBayLessonBundle(id: string, reason: BayReportReason, detail?: string): Promise<{ duplicate: boolean }> {
  return bayPost(`${B}/${enc(id)}/report`, { reason, detail: detail ?? "" });
}

// ---- 下单、确认、退款 ----
/** 买一门课或一个套餐。免费的直接开通；付费的从账单里绑的卡扣款，由 Stripe 托管 7 天。 */
export function purchaseBayLesson(itemKind: "lesson" | "bundle", itemId: string): Promise<{ purchase: BayLessonPurchase; contract_id?: string }> {
  return bayPost(O, { item_kind: itemKind, item_id: itemId });
}
export function listBoughtBayLessonOrders(): Promise<{ items: BayLessonPurchase[] }> {
  return bayGet(`${O}/bought`);
}
export function listSoldBayLessonOrders(): Promise<{ items: BayLessonPurchase[] }> {
  return bayGet(`${O}/sold`);
}
/** 买家确认：款项放给卖家，之后不能再退。 */
export function confirmBayLessonOrder(purchaseId: string): Promise<{ purchase: BayLessonPurchase }> {
  return bayPost(`${O}/${enc(purchaseId)}/confirm`);
}
/** 申请退款。没打开过付费章节的立即退（`refunded: true`）；打开过的要写理由，等卖家 48 小时内处理。 */
export function requestBayLessonRefund(purchaseId: string, reason: string): Promise<{ purchase: BayLessonPurchase; refunded: boolean }> {
  return bayPost(`${O}/${enc(purchaseId)}/refund`, { reason });
}
/** 卖家处理退款申请。 */
export function decideBayLessonRefund(purchaseId: string, agree: boolean, note?: string): Promise<{ purchase: BayLessonPurchase; refunded: boolean }> {
  return bayPost(`${O}/${enc(purchaseId)}/refund/decide`, { agree, note: note ?? "" });
}
/** 卖家拒绝后，买家请平台介入。 */
export function escalateBayLessonRefund(purchaseId: string): Promise<{ purchase: BayLessonPurchase }> {
  return bayPost(`${O}/${enc(purchaseId)}/refund/escalate`);
}
