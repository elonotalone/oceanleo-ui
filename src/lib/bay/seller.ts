// Bay 卖家侧的取数与计算（移植自 talent `lib/talent/seller.ts` 与 `lib/talent/services.ts` 的发布段）。
// 金额一律是「分」。新建服务时带上 `posted_site`（在哪个站发布的，契约 §3.5）。
// 后端 `PUT /me/services/{id}` 用整份载荷覆盖，没带的 status 会被当成草稿：更新时总是带全量。

import { authed } from "../agent";
import { BayApiError, bayDelete, bayGet, bayPatch, bayPost } from "./http";
import type { BayCategory, BayWorkRef } from "./types";

export type BayServiceStatus = "draft" | "published" | "paused";
export type BayCatalogKind = "delivery" | "consult";
export type BayTierName = "basic" | "standard" | "premium";
export type BaySellerPriceUnit = "project" | "session" | "hour" | "day" | "month";
export type BayDeliveryMode = "on_platform" | "off_platform";
export type BayConsultUnit = "session" | "hour";
export type BayFieldValue = string | number | boolean | string[];
export type BayFieldValues = Record<string, BayFieldValue>;

export const BAY_TIER_NAMES: BayTierName[] = ["basic", "standard", "premium"];

/** 限定领域（医疗、法律、宠物医疗）第一版不上架：向导、资质审核里都不出现（契约 §0 第 10 条）。 */
export const BAY_SELLER_RESTRICTED_DOMAINS = ["medical", "legal", "vet"] as const;

export function isSellerRestrictedDomain(domain: unknown): boolean {
  return typeof domain === "string" && (BAY_SELLER_RESTRICTED_DOMAINS as readonly string[]).includes(domain);
}

// ---- 类型 -------------------------------------------------------------------------

export interface BayFieldSpec {
  key: string;
  label_zh: string;
  type: "text" | "int" | "enum" | "bool" | "list";
  enum?: string[];
  max?: number | null;
  max_len?: number | null;
  machine_checkable?: boolean;
}

export interface BaySellerCategory extends BayCategory {
  required_fields?: BayFieldSpec[];
}

export interface BayPricingModel {
  key: string;
  name_zh: string;
  unit: string;
  settlement_rule_zh: string;
  auto_accept_days_default: number | null;
  requires: string[];
}

export interface BayConsultDomain {
  key: string;
  name_zh: string;
  summary?: string | null;
  gated?: boolean;
}

export interface BaySellerProfile {
  user_id?: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  headline: string;
  bio: string;
  categories: string[];
  skills: string[];
  languages: string[];
  availability?: string;
  engagement_kinds?: string[];
  hourly_rate_fen?: number | null;
  min_budget_fen?: number | null;
  offplatform_delivery_opt_in?: boolean;
  /** 账本币种（网关 `currency.ledger_currency()`），价格都按它的最小单位记。 */
  currency?: string;
  published: boolean;
  moderation_hidden?: boolean;
  rating_avg?: number | null;
  rating_count?: number;
  completed_contracts?: number;
  response_minutes?: number | null;
  response_rate?: number | null;
  on_time_rate?: number | null;
  level?: "new" | "rising" | "pro" | "top" | null;
}

export interface BaySellerProfileInput {
  handle: string;
  display_name: string;
  avatar_url?: string | null;
  headline?: string;
  bio?: string;
  categories?: string[];
  skills?: string[];
  languages?: string[];
  availability?: string;
  engagement_kinds?: string[];
  hourly_rate_fen?: number | null;
  min_budget_fen?: number | null;
  offplatform_delivery_opt_in?: boolean;
  published?: boolean;
}

const PROFILE_BODY_KEYS = [
  "handle",
  "display_name",
  "avatar_url",
  "headline",
  "bio",
  "categories",
  "skills",
  "languages",
  "availability",
  "engagement_kinds",
  "hourly_rate_fen",
  "min_budget_fen",
  "offplatform_delivery_opt_in",
  "published",
] as const satisfies readonly (keyof BaySellerProfileInput)[];

