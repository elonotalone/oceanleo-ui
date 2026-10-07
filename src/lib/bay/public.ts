// Bay 公开面的取数与数据整形：门户的公开主页、公开服务页（服务端组件）调这里。
//
// 硬约束（契约 §0 第 8 条、§6、§8）：
// - 能在服务端跑：不碰 `window`、`document`，不 import `./http`、`../agent` 这类带登录态的模块；
// - 不带登录：不发 cookie、不加 Authorization，匿名看到什么就是什么；
// - 只认白名单字段：网关多给的东西（邮箱、手机号、联系方式、附件地址、内部编号）一个字也不进页面；
// - 医疗、法律、宠物医疗（regulated_domain ∈ medical / legal / vet）第一版不上架：这类服务一律当没有。
//
// 返回值约定：`null` 只表示网关明确说「没有」（404，或 400/422 这类认不出的参数）；
// 网关不通、超时、5xx 抛 `BayPublicFetchError`——让页面走错误页，而不是把一次故障当成 404 缓存下来、
// 还被搜索引擎当成页面不存在。
import { GATEWAY_BASE } from "../auth/config";

/** 公开页数据的缓存时长（Next 的 fetch 缓存）。 */
export const BAY_PUBLIC_REVALIDATE_SECONDS = 300;
const FETCH_TIMEOUT_MS = 8000;

export type BayPublicVettingState = "verified" | "expired" | "unverified";
export type BayPublicPriceTier = "basic" | "standard" | "premium";
export type BayPublicMediaKind = "image" | "video" | "audio" | "file";

export interface BayPublicAuthor {
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
}

export interface BayReviewPublic {
  id: string;
  /** 1–5。 */
  rating: number;
  body: string;
  created_at: string | null;
  author_role: "buyer" | "seller";
  author: BayPublicAuthor | null;
}

export interface BayServiceTierPublic {
  tier: BayPublicPriceTier;
  title: string;
  description: string;
  price_fen: number;
  currency: string;
  /** null = 交期面议。 */
  delivery_days: number | null;
  /** -1 = 不限改稿。 */
  revisions: number;
  features: string[];
}

export interface BayServiceAddonPublic {
  id: string;
  title: string;
  description: string;
  price_fen: number;
  currency: string;
  extra_days: number;
}

export interface BayServiceFaqPublic {
  id: string;
  question: string;
  answer: string;
}

export interface BayServiceMediaPublic {
  id: string;
  kind: BayPublicMediaKind;
  url: string;
  poster_url: string | null;
  caption: string;
}

export interface BayPublicVettingEntry {
  domain: string;
  state: BayPublicVettingState;
}

/** 服务页上的卖家卡：陌生人看得到的那几项。 */
export interface BayServiceSellerPublic {
  handle: string;
  display_name: string;
  avatar_url: string | null;
  headline: string;
  rating_avg: number | null;
  rating_count: number;
  completed_contracts: number;
  response_minutes: number | null;
  languages: string[];
  skills: string[];
}

export interface BayServicePublicData {
  id: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  cover_url: string | null;
  currency: string;
  /** 启用档位里的最低价；没有档位时是服务原价；都没有是 null。 */
  min_price_fen: number | null;
  /** 最便宜一档的交付天数；null = 交期面议，页面不显示天数。 */
  delivery_days: number | null;
  delivery_mode: "on_platform" | "off_platform";
  order_count: number;
  tags: string[];
  tiers: BayServiceTierPublic[];
  addons: BayServiceAddonPublic[];
  faq: BayServiceFaqPublic[];
  media: BayServiceMediaPublic[];
  reviews: BayReviewPublic[];
  rating_avg: number | null;
  rating_count: number;
  seller: BayServiceSellerPublic | null;
  created_at: string | null;
  updated_at: string | null;
}

/** 主页上的一张服务卡。 */
export interface BayServiceSummaryPublic {
  id: string;
  title: string;
  summary: string;
  cover_url: string | null;
  currency: string;
  min_price_fen: number | null;
  delivery_days: number | null;
  order_count: number;
}

export interface BayShowcasePublic {
  id: string;
  /** platform = 平台见证的交付记录（来自完成的任务）；portfolio = 卖家自选的作品。 */
  kind: "platform" | "portfolio";
  title: string;
  summary: string;
  cover_url: string | null;
}

export interface BayProfilePublicData {
  handle: string;
  display_name: string;
  avatar_url: string | null;
  headline: string;
  bio: string;
  categories: string[];
  skills: string[];
  languages: string[];
  rating_avg: number | null;
  rating_count: number;
  completed_contracts: number;
  response_minutes: number | null;
  on_time_rate: number | null;
  vetting: BayPublicVettingEntry[];
  services: BayServiceSummaryPublic[];
  showcase: BayShowcasePublic[];
  reviews: BayReviewPublic[];
}

