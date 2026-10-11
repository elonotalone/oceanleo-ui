// LeoBay 作品的「留言与反馈」接口客户端：访客在作品页给作者留言（报错 / 建议 / 提问），
// 公开或只给作者看，可以来回回复，作者或留言的人可以标成已解决；作者可以打开 AI 代答。
// 网关路由 `/v1/bay/app-feedback*`、`/v1/bay/app-assistant*`。字段名与网关出参逐字一致，本文件是合同。

import { bayGet, bayPatch, bayPost } from "./http";
import { bayQuery } from "./directory";
import type { BayReportReason } from "./services";

export type BayAppThreadKind = "bug" | "idea" | "question";
export type BayAppThreadVisibility = "public" | "private";
/** open 作者还没回 / answered 作者或 AI 回过 / resolved 已解决。 */
export type BayAppThreadStatus = "open" | "answered" | "resolved";
export type BayAppPostAuthorKind = "visitor" | "owner" | "ai";

export interface BayAppFeedbackPerson {
  user_id: string | null;
  handle: string | null;
  display_name: string;
  avatar_url: string | null;
}

export interface BayAppThread {
  id: string;
  app_id: string;
  kind: BayAppThreadKind;
  visibility: BayAppThreadVisibility;
  title: string;
  body: string;
  status: BayAppThreadStatus;
  reply_count: number;
  ai_answered: boolean;
  author: BayAppFeedbackPerson;
  created_at: string | null;
  last_post_at: string | null;
  viewer_is_author: boolean;
  viewer_is_owner: boolean;
  /** 只在「我收到的」「我写的」两个列表里带：这条留言属于哪个作品。 */
  app_title?: string;
}

export interface BayAppThreadPost {
  id: string;
  thread_id: string;
  author_kind: BayAppPostAuthorKind;
  /** AI 写的回复：`display_name` 是「AI 助手」，其余为空。 */
  author: BayAppFeedbackPerson;
  body: string;
  created_at: string | null;
}

export interface BayAppFeedbackSummary {
  total: number;
  open: number;
  answered: number;
  resolved: number;
  bug: number;
  idea: number;
  question: number;
}

export interface BayAppFeedbackSettings {
  /** open = 接受留言；off = 作者关了留言，访客只能看以前的。 */
  feedback_mode: "open" | "off";
  ai_answer: boolean;
  /** 作者最近 20 条已回复留言的首次回复用时中位数（小时，向上取整）；不足 3 条时是 null。 */
  typical_reply_hours: number | null;
}

export interface BayAppThreadPage {
  summary: BayAppFeedbackSummary;
  settings: BayAppFeedbackSettings;
  items: BayAppThread[];
  next_offset: number | null;
}

export interface BayAppThreadDetail {
  thread: BayAppThread;
  posts: BayAppThreadPost[];
}

export interface BayAppThreadInput {
  kind: BayAppThreadKind;
  title: string;
  body: string;
  visibility: BayAppThreadVisibility;
}

export interface BayAppDigest {
  week_start: string;
  summary: string;
  counts: { total: number; bug: number; idea: number; question: number; open: number };
  created_at: string | null;
}

const F = "/v1/bay/app-feedback";
const A = "/v1/bay/app-assistant";
const enc = encodeURIComponent;

/** 作品页的留言列表：不登录也能看公开的；登录后还能看到自己写的私下留言；作者看得到全部。 */
export function listBayAppThreads(
  appId: string,
  params: { kind?: BayAppThreadKind; status?: BayAppThreadStatus; offset?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<BayAppThreadPage> {
  return bayGet(`${F}/apps/${enc(appId)}/threads${bayQuery(params)}`, { anonymous: true, signal });
}
export function createBayAppThread(appId: string, input: BayAppThreadInput): Promise<{ thread: BayAppThread; moderation_hidden: boolean; moderation_message: string }> {
  return bayPost(`${F}/apps/${enc(appId)}/threads`, input);
}
export function getBayAppThread(threadId: string, signal?: AbortSignal): Promise<BayAppThreadDetail> {
  return bayGet(`${F}/threads/${enc(threadId)}`, { anonymous: true, signal });
}
/** 只有留言的人和作品作者能回复。 */
export function replyBayAppThread(threadId: string, body: string): Promise<BayAppThreadDetail> {
  return bayPost(`${F}/threads/${enc(threadId)}/posts`, { body });
}
/** 作者或留言的人：标成已解决 / 重新打开。 */
export function setBayAppThreadStatus(threadId: string, status: "resolved" | "open"): Promise<{ thread: BayAppThread }> {
  return bayPost(`${F}/threads/${enc(threadId)}/status`, { status });
}
export function reportBayAppThread(threadId: string, reason: BayReportReason, detail?: string): Promise<{ duplicate: boolean }> {
  return bayPost(`${F}/threads/${enc(threadId)}/report`, { reason, detail: detail ?? "" });
}
/** 作者：我所有作品收到的留言。 */
export function listBayAppFeedbackInbox(params: { status?: BayAppThreadStatus; app_id?: string; offset?: number; limit?: number } = {}): Promise<{ items: BayAppThread[]; next_offset: number | null; open_count: number }> {
  return bayGet(`${F}/mine/inbox${bayQuery(params)}`);
}
/** 我写过的留言。 */
export function listMyBayAppThreads(params: { offset?: number; limit?: number } = {}): Promise<{ items: BayAppThread[]; next_offset: number | null }> {
  return bayGet(`${F}/mine/threads${bayQuery(params)}`);
}
export function updateBayAppFeedbackSettings(appId: string, patch: { feedback_mode?: "open" | "off"; ai_answer?: boolean }): Promise<{ settings: BayAppFeedbackSettings }> {
  return bayPatch(`${F}/apps/${enc(appId)}/settings`, patch);
}
/** 作者：这个作品最近一周的留言摘要（AI 写的）；还没有时 `digest` 是 null。 */
export function getBayAppDigest(appId: string): Promise<{ digest: BayAppDigest | null }> {
  return bayGet(`${A}/apps/${enc(appId)}/digest`);
}
/** 作者：现在就重写本周摘要（每个作品每天最多 3 次）。 */
export function refreshBayAppDigest(appId: string): Promise<{ digest: BayAppDigest }> {
  return bayPost(`${A}/apps/${enc(appId)}/digest`);
}