/** `PUT /me` 整份覆盖且只认这些字段：别的键一律不发，没带的会被网关清成默认值，调用方从已存资料带全。 */
export function sellerProfileBody(input: BaySellerProfileInput): BaySellerProfileInput {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {};
  for (const key of PROFILE_BODY_KEYS) {
    if (source[key] !== undefined) body[key] = source[key];
  }
  return body as unknown as BaySellerProfileInput;
}

export interface BayOwnService {
  id: string;
  user_id?: string;
  title: string;
  summary: string;
  description?: string;
  category: string;
  cover_url: string | null;
  engagement_kind?: string;
  price_fen: number;
  price_unit?: BaySellerPriceUnit;
  delivery_days: number | null;
  delivery_mode?: BayDeliveryMode;
  status: BayServiceStatus;
  catalog_kind?: BayCatalogKind | null;
  regulated_domain?: string | null;
  consult_rounds?: number | null;
  consult_minutes?: number | null;
  required_fields?: BayFieldValues;
  moderation_hidden?: boolean;
  view_count?: number;
  order_count?: number;
  posted_site?: string | null;
  currency?: string;
  created_at?: string;
  updated_at?: string;
}

/** 向导写入的载荷（不含 posted_site：那个只在新建时由 `createMyService` 加上）。 */
export interface BayServiceInput {
  title: string;
  summary?: string;
  description?: string;
  category?: string;
  cover_url?: string | null;
  engagement_kind?: string;
  required_fields?: BayFieldValues;
  delivery_mode?: BayDeliveryMode;
  price_fen?: number;
  price_unit?: BaySellerPriceUnit;
  delivery_days?: number | null;
  status?: BayServiceStatus;
  catalog_kind: BayCatalogKind;
  regulated_domain: string;
  consult_rounds?: number | null;
  consult_minutes?: number | null;
}

export interface BayServiceTierRow {
  id?: string;
  service_id?: string;
  tier: BayTierName;
  title: string;
  description: string;
  price_fen: number;
  delivery_days: number | null;
  revisions: number;
  features: string[];
  enabled: boolean;
}

export interface BayServiceAddonRow {
  id: string;
  service_id?: string;
  title: string;
  description: string;
  price_fen: number;
  extra_days: number;
  position: number;
  enabled: boolean;
}

export interface BayServiceFaqRow {
  id: string;
  service_id?: string;
  question: string;
  answer: string;
  position: number;
}

export type BayServiceMediaKind = "image" | "video" | "audio" | "file";

export interface BayServiceMediaRow {
  id: string;
  service_id?: string;
  kind: BayServiceMediaKind;
  url: string;
  poster_url: string | null;
  caption: string;
  position: number;
}

export interface BaySellerStats {
  published_services: number;
  total_services: number;
  pending_orders: number;
  orders_by_status: Record<string, number>;
  rating_avg: number;
  rating_count: number;
  response_minutes: number | null;
  response_rate: number | null;
  on_time_rate: number | null;
  level: "new" | "rising" | "pro" | "top" | null;
}

export interface BayShowcaseItem {
  id: string;
  source_kind: string;
  source_ref: string;
  title: string;
  summary: string;
  cover_url: string | null;
  detail_level: "summary" | "full";
  position: number;
  published: boolean;
  moderation_hidden?: boolean;
}

export interface BaySellerThread {
  id: string;
  kind?: string;
  title?: string | null;
  unread_count?: number;
  last_message?: { body?: string; created_at?: string; user_id?: string } | null;
  updated_at?: string;
}

export interface BaySellerContract {
  id: string;
  title?: string;
  status: string;
  buyer_id?: string;
  seller_id?: string;
  created_at?: string;
}

// ---- 请求 -------------------------------------------------------------------------