// ---- 整形：只拿白名单字段，类型不对的当没有 -----------------------------------------------

type Raw = Record<string, unknown>;

const RESTRICTED_DOMAINS = ["medical", "legal", "vet"];
const HANDLE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;
const SERVICE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

function asRaw(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function finite(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
}

function wholeNumber(value: unknown, fallback = 0): number {
  const number = finite(value);
  return number === null ? fallback : Math.max(0, Math.round(number));
}

/** 只放行 http(s) 地址；`javascript:`、`data:` 等一律当没有。 */
function httpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || raw.length > 2048 || !/^https?:\/\//i.test(raw)) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function textList(value: unknown, limit: number, itemMax: number): string[] {
  const out: string[] = [];
  for (const item of asList(value)) {
    const entry = text(item, itemMax);
    if (entry && !out.includes(entry)) out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

function currencyOf(value: unknown): string {
  const code = text(value, 8).toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "USD";
}

function isoOrNull(value: unknown): string | null {
  const raw = text(value, 40);
  return raw && !Number.isNaN(Date.parse(raw)) ? raw : null;
}

/** 评分只有在有已公开评价时才有意义；没有评价就是 null（页面写「暂无评价」，不画成 0 分）。 */
function ratingOf(avg: unknown, count: number): number | null {
  const value = finite(avg);
  return count > 0 && value !== null && value > 0 ? Math.min(5, value) : null;
}

function restricted(domain: unknown): boolean {
  return typeof domain === "string" && RESTRICTED_DOMAINS.includes(domain);
}

function authorOf(value: unknown): BayPublicAuthor | null {
  const row = asRaw(value);
  const handle = text(row.handle, 64);
  const name = text(row.display_name, 80) || handle;
  if (!name) return null;
  return { display_name: name, handle: handle && HANDLE.test(handle) ? handle : null, avatar_url: httpUrl(row.avatar_url) };
}

function reviewOf(value: unknown): BayReviewPublic | null {
  const row = asRaw(value);
  const id = text(row.id, 80);
  const rating = finite(row.rating);
  if (!id || rating === null || row.moderation_hidden === true || row.revealed === false) return null;
  return {
    id,
    rating: Math.max(1, Math.min(5, Math.round(rating))),
    body: text(row.body, 2000),
    created_at: isoOrNull(row.created_at),
    author_role: row.author_role === "seller" ? "seller" : "buyer",
    author: authorOf(row.author),
  };
}

function tierOf(value: unknown): BayServiceTierPublic | null {
  const row = asRaw(value);
  if (row.enabled === false) return null;
  const tier: BayPublicPriceTier = row.tier === "standard" || row.tier === "premium" ? row.tier : "basic";
  const days = finite(row.delivery_days);
  const revisions = finite(row.revisions);
  return {
    tier,
    title: text(row.title, 80),
    description: text(row.description, 400),
    price_fen: wholeNumber(row.price_fen),
    currency: currencyOf(row.currency),
    delivery_days: days !== null && days > 0 ? Math.round(days) : null,
    revisions: revisions === null ? 1 : Math.max(-1, Math.round(revisions)),
    features: textList(row.features, 20, 200),
  };
}

const TIER_RANK: Record<BayPublicPriceTier, number> = { basic: 0, standard: 1, premium: 2 };

function addonOf(value: unknown): BayServiceAddonPublic | null {
  const row = asRaw(value);
  const id = text(row.id, 80);
  const title = text(row.title, 120);
  if (!id || !title || row.enabled === false) return null;
  return {
    id,
    title,
    description: text(row.description, 400),
    price_fen: wholeNumber(row.price_fen),
    currency: currencyOf(row.currency),
    extra_days: wholeNumber(row.extra_days),
  };
}

function faqOf(value: unknown): BayServiceFaqPublic | null {
  const row = asRaw(value);
  const id = text(row.id, 80);
  const question = text(row.question, 300);
  if (!id || !question) return null;
  return { id, question, answer: text(row.answer, 3000) };
}

function mediaOf(value: unknown): BayServiceMediaPublic | null {
  const row = asRaw(value);
  const id = text(row.id, 80);
  const url = httpUrl(row.url);
  if (!id || !url) return null;
  const kind: BayPublicMediaKind = row.kind === "video" || row.kind === "audio" || row.kind === "file" ? row.kind : "image";
  return { id, kind, url, poster_url: httpUrl(row.poster_url), caption: text(row.caption, 300) };
}

function sellerOf(value: unknown): BayServiceSellerPublic | null {
  const row = asRaw(value);
  const handle = text(row.handle, 64);
  const name = text(row.display_name, 80) || handle;
  if (!name) return null;
  const count = wholeNumber(row.rating_count);
  const minutes = finite(row.response_minutes);
  return {
    handle: handle && HANDLE.test(handle) ? handle : "",
    display_name: name,
    avatar_url: httpUrl(row.avatar_url),
    headline: text(row.headline, 200),
    rating_avg: ratingOf(row.rating_avg, count),
    rating_count: count,
    completed_contracts: wholeNumber(row.completed_contracts),
    response_minutes: minutes !== null && minutes >= 0 ? minutes : null,
    languages: textList(row.languages, 8, 40),
    skills: textList(row.skills, 24, 40),
  };
}

function minPrice(rows: BayServiceTierPublic[], fallback: unknown): number | null {
  if (rows.length) return Math.min(...rows.map((tier) => tier.price_fen));
  const listed = finite(fallback);
  return listed === null ? null : Math.max(0, Math.round(listed));
}

function minDays(rows: BayServiceTierPublic[], fallback: unknown): number | null {
  const days = rows.map((tier) => tier.delivery_days).filter((value): value is number => value !== null);
  if (days.length) return Math.min(...days);
  const listed = finite(fallback);
  return listed !== null && listed > 0 ? Math.round(listed) : null;
}

function publishedAndVisible(row: Raw): boolean {
  return row.status === undefined || row.status === "published" ? row.moderation_hidden !== true : false;
}

function summaryOf(value: unknown): BayServiceSummaryPublic | null {
  const row = asRaw(value);
  const id = text(row.id, 80);
  const title = text(row.title, 160);
  if (!id || !title || !publishedAndVisible(row) || restricted(row.regulated_domain)) return null;
  return {
    id,
    title,
    summary: text(row.summary, 400),
    cover_url: httpUrl(row.cover_url),
    currency: currencyOf(row.currency),
    min_price_fen: finite(row.min_price_fen) !== null ? wholeNumber(row.min_price_fen) : finite(row.price_fen) !== null ? wholeNumber(row.price_fen) : null,
    delivery_days: finite(row.delivery_days) !== null && Number(row.delivery_days) > 0 ? Math.round(Number(row.delivery_days)) : null,
    order_count: wholeNumber(row.order_count),
  };
}

function showcaseOf(value: unknown): BayShowcasePublic | null {
  const row = asRaw(value);
  const id = text(row.id, 80);
  const title = text(row.title, 160);
  if (!id || !title || row.published === false || row.moderation_hidden === true) return null;
  return { id, kind: row.source_kind === "task" ? "platform" : "portfolio", title, summary: text(row.summary, 600), cover_url: httpUrl(row.cover_url) };
}

function vettingOf(value: unknown): BayPublicVettingEntry[] {
  const out: BayPublicVettingEntry[] = [];
  for (const entry of asList(value)) {
    const row = asRaw(entry);
    const domain = text(row.domain, 40);
    if (!domain || domain === "none" || out.some((item) => item.domain === domain)) continue;
    const state = String(row.state ?? row.status ?? "").toLowerCase();
    // 读不准就是「未核验」：从严兜底，绝不因为读不到就给出称谓。
    const normalized: BayPublicVettingState =
      state === "verified" || state === "valid" || state === "approved" || state === "pass"
        ? "verified"
        : state === "expired" || state === "revoked"
          ? "expired"
          : "unverified";
    out.push({ domain, state: normalized });
  }
  return out;
}

/** 网关的主页响应 → 白名单数据。未公开、被隐藏、没有 handle 都当没有。 */
export function toBayProfilePublic(raw: unknown): BayProfilePublicData | null {
  const root = asRaw(raw);
  const profile = asRaw(root.profile);
  const handle = text(profile.handle, 64);
  if (!handle || !HANDLE.test(handle)) return null;
  if (profile.published === false || profile.moderation_hidden === true) return null;
  const count = wholeNumber(profile.rating_count);
  const minutes = finite(profile.response_minutes);
  const onTime = finite(profile.on_time_rate);
  return {
    handle,
    display_name: text(profile.display_name, 80) || handle,
    avatar_url: httpUrl(profile.avatar_url),
    headline: text(profile.headline, 200),
    bio: text(profile.bio, 5000),
    categories: textList(profile.categories, 8, 40),
    skills: textList(profile.skills, 24, 40),
    languages: textList(profile.languages, 8, 40),
    rating_avg: ratingOf(profile.rating_avg, count),
    rating_count: count,
    completed_contracts: wholeNumber(profile.completed_contracts),
    response_minutes: minutes !== null && minutes >= 0 ? minutes : null,
    on_time_rate: onTime !== null && onTime >= 0 ? onTime : null,
    vetting: vettingOf(profile.vetting),
    services: asList(root.services)
      .map(summaryOf)
      .filter((item): item is BayServiceSummaryPublic => item !== null)
      .slice(0, 50),
    showcase: asList(root.showcase)
      .map(showcaseOf)
      .filter((item): item is BayShowcasePublic => item !== null)
      .slice(0, 50),
    reviews: asList(root.reviews)
      .map(reviewOf)
      .filter((item): item is BayReviewPublic => item !== null)
      .slice(0, 50),
  };
}

/** 网关的服务页响应 → 白名单数据。未上架、被隐藏、受限领域都当没有。 */
export function toBayServicePublic(raw: unknown): BayServicePublicData | null {
  const service = asRaw(asRaw(raw).service);
  const id = text(service.id, 80);
  const title = text(service.title, 200);
  if (!id || !title || !SERVICE_ID.test(id)) return null;
  if (service.status !== "published" || service.moderation_hidden === true) return null;
  if (restricted(service.regulated_domain)) return null;
  const tiers = asList(service.tiers)
    .map(tierOf)
    .filter((item): item is BayServiceTierPublic => item !== null)
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
  const seller = sellerOf(service.seller);
  const summary = asRaw(service.review_summary);
  const reviews = asList(service.reviews)
    .map(reviewOf)
    .filter((item): item is BayReviewPublic => item !== null)
    .slice(0, 50);
  const ratingCount = wholeNumber(summary.rating_count ?? seller?.rating_count);
  return {
    id,
    title,
    summary: text(service.summary, 400),
    description: text(service.description, 20000),
    category: text(service.category, 64),
    cover_url: httpUrl(service.cover_url),
    currency: currencyOf(service.currency ?? tiers[0]?.currency),
    min_price_fen: minPrice(tiers, service.min_price_fen ?? service.price_fen),
    delivery_days: minDays(tiers, service.delivery_days),
    delivery_mode: service.delivery_mode === "off_platform" ? "off_platform" : "on_platform",
    order_count: wholeNumber(service.order_count),
    tags: textList(service.tags, 6, 40),
    tiers,
    addons: asList(service.addons)
      .map(addonOf)
      .filter((item): item is BayServiceAddonPublic => item !== null),
    faq: asList(service.faq)
      .map(faqOf)
      .filter((item): item is BayServiceFaqPublic => item !== null),
    media: asList(service.media)
      .map(mediaOf)
      .filter((item): item is BayServiceMediaPublic => item !== null),
    reviews,
    rating_avg: ratingOf(summary.rating_avg ?? seller?.rating_avg, ratingCount),
    rating_count: ratingCount,
    seller,
    created_at: isoOrNull(service.created_at),
    updated_at: isoOrNull(service.updated_at),
  };
}

// ---- 取数 -------------------------------------------------------------------------------

export class BayPublicFetchError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BayPublicFetchError";
    this.status = status;
  }
}

