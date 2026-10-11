// LeoBay「作品」栏的接口客户端：用户把自己做的应用 / 网站上架到 Bay，别人点开就能用。
// 网关路由 `/v1/bay/apps*`（oceanleo `backend/app/routers/bay_apps*_router.py`）。
// 公开的读不登录也能调（`anonymous: true`）；写、核验、举报、看数据都要登录。
// 本文件是三个界面单元共用的合同：字段名与网关出参逐字一致，界面不直接拼地址。

import { accessToken } from "../auth/client";
import { GATEWAY_BASE } from "../auth/config";
import { bayDelete, bayGet, bayPatch, bayPost } from "./http";
import { bayQuery } from "./directory";
import type { BayReportReason } from "./services";

/** hosted 平台托管的静态站 / external 作者自己的网站 / computer 作者云电脑上的应用（经公开网址）。 */
export type BayAppSourceKind = "hosted" | "external" | "computer";
export type BayAppEmbedMode = "embed" | "link";
export type BayAppStatus = "draft" | "published" | "offline";

/** 任何人都能看到的字段。 */
export interface BayApp {
  id: string;
  owner_id: string;
  title: string;
  summary: string;
  description: string;
  cover_url: string | null;
  /** 类目 = 站 key（或 `other`）。 */
  category: string | null;
  posted_site: string | null;
  source_kind: BayAppSourceKind;
  /** 打开作品的 https 地址。 */
  url: string;
  url_host: string;
  /** 创作者选的：`embed` = 可以在 Bay 页内的窗口里用；`link` = 只跳转。 */
  embed_mode: BayAppEmbedMode;
  /** 网关探测的结果：对方站是否允许被嵌入。`null` = 没测过。 */
  embed_ok: boolean | null;
  status: BayAppStatus;
  view_count: number;
  open_count: number;
  published_at: string | null;
  updated_at: string | null;
  /** free 免费 / one_time 一次买断 / subscription 按月订阅。 */
  price_model: "free" | "one_time" | "subscription";
  /** 买断价或月价（分）；免费是 0。 */
  price_fen: number;
  /** 免费试用天数；0 = 没有试用。 */
  trial_days: number;
  /** 买断的人数加订阅过的人数。 */
  sales_count: number;
  rating_avg: number;
  rating_count: number;
  /** open = 作品页接受留言；off = 作者关了。 */
  feedback_mode: "open" | "off";
  /** 作者开通了「用 OceanLeo 账号登录」。 */
  login_enabled: boolean;
  follower_count: number;
  /** 只在公开列表里带：这张卡占的是「新作品位」。 */
  fresh?: boolean;
  /** 列表与详情里带：作者的公开名片。 */
  author?: BayAppAuthor | null;
}

export interface BayAppAuthor {
  user_id: string;
  handle: string | null;
  display_name: string;
  avatar_url: string | null;
  official: boolean;
}

/** 本人看自己的作品时多出来的字段。 */
export interface BayAppMine extends BayApp {
  hosted_site_id: string | null;
  /** 来源是云电脑时：用的是哪个公开网址。 */
  endpoint_id: string | null;
  /** 作者开了 AI 代答。 */
  ai_answer: boolean;
  verified_at: string | null;
  verified: boolean;
  moderation_hidden: boolean;
  created_at: string | null;
}

export interface BayAppListParams {
  /** 当前所在站：这个站的作品排在前面。 */
  site?: string;
  category?: string;
  q?: string;
  offset?: number;
  limit?: number;
}

export interface BayAppDraftInput {
  source_kind: BayAppSourceKind;
  /** `hosted` 时必填：`/v1/hosted-sites` 里那一行的 id。 */
  hosted_site_id?: string;
  /** `external` 时必填。 */
  url?: string;
  /** `computer` 时必填：`/v1/bay/app-endpoints` 里那一行的 id；作品的地址由网关按它生成。 */
  endpoint_id?: string;
  title?: string;
  summary?: string;
  description?: string;
  cover_url?: string | null;
  category?: string | null;
  posted_site?: string | null;
  embed_mode?: BayAppEmbedMode;
}