const servicePath = (serviceId: string) => `/v1/talent/me/services/${encodeURIComponent(serviceId)}`;

function putError(status: number, detail: unknown, fallback?: string): BayApiError {
  if (typeof detail === "string" && detail) return new BayApiError(detail, status);
  const d = (detail && typeof detail === "object" ? detail : null) as { message?: unknown; reason_zh?: unknown; code?: unknown } | null;
  const message =
    (typeof d?.message === "string" && d.message) ||
    (typeof d?.reason_zh === "string" && d.reason_zh) ||
    fallback ||
    "请求失败，请稍后再试。";
  return new BayApiError(message, status, typeof d?.code === "string" ? d.code : null);
}

/** `http.ts` 没有 PUT；资料保存、服务更新、档位替换是 PUT，这里照 `bayPost` 的写法补一个。 */
async function bayPut<T>(path: string, body: unknown): Promise<T> {
  const result = await authed<T>(path, { method: "PUT", body: JSON.stringify(body) });
  if (!result.ok) throw putError(result.status ?? 0, result.detail, result.error);
  return result.data as T;
}

export function getSellerProfile(): Promise<{ profile: BaySellerProfile | null }> {
  return bayGet<{ profile: BaySellerProfile | null }>("/v1/talent/me");
}

export function saveSellerProfile(input: BaySellerProfileInput): Promise<{ profile: BaySellerProfile }> {
  return bayPut<{ profile: BaySellerProfile }>("/v1/talent/me", sellerProfileBody(input));
}

export function listMyServices(): Promise<{ items: BayOwnService[] }> {
  return bayGet<{ items: BayOwnService[] }>("/v1/talent/me/services");
}

/** 新建服务的请求体：向导载荷 + 当前站（`useBaySiteKey()` 的值）。 */
export function newServiceBody(input: BayServiceInput, siteKey: string): BayServiceInput & { posted_site: string | null } {
  const site = typeof siteKey === "string" ? siteKey.trim().toLowerCase() : "";
  return { ...input, posted_site: /^[a-z0-9][a-z0-9-]{1,23}$/.test(site) ? site : null };
}

export function createMyService(input: BayServiceInput, siteKey: string): Promise<{ service: BayOwnService }> {
  return bayPost<{ service: BayOwnService }>("/v1/talent/me/services", newServiceBody(input, siteKey));
}

export function updateMyService(serviceId: string, input: BayServiceInput): Promise<{ service: BayOwnService }> {
  return bayPut<{ service: BayOwnService }>(servicePath(serviceId), input);
}

export function deleteMyService(serviceId: string): Promise<{ ok: boolean }> {
  return bayDelete<{ ok: boolean }>(servicePath(serviceId));
}

export interface BayServicePricing {
  service_id: string;
  category: string;
  pricing_model: BayPricingModel | null;
  required_fields: BayFieldSpec[];
  values: BayFieldValues;
  missing: string[];
}

export interface BayPricingInput {
  pricing_model: string;
  fields: BayFieldValues;
}

/** 计费方式与它要求的交付约定（品类字段 + 计费方式字段）；发布闸门按这一份核对。 */
export function getServicePricing(serviceId: string): Promise<BayServicePricing> {
  return bayGet<BayServicePricing>(`${servicePath(serviceId)}/pricing`);
}

export function saveServicePricing(serviceId: string, input: BayPricingInput): Promise<BayServicePricing> {
  return bayPut<BayServicePricing>(`${servicePath(serviceId)}/pricing`, input);
}

export interface BayPublishResult {
  service: BayOwnService;
  checks?: string[];
  moderation_hidden?: boolean;
  moderation_message?: string;
}

/** 上架。带上计费方式与交付约定时网关先存再判，一次请求发完。 */
export function publishMyService(serviceId: string, pricing?: BayPricingInput): Promise<BayPublishResult> {
  return bayPost<BayPublishResult>(`${servicePath(serviceId)}/publish`, pricing);
}