type NextFetchInit = RequestInit & { next?: { revalidate?: number } };

/** 匿名 GET；404（以及 400/422：参数认不出）返回 null，其余失败抛 `BayPublicFetchError`。 */
async function fetchPublicJson(path: string): Promise<unknown | null> {
  const init: NextFetchInit = {
    method: "GET",
    headers: { accept: "application/json" },
    // 不带登录：不发 cookie，也不加 Authorization。
    credentials: "omit",
    next: { revalidate: BAY_PUBLIC_REVALIDATE_SECONDS },
  };
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    init.signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  }
  let response: Response;
  try {
    response = await fetch(`${GATEWAY_BASE}${path}`, init);
  } catch {
    throw new BayPublicFetchError("网络错误，请稍后再试。", 0);
  }
  if (response.status === 404 || response.status === 400 || response.status === 422) return null;
  if (!response.ok) throw new BayPublicFetchError("服务暂时不可用，请稍后再试。", response.status);
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new BayPublicFetchError("服务返回的内容读不出来。", response.status);
  }
}

/** 公开主页（门户 `/bay/u/<handle>`）。没有这个人、没公开、被隐藏 → null。 */
export async function fetchBayProfilePublic(handle: string): Promise<BayProfilePublicData | null> {
  const wanted = typeof handle === "string" ? handle.trim() : "";
  if (!HANDLE.test(wanted)) return null;
  const body = await fetchPublicJson(`/v1/talent/profiles/${encodeURIComponent(wanted)}`);
  return body === null ? null : toBayProfilePublic(body);
}

/** 公开服务页（门户 `/bay/services/<id>`）。不存在、已下架、被隐藏、受限领域 → null。 */
export async function fetchBayServicePublic(id: string): Promise<BayServicePublicData | null> {
  const wanted = typeof id === "string" ? id.trim() : "";
  if (!SERVICE_ID.test(wanted)) return null;
  const body = await fetchPublicJson(`/v1/talent/services/${encodeURIComponent(wanted)}`);
  return body === null ? null : toBayServicePublic(body);
}