export type BayAppPatchInput = Partial<Omit<BayAppDraftInput, "source_kind" | "hosted_site_id">>;

export interface BayAppVerification {
  token: string;
  url_host: string;
  /** 方式一：把这一行放进首页的 `<head>`。 */
  meta_tag: string;
  /** 方式二：在这个路径放一个纯文本文件，内容是 `file_content`。 */
  file_path: string;
  file_content: string;
}

export interface BayAppVerificationResult {
  verified: boolean;
  method: "meta" | "file" | null;
  /** 没通过时的一句说明。 */
  reason: string | null;
  app: BayAppMine;
}

export interface BayAppEmbedCheck {
  embed_ok: boolean | null;
  reason: string | null;
  app: BayAppMine;
}

export type BayAppEventKind = "view" | "open";

export interface BayAppStatsDay {
  day: string;
  views: number;
  opens: number;
}

export interface BayAppStats {
  totals: { views: number; opens: number };
  days: BayAppStatsDay[];
}

const BASE = "/v1/bay/apps";
const one = (id: string): string => `${BASE}/${encodeURIComponent(id)}`;

export function listBayApps(params: BayAppListParams = {}, signal?: AbortSignal): Promise<{ items: BayApp[]; next_offset: number | null }> {
  return bayGet(`${BASE}${bayQuery({ site: params.site, category: params.category, q: params.q, offset: params.offset, limit: params.limit })}`, { anonymous: true, signal });
}

export function getBayApp(id: string, signal?: AbortSignal): Promise<{ app: BayApp | BayAppMine; viewer: { is_owner: boolean } }> {
  return bayGet(one(id), { anonymous: true, signal });
}

export function listMyBayApps(signal?: AbortSignal): Promise<{ items: BayAppMine[]; limit: number }> {
  return bayGet(`${BASE}/mine`, { signal });
}

export function createBayApp(input: BayAppDraftInput): Promise<{ app: BayAppMine }> {
  return bayPost(BASE, input);
}

export function updateBayApp(id: string, patch: BayAppPatchInput): Promise<{ app: BayAppMine }> {
  return bayPatch(one(id), patch);
}

/** 上架。缺东西时网关回 400，`detail.missing` 是缺的那几项（中文短语）。 */
export function publishBayApp(id: string): Promise<{ app: BayAppMine }> {
  return bayPost(`${one(id)}/publish`);
}

export function unpublishBayApp(id: string): Promise<{ app: BayAppMine }> {
  return bayPost(`${one(id)}/unpublish`);
}

export function deleteBayApp(id: string): Promise<{ ok: boolean }> {
  return bayDelete(one(id));
}

export function startBayAppVerification(id: string): Promise<BayAppVerification> {
  return bayPost(`${one(id)}/verification`);
}

export function checkBayAppVerification(id: string): Promise<BayAppVerificationResult> {
  return bayPost(`${one(id)}/verification/check`);
}

export function checkBayAppEmbed(id: string): Promise<BayAppEmbedCheck> {
  return bayPost(`${one(id)}/embed-check`);
}

export function reportBayApp(id: string, reason: BayReportReason, detail?: string): Promise<{ duplicate: boolean }> {
  return bayPost(`${one(id)}/report`, { reason, detail: detail ?? "" });
}

/** 记一次浏览 / 打开；不登录也记。失败不打扰用户：计数丢一次不影响他用作品。 */
export async function recordBayAppEvent(id: string, kind: BayAppEventKind, source = ""): Promise<void> {
  try {
    const token = await accessToken().catch(() => null);
    await fetch(`${GATEWAY_BASE}${one(id)}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ kind, source }),
      cache: "no-store",
      credentials: "include",
      keepalive: true,
    });
  } catch {
    /* 计数是尽力而为 */
  }
}

export function getBayAppStats(id: string, days = 30): Promise<BayAppStats> {
  return bayGet(`${one(id)}/stats${bayQuery({ days })}`);
}