/** 暂停（后端把状态改成 paused，买家目录里不再出现，草稿与数据都保留）。 */
export function pauseMyService(serviceId: string): Promise<{ service: BayOwnService }> {
  return bayPost<{ service: BayOwnService }>(`${servicePath(serviceId)}/unpublish`);
}

export function listServiceTiers(serviceId: string): Promise<{ items: BayServiceTierRow[] }> {
  return bayGet<{ items: BayServiceTierRow[] }>(`${servicePath(serviceId)}/tiers`);
}

export function replaceServiceTiers(serviceId: string, tiers: BayServiceTierRow[]): Promise<{ items: BayServiceTierRow[] }> {
  return bayPut<{ items: BayServiceTierRow[] }>(`${servicePath(serviceId)}/tiers`, { tiers });
}

type AddonInput = Omit<BayServiceAddonRow, "id" | "service_id">;
type FaqInput = Omit<BayServiceFaqRow, "id" | "service_id">;
type MediaInput = Omit<BayServiceMediaRow, "id" | "service_id">;

export function listServiceAddons(serviceId: string): Promise<{ items: BayServiceAddonRow[] }> {
  return bayGet<{ items: BayServiceAddonRow[] }>(`${servicePath(serviceId)}/addons`);
}

export function createServiceAddon(serviceId: string, input: AddonInput): Promise<{ item: BayServiceAddonRow }> {
  return bayPost<{ item: BayServiceAddonRow }>(`${servicePath(serviceId)}/addons`, input);
}

export function patchServiceAddon(serviceId: string, addonId: string, input: Partial<AddonInput>): Promise<{ item: BayServiceAddonRow }> {
  return bayPatch<{ item: BayServiceAddonRow }>(`${servicePath(serviceId)}/addons/${encodeURIComponent(addonId)}`, input);
}

export function deleteServiceAddon(serviceId: string, addonId: string): Promise<{ ok: boolean }> {
  return bayDelete<{ ok: boolean }>(`${servicePath(serviceId)}/addons/${encodeURIComponent(addonId)}`);
}

export function listServiceFaq(serviceId: string): Promise<{ items: BayServiceFaqRow[] }> {
  return bayGet<{ items: BayServiceFaqRow[] }>(`${servicePath(serviceId)}/faq`);
}

export function createServiceFaq(serviceId: string, input: FaqInput): Promise<{ item: BayServiceFaqRow }> {
  return bayPost<{ item: BayServiceFaqRow }>(`${servicePath(serviceId)}/faq`, input);
}

export function patchServiceFaq(serviceId: string, faqId: string, input: Partial<FaqInput>): Promise<{ item: BayServiceFaqRow }> {
  return bayPatch<{ item: BayServiceFaqRow }>(`${servicePath(serviceId)}/faq/${encodeURIComponent(faqId)}`, input);
}

export function deleteServiceFaq(serviceId: string, faqId: string): Promise<{ ok: boolean }> {
  return bayDelete<{ ok: boolean }>(`${servicePath(serviceId)}/faq/${encodeURIComponent(faqId)}`);
}

export function listServiceMedia(serviceId: string): Promise<{ items: BayServiceMediaRow[] }> {
  return bayGet<{ items: BayServiceMediaRow[] }>(`${servicePath(serviceId)}/media`);
}

export function createServiceMedia(serviceId: string, input: MediaInput): Promise<{ item: BayServiceMediaRow }> {
  return bayPost<{ item: BayServiceMediaRow }>(`${servicePath(serviceId)}/media`, input);
}

export function patchServiceMedia(serviceId: string, mediaId: string, input: Partial<MediaInput>): Promise<{ item: BayServiceMediaRow }> {
  return bayPatch<{ item: BayServiceMediaRow }>(`${servicePath(serviceId)}/media/${encodeURIComponent(mediaId)}`, input);
}

export function deleteServiceMedia(serviceId: string, mediaId: string): Promise<{ ok: boolean }> {
  return bayDelete<{ ok: boolean }>(`${servicePath(serviceId)}/media/${encodeURIComponent(mediaId)}`);
}

export function getSellerStats(): Promise<BaySellerStats> {
  return bayGet<BaySellerStats>("/v1/talent/me/stats");
}

export function listPricingModels(): Promise<{ items: BayPricingModel[] }> {
  return bayGet<{ items: BayPricingModel[] }>("/v1/talent/pricing-models", { anonymous: true });
}

/** 答疑的领域清单；限定领域在这里就去掉，向导拿到的永远没有它们。 */
export async function listConsultDomains(): Promise<BayConsultDomain[]> {
  const body = await bayGet<{ items?: BayConsultDomain[]; domains?: BayConsultDomain[] }>("/v1/talent/domains", { anonymous: true });
  const rows = Array.isArray(body?.items) ? body.items : Array.isArray(body?.domains) ? body.domains : [];
  return rows.filter((row) => row && typeof row.key === "string" && row.key !== "none" && !isSellerRestrictedDomain(row.key));
}

export interface BayDomainPrompts {
  ask_placeholder: string;
  forbidden_hint: string;
  answer_disclaimer: string;
}

export function getDomainPrompts(domainKey: string): Promise<BayDomainPrompts> {
  return bayGet<BayDomainPrompts>(`/v1/talent/domains/${encodeURIComponent(domainKey)}/prompts`, { anonymous: true });
}

/** 答疑挂牌（后端独立的表：只有新建、列我的，没有修改与暂停接口）。 */
export interface BayOwnConsult {
  id: string;
  category_slug: string;
  regulated_domain: string;
  title: string;
  summary: string;
  scope_note: string;
  price_fen: number;
  currency?: string;
  price_unit: BayConsultUnit;
  rounds: number | null;
  minutes: number | null;
  response_window: string;
  status: "draft" | "published" | string;
  moderation_hidden?: boolean;
  created_at?: string;
}

export interface BayConsultInput {
  category_slug: string;
  regulated_domain: string;
  title: string;
  summary?: string;
  scope_note?: string;
  price_fen: number;
  price_unit: BayConsultUnit;
  rounds?: number | null;
  minutes?: number | null;
  response_window?: string;
  status: "draft" | "published";
}

export function newConsultBody(input: BayConsultInput, siteKey: string): BayConsultInput & { posted_site: string | null } {
  const body = newServiceBody({ title: input.title, catalog_kind: "consult", regulated_domain: input.regulated_domain }, siteKey);
  return {
    ...input,
    rounds: input.price_unit === "session" ? input.rounds ?? null : null,
    minutes: input.price_unit === "hour" ? input.minutes ?? null : null,
    posted_site: body.posted_site,
  };
}

export function createMyConsult(input: BayConsultInput, siteKey: string): Promise<{ consult: BayOwnConsult }> {
  if (isSellerRestrictedDomain(input.regulated_domain)) {
    return Promise.reject(new BayApiError("这个领域暂不开放答疑。", 400));
  }
  return bayPost<{ consult: BayOwnConsult }>("/v1/talent/consults", newConsultBody(input, siteKey));
}

export async function listMyConsults(): Promise<{ items: BayOwnConsult[] }> {
  const body = await bayGet<{ items?: BayOwnConsult[] }>("/v1/talent/consults/mine");
  const items = Array.isArray(body?.items) ? body.items : [];
  return { items: items.filter((row) => row && !isSellerRestrictedDomain(row.regulated_domain)) };
}

export function listMyShowcase(): Promise<{ items: BayShowcaseItem[] }> {
  return bayGet<{ items: BayShowcaseItem[] }>("/v1/talent/me/showcase");
}

/** 作品集加入一件「我的库」里的作品：`pickLibraryWork()` 返回什么就导入什么。 */
export function addShowcaseWork(work: BayWorkRef, detailLevel: "summary" | "full" = "summary"): Promise<{ items: BayShowcaseItem[]; moderation_hidden?: boolean }> {
  return bayPost<{ items: BayShowcaseItem[]; moderation_hidden?: boolean }>("/v1/talent/me/showcase/import-tasks", {
    task_ids: [work.id],
    detail_level: detailLevel,
  });
}

export function patchShowcaseItem(
  itemId: string,
  input: Partial<Pick<BayShowcaseItem, "title" | "summary" | "detail_level" | "position" | "published">>,
): Promise<{ item: BayShowcaseItem }> {
  return bayPatch<{ item: BayShowcaseItem }>(`/v1/talent/me/showcase/${encodeURIComponent(itemId)}`, input);
}

export function removeShowcaseItem(itemId: string): Promise<{ ok: boolean }> {
  return bayDelete<{ ok: boolean }>(`/v1/talent/me/showcase/${encodeURIComponent(itemId)}`);
}

export function listSellerContracts(): Promise<{ items: BaySellerContract[] }> {
  return bayGet<{ items: BaySellerContract[] }>("/v1/talent/contracts?role=seller&limit=100");
}

export function listRecentThreads(): Promise<{ threads: BaySellerThread[] }> {
  return bayGet<{ threads: BaySellerThread[] }>("/v1/talent/threads?limit=20");
}

/** 我名下被处置的内容（被隐藏的原因、能不能反通知/申诉）。申诉流程本身在门户「内容处理记录」页。 */
export interface BayContentCase {
  id: string;
  target_kind: string;
  target_ref: string;
  status: string;
  reason: string;
  detail: string;
  hidden: boolean;
  decision_note: string;
  actions: string[];
}

export async function listMyContentCases(): Promise<BayContentCase[]> {
  const body = await bayGet<{ cases?: unknown[] }>("/v1/moderation/my-cases");
  const rows = Array.isArray(body?.cases) ? body.cases : [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row) => ({
      id: String(row.id || ""),
      target_kind: String(row.target_kind || ""),
      target_ref: String(row.target_ref || ""),
      status: String(row.status || ""),
      reason: typeof row.reason === "string" ? row.reason : "",
      detail: typeof row.detail === "string" ? row.detail : "",
      hidden: row.hidden === true,
      decision_note: typeof row.decision_note === "string" ? row.decision_note : "",
      actions: Array.isArray(row.actions) ? row.actions.filter((a): a is string => typeof a === "string") : [],
    }))
    .filter((row) => row.id);
}

export type BayCaseTarget = "talent_service" | "talent_profile" | "talent_showcase";

/** 某条内容当前生效的处置（仍在隐藏中的那一条）。 */
export function hiddenCaseFor(cases: BayContentCase[] | null | undefined, kind: BayCaseTarget, ref?: string): BayContentCase | null {
  return (cases || []).find((row) => row.hidden && row.target_kind === kind && (ref === undefined || row.target_ref === ref)) || null;
}

// ---- 计算 -------------------------------------------------------------------------

export type BayServiceGroup = "hidden" | "draft" | "published" | "paused";

export const BAY_SERVICE_GROUP_ORDER: BayServiceGroup[] = ["hidden", "published", "paused", "draft"];

/** 被平台隐藏的优先于状态：在架但被隐藏的服务买家看不到，要单列出来告诉卖家。 */
export function serviceGroupOf(service: Pick<BayOwnService, "status" | "moderation_hidden">): BayServiceGroup {
  if (service.moderation_hidden === true) return "hidden";
  if (service.status === "published") return "published";
  if (service.status === "paused") return "paused";
  return "draft";
}

export function groupMyServices(services: BayOwnService[]): Record<BayServiceGroup, BayOwnService[]> {
  const groups: Record<BayServiceGroup, BayOwnService[]> = { hidden: [], draft: [], published: [], paused: [] };
  for (const service of services) {
    if (!service || typeof service.id !== "string") continue;
    if (isSellerRestrictedDomain(service.regulated_domain)) continue;
    groups[serviceGroupOf(service)].push(service);
  }
  return groups;
}

/** 向导能选的类目：交付类目，或某个领域下的答疑类目；限定领域永远不出现。 */
export function wizardCategories(
  categories: BaySellerCategory[],
  kind: BayCatalogKind,
  domain?: string,
): BaySellerCategory[] {
  return categories
    .filter((row) => row && row.published !== false && !isSellerRestrictedDomain(row.regulated_domain))
    .filter((row) => {
      if (kind === "delivery") return row.catalog_kind === "delivery";
      if (row.catalog_kind !== "consult") return false;
      return !domain || row.regulated_domain === domain;
    })
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}

/** 卖家概况：进行中的订单数（已签约未结束：进行中、已交付待验收、争议中）。 */
export function activeOrderCount(stats: Pick<BaySellerStats, "orders_by_status" | "pending_orders"> | null | undefined): number {
  if (!stats) return 0;
  const byStatus = stats.orders_by_status;
  if (!byStatus || typeof byStatus !== "object" || !Object.keys(byStatus).length) {
    return Math.max(0, Number(stats.pending_orders || 0));
  }
  return ["active", "delivered", "disputed"].reduce((sum, key) => sum + Math.max(0, Number(byStatus[key] || 0)), 0);
}

/** 卖家概况：等我接单（买家下单或发起协商、还没签约）的数量。 */
export function awaitingAcceptCount(stats: Pick<BaySellerStats, "orders_by_status"> | null | undefined): number {
  const byStatus = stats?.orders_by_status || {};
  return ["draft", "negotiating"].reduce((sum, key) => sum + Math.max(0, Number(byStatus[key] || 0)), 0);
}

/** 待回复：最后一条消息不是我发的、且有未读的会话数。 */
export function awaitingReplyCount(threads: BaySellerThread[] | null | undefined, viewerId: string | null | undefined): number {
  if (!threads?.length) return 0;
  return threads.filter((thread) => {
    if (!thread) return false;
    if (Number(thread.unread_count || 0) > 0) return true;
    const from = thread.last_message?.user_id;
    return Boolean(viewerId && from && from !== viewerId);
  }).length;
}

/** 执业称谓：没有对应执业资质就不能这样标注（后端内容闸门会退回，这里只是打字时先提醒）。 */
export const BAY_PRACTITIONER_TITLES = ["律师", "法律专家", "医生", "医师", "注册会计师"] as const;

/** 需要单独许可的业务：平台不承接。 */
export const BAY_RESTRICTED_SCOPES = [
  "证券投资咨询",
  "保险销售",
  "代理记账",
  "专利代理",
  "审计",
  "房地产中介",
  "因私出入境中介",
  "K12 学科培训",
] as const;

const SCOPE_ALIASES: Record<string, string[]> = {
  "K12 学科培训": ["K12学科培训", "k12 学科培训", "k12学科培训"],
};

export interface BayOverreachHint {
  kind: "title" | "scope";
  term: string;
}

/** 扫一段面向买家的文字，返回需要提醒的越界表述；命中不阻断保存，判定在后端。 */
export function overreachHints(text: string): BayOverreachHint[] {
  const value = typeof text === "string" ? text : "";
  if (!value.trim()) return [];
  const hits = (term: string) => value.includes(term) || (SCOPE_ALIASES[term] || []).some((alias) => value.includes(alias));
  const out: BayOverreachHint[] = [];
  for (const term of BAY_PRACTITIONER_TITLES) if (hits(term)) out.push({ kind: "title", term });
  for (const term of BAY_RESTRICTED_SCOPES) if (hits(term)) out.push({ kind: "scope", term });
  return out;
}
