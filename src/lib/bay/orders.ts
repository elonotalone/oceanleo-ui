// Bay 订单（移植自 talent `lib/talent/orders.ts`）：合同、里程碑、交付、验收、改稿、延长验收、取消，
// 以及订单页与订单卡共用的纯函数（下一步、倒计时、谁能做什么、作品链接）。
// 请求一律走 `./http`，失败抛 `BayApiError`（message 是后端给的中文，界面经 tt() 显示）。
// 给用户看的话全部由调用方传入的 `tt` 翻译；这里不写死任何语种。

import type { UITranslate } from "../../i18n/ui/useUI";
import { bayGet, bayPost } from "./http";

export type BayOrderStatus =
  | "draft"
  | "negotiating"
  | "active"
  | "delivered"
  | "completed"
  | "cancelled"
  | "disputed";

export type BayOrderPaymentState = "disabled" | "unfunded" | "escrow_held" | "released" | "refunded" | "split";
export type BayMilestoneStatus = "pending" | "submitted" | "approved" | "released" | "cancelled";
export type BayMilestonePaymentState = "unfunded" | "held" | "released" | "refunded" | "split";
export type BayEngagementKind = "fixed" | "session" | "hourly" | "milestone" | "free" | "retainer" | "bounty";
export type BayPricingModelKey = "fixed" | "session" | "hourly" | "milestone" | "free";
export type BayOrderRole = "buyer" | "seller";
export type BayDeliveryMode = "on_platform" | "off_platform";

export interface BayOrderParty {
  user_id?: string;
  handle?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}

export interface BayOrderMilestone {
  id: string;
  contract_id?: string;
  seq: number;
  title: string;
  detail?: string;
  amount_fen: number;
  due_at?: string | null;
  status: BayMilestoneStatus;
  deliverable_note?: string;
  submitted_at?: string | null;
  approved_at?: string | null;
  payment_state?: BayMilestonePaymentState;
}

export interface BayDeliveryAttachment {
  url: string;
  name: string;
  kind: string;
}

export interface BayRevisionRequest {
  id: string;
  delivery_id: string;
  reason: string;
  created_at: string;
}

export interface BayOrderDelivery {
  id: string;
  contract_id?: string;
  milestone_id?: string | null;
  round: number;
  note: string;
  attachments: BayDeliveryAttachment[];
  artifact_ids?: string[];
  state: "submitted" | "accepted" | "revision_requested";
  created_at: string;
  revision_request?: BayRevisionRequest | null;
}

export interface BayOrderSnapshot {
  tier: { tier?: string; title?: string; price_fen: number; revisions: number; delivery_days?: number | null };
  addons: { id: string; title: string; price_fen: number; extra_days?: number }[];
  delivery_days: number | null;
  total_fen: number;
}

export interface BayOrderRequirements {
  title?: string;
  what?: string;
  reference_links?: unknown;
  deadline?: string;
  notes?: string;
  hours?: unknown;
  _order_snapshot?: BayOrderSnapshot;
  [key: string]: unknown;
}

/** 订单关于哪个作品（契约 §3.9 `work`）：在作品所在站的 `open_path` 打开。 */
export interface BayOrderWork {
  site_key: string;
  task_id?: string | null;
  open_path: string;
  title?: string | null;
}

export interface BayOrder {
  id: string;
  buyer_user_id: string;
  seller_user_id: string;
  title: string;
  description?: string;
  engagement_kind: BayEngagementKind | string;
  origin_kind?: string | null;
  origin_ref?: string | null;
  total_fen: number;
  currency?: string | null;
  status: BayOrderStatus;
  payment_state?: BayOrderPaymentState | null;
  project_id?: string | null;
  accepted_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  milestones?: BayOrderMilestone[];
  buyer?: BayOrderParty | null;
  seller?: BayOrderParty | null;
  /** 当前登录者在这单里的身份；不是这单的人为空。 */
  my_role?: BayOrderRole | null;
  thread_id?: string | null;
  source_service_id?: string | null;
  source_tier?: string | null;
  requirements?: BayOrderRequirements;
  revisions_allowed?: number;
  revisions_used?: number;
  delivered_at?: string | null;
  auto_accept_at?: string | null;
  cancelled_at?: string | null;
  disputed_at?: string | null;
  deliveries?: BayOrderDelivery[];
  pricing_model?: BayPricingModelKey | null;
  settlement_rule?: string | null;
  review_extended_days?: number;
  delivery_mode?: BayDeliveryMode | null;
  im_conversation_id?: string | null;
  work?: BayOrderWork | null;
}

/** 交易会话上带的合同摘要（契约 §3.9）。 */
export interface BayContractSummary {
  id: string;
  title?: string;
  status?: BayOrderStatus;
  payment_state?: BayOrderPaymentState | null;
  total_fen?: number;
  currency?: string | null;
  next_action?: "pay" | "deliver" | "accept" | "review" | null;
  project_id?: string | null;
  im_conversation_id?: string | null;
  work?: BayOrderWork | null;
}

export interface BayDeliveryInput {
  note: string;
  attachments: BayDeliveryAttachment[];
  milestone_id?: string | null;
}

// --------------------------------------------------------------------------- //
// 请求
// --------------------------------------------------------------------------- //

function seg(value: string): string {
  return encodeURIComponent(value);
}

export const BAY_ORDER_STATUSES: readonly BayOrderStatus[] = [
  "draft",
  "negotiating",
  "active",
  "delivered",
  "completed",
  "cancelled",
  "disputed",
];

export async function listBayOrders(
  filters: { role?: "all" | BayOrderRole; status?: BayOrderStatus | ""; limit?: number } = {},
): Promise<BayOrder[]> {
  const params = new URLSearchParams();
  const role = filters.role === "buyer" || filters.role === "seller" ? filters.role : "all";
  params.set("role", role);
  if (filters.status && BAY_ORDER_STATUSES.includes(filters.status)) params.set("status", filters.status);
  const limit = Math.max(1, Math.min(200, Math.floor(Number(filters.limit) || 100)));
  params.set("limit", String(limit));
  const data = await bayGet<{ items?: BayOrder[] }>(`/v1/talent/contracts?${params.toString()}`);
  return Array.isArray(data?.items) ? data.items.filter((item) => item && typeof item.id === "string") : [];
}

export async function getBayOrder(contractId: string): Promise<BayOrder> {
  const data = await bayGet<{ contract: BayOrder }>(`/v1/talent/contracts/${seg(contractId)}`);
  return data.contract;
}

/** 签署：条款是谁改的谁不能签，后端会拒。签完自动落地成项目（项目群、订单卡由后端建）。 */
export function signBayOrder(contractId: string): Promise<{ contract: BayOrder }> {
  return bayPost<{ contract: BayOrder }>(`/v1/talent/contracts/${seg(contractId)}/accept`);
}

/** 签署时建项目失败了的重试口，幂等。 */
export function ensureBayOrderProject(contractId: string): Promise<{ project_id: string }> {
  return bayPost<{ project_id: string }>(`/v1/talent/contracts/${seg(contractId)}/project`);
}

export function submitBayMilestone(
  contractId: string,
  milestoneId: string,
  deliverableNote = "",
): Promise<{ milestone: BayOrderMilestone }> {
  return bayPost<{ milestone: BayOrderMilestone }>(
    `/v1/talent/contracts/${seg(contractId)}/milestones/${seg(milestoneId)}/submit`,
    { deliverable_note: deliverableNote.trim() },
  );
}

export function approveBayMilestone(contractId: string, milestoneId: string): Promise<{ milestone: BayOrderMilestone }> {
  return bayPost<{ milestone: BayOrderMilestone }>(
    `/v1/talent/contracts/${seg(contractId)}/milestones/${seg(milestoneId)}/approve`,
  );
}

export function completeBayOrder(contractId: string): Promise<{ contract: BayOrder }> {
  return bayPost<{ contract: BayOrder }>(`/v1/talent/contracts/${seg(contractId)}/complete`);
}

export const MAX_DELIVERY_ATTACHMENTS = 20;
export const DELIVERY_NOTE_LIMIT = 5000;

/** 只留 http(s) 地址、去重、最多 20 个；名字截到 255 字。 */
export function cleanDeliveryAttachments(items: readonly Partial<BayDeliveryAttachment>[] | null | undefined): BayDeliveryAttachment[] {
  const out: BayDeliveryAttachment[] = [];
  const seen = new Set<string>();
  for (const item of items ?? []) {
    const url = safeHttpUrl(item?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      name: String(item?.name ?? "").trim().slice(0, 255),
      kind: String(item?.kind ?? "file").trim().slice(0, 80) || "file",
    });
    if (out.length >= MAX_DELIVERY_ATTACHMENTS) break;
  }
  return out;
}

export function deliverBayOrder(
  contractId: string,
  input: BayDeliveryInput,
): Promise<{ delivery: BayOrderDelivery; contract: BayOrder }> {
  const body: Record<string, unknown> = {
    note: (input.note || "").trim().slice(0, DELIVERY_NOTE_LIMIT),
    attachments: cleanDeliveryAttachments(input.attachments),
  };
  if (input.milestone_id) body.milestone_id = input.milestone_id;
  return bayPost<{ delivery: BayOrderDelivery; contract: BayOrder }>(`/v1/talent/contracts/${seg(contractId)}/deliver`, body);
}

export function requestBayRevision(
  contractId: string,
  reason: string,
  deliveryId?: string | null,
): Promise<{ revision: BayRevisionRequest; contract: BayOrder }> {
  const body: Record<string, unknown> = { reason: reason.trim().slice(0, 2000) };
  if (deliveryId) body.delivery_id = deliveryId;
  return bayPost<{ revision: BayRevisionRequest; contract: BayOrder }>(
    `/v1/talent/contracts/${seg(contractId)}/request-revision`,
    body,
  );
}

export function acceptBayDelivery(contractId: string): Promise<{ contract: BayOrder }> {
  return bayPost<{ contract: BayOrder }>(`/v1/talent/contracts/${seg(contractId)}/accept-delivery`);
}

/** 买家延长验收期：1–14 天，累计上限 14 天。前端只拦手滑，后端也拦。 */
export function extendBayReview(contractId: string, days: number): Promise<{ contract: BayOrder }> {
  return bayPost<{ contract: BayOrder }>(`/v1/talent/contracts/${seg(contractId)}/extend-review`, {
    days: Math.floor(Number(days) || 0),
  });
}

export function cancelBayOrder(contractId: string, reason = ""): Promise<{ contract: BayOrder }> {
  return bayPost<{ contract: BayOrder }>(`/v1/talent/contracts/${seg(contractId)}/cancel`, {
    reason: reason.trim().slice(0, 2000),
  });
}

/**
 * 这单的项目群与作品：订单本身带了就用；没带就读交易会话上的合同摘要（契约 §3.9）。
 * 读不到不算错——界面只是少显示一个入口。
 */
export async function fetchBayContractSummary(threadId: string): Promise<BayContractSummary | null> {
  try {
    const data = await bayGet<{
      contract_summary?: BayContractSummary | null;
      thread?: { contract_summary?: BayContractSummary | null } | null;
    }>(`/v1/talent/threads/${seg(threadId)}/messages?limit=1`);
    const summary = data?.contract_summary ?? data?.thread?.contract_summary ?? null;
    return summary && typeof summary === "object" ? summary : null;
  } catch {
    return null;
  }
}

/** 项目群 id：没有现成的就按项目取（成员才能取到，幂等）。 */
export async function resolveBayProjectConversation(projectId: string): Promise<string | null> {
  const data = await bayPost<{ id?: string; conversation?: { id?: string } }>("/v1/im/conversations/project", {
    project_id: projectId,
  });
  const id = data?.id ?? data?.conversation?.id ?? null;
  return typeof id === "string" && id ? id : null;
}

// --------------------------------------------------------------------------- //
// 纯函数：金额、状态、文案
// --------------------------------------------------------------------------- //

export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if ((url.protocol === "http:" || url.protocol === "https:") && url.hostname) return url.toString();
  } catch {
    /* 不是绝对地址 */
  }
  return null;
}

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  CNY: "¥",
  RMB: "¥",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

/** 金额（分）→ 「¥120.00」「$12.80」；不认识的币种写成「12.80 SGD」。 */
export function formatOrderAmount(fen: number | null | undefined, currency?: string | null): string {
  const value = Number(fen);
  if (fen === null || fen === undefined || !Number.isFinite(value)) return "";
  const code = String(currency || "").trim().toUpperCase();
  const amount = (value / 100).toFixed(2);
  const symbol = CURRENCY_SYMBOLS[code];
  if (symbol) return `${symbol}${amount}`;
  return code ? `${amount} ${code}` : amount;
}

export function orderAmountText(tt: UITranslate, order: Pick<BayOrder, "total_fen" | "currency">): string {
  if (Number(order.total_fen) === 0) return tt("免费");
  return formatOrderAmount(order.total_fen, order.currency) || tt("面议");
}

export function orderStatusLabel(tt: UITranslate, status: string | null | undefined): string {
  switch (status) {
    case "draft":
      return tt("待确认条款");
    case "negotiating":
      return tt("洽谈中");
    case "active":
      return tt("进行中");
    case "delivered":
      return tt("已交付待验收");
    case "completed":
      return tt("已完成");
    case "cancelled":
      return tt("已取消");
    case "disputed":
      return tt("争议中");
    default:
      return tt("订单");
  }
}

export function engagementKindLabel(tt: UITranslate, kind: string | null | undefined): string {
  switch (kind) {
    case "fixed":
      return tt("一口价交付");
    case "session":
      return tt("按次会诊");
    case "hourly":
      return tt("按时计费");
    case "milestone":
      return tt("分阶段");
    case "free":
      return tt("免费协作");
    case "retainer":
      return tt("长期驻场");
    case "bounty":
      return tt("赏金竞赛");
    default:
      return "";
  }
}

export function milestoneStatusLabel(tt: UITranslate, status: string | null | undefined): string {
  switch (status) {
    case "pending":
      return tt("待开始");
    case "submitted":
      return tt("已提交待验收");
    case "approved":
      return tt("已验收");
    case "released":
      return tt("已放款");
    case "cancelled":
      return tt("已取消");
    default:
      return "";
  }
}

export function milestonePaymentStateLabel(tt: UITranslate, state: string | null | undefined): string {
  switch (state) {
    case "unfunded":
      return tt("未托管");
    case "held":
      return tt("托管中");
    case "released":
      return tt("已放款");
    case "refunded":
      return tt("已退款");
    case "split":
      return tt("部分放款部分退款");
    default:
      return "";
  }
}

export function orderPaymentStateLabel(tt: UITranslate, state: string | null | undefined): string {
  switch (state) {
    case "escrow_held":
      return tt("托管中");
    case "released":
      return tt("已放款");
    case "refunded":
      return tt("已退款");
    case "split":
      return tt("部分放款部分退款");
    default:
      return tt("未付款");
  }
}

export function deliveryStateLabel(tt: UITranslate, state: string | null | undefined): string {
  switch (state) {
    case "accepted":
      return tt("已验收");
    case "revision_requested":
      return tt("已要求修改");
    default:
      return tt("待验收");
  }
}

export function orderRoleOf(order: Pick<BayOrder, "my_role"> | null | undefined): BayOrderRole | null {
  return order?.my_role === "buyer" || order?.my_role === "seller" ? order.my_role : null;
}

export function counterpartyOf(order: BayOrder): BayOrderParty | null {
  const role = orderRoleOf(order);
  if (role === "buyer") return order.seller ?? null;
  if (role === "seller") return order.buyer ?? null;
  return null;
}

export function counterpartyName(tt: UITranslate, order: BayOrder): string {
  const person = counterpartyOf(order);
  const name = (person?.display_name || "").trim();
  if (name) return name;
  if (person?.handle) return `@${person.handle}`;
  return tt("OceanLeo 用户");
}

// --------------------------------------------------------------------------- //
// 付款口径（契约 §7：没就绪时不出现能点的付款按钮）
// --------------------------------------------------------------------------- //

export interface BayOrderPaymentsGate {
  enabled: boolean;
  buyer_ready: boolean;
}

export function contractPaymentsOn(order: Pick<BayOrder, "payment_state" | "total_fen">): boolean {
  return Boolean(order.payment_state) && order.payment_state !== "disabled" && Number(order.total_fen || 0) > 0;
}

/** 买家此刻能不能点「去付款」：只看 buyer_ready，不看 enabled；这单有钱要付、还没付、合同已生效。 */
export function canPayOrder(order: BayOrder, gate: BayOrderPaymentsGate | null | undefined): boolean {
  if (!gate || !gate.buyer_ready) return false;
  if (orderRoleOf(order) !== "buyer") return false;
  if (Number(order.total_fen || 0) <= 0) return false;
  if (order.payment_state !== "unfunded") return false;
  return order.status === "active" || order.status === "delivered";
}

export function paymentsHint(tt: UITranslate, enabled: boolean): string {
  return enabled
    ? tt("钱由 Stripe 托管，验收后付给接单方")
    : tt("平台没有代收也没有代付这笔钱：金额只是记账，结算由你与对方自行完成");
}

export function completionMeansNote(tt: UITranslate, enabled: boolean): string {
  return enabled
    ? tt("「完成」表示验收通过；钱已从买家卡扣出，验收后打到接单方的银行卡")
    : tt("「完成」只表示验收通过并记了一笔账，平台没有代收也没有代付任何款项");
}

export function offPlatformMoneyRule(tt: UITranslate, enabled: boolean): string {
  return enabled
    ? tt("卖家先提交带水印预览，买家确认后再交付原件；有偿订单的钱仍由 Stripe 托管。")
    : tt("卖家先提交带水印预览，买家确认后再交付原件；款项由双方按约定自行结算。");
}

// --------------------------------------------------------------------------- //
// 计费模型与「什么叫完成」
// --------------------------------------------------------------------------- //

interface PricingModelFacts {
  autoAcceptDays: number;
  splitByElapsedTime: boolean;
}

const PRICING_MODEL_FACTS: Readonly<Record<BayPricingModelKey, PricingModelFacts>> = {
  fixed: { autoAcceptDays: 7, splitByElapsedTime: false },
  session: { autoAcceptDays: 2, splitByElapsedTime: true },
  hourly: { autoAcceptDays: 3, splitByElapsedTime: true },
  milestone: { autoAcceptDays: 7, splitByElapsedTime: false },
  free: { autoAcceptDays: 0, splitByElapsedTime: false },
};

export function resolvePricingModelKey(order: Pick<BayOrder, "pricing_model" | "engagement_kind">): BayPricingModelKey | null {
  const explicit = order.pricing_model;
  if (explicit && explicit in PRICING_MODEL_FACTS) return explicit;
  const kind = String(order.engagement_kind || "");
  return kind in PRICING_MODEL_FACTS ? (kind as BayPricingModelKey) : null;
}

export function pricingModelSplitsByTime(order: Pick<BayOrder, "pricing_model" | "engagement_kind">): boolean {
  const key = resolvePricingModelKey(order);
  return key ? PRICING_MODEL_FACTS[key].splitByElapsedTime : false;
}

export function pricingModelName(tt: UITranslate, order: Pick<BayOrder, "pricing_model" | "engagement_kind">): string {
  const key = resolvePricingModelKey(order);
  return key ? engagementKindLabel(tt, key) : engagementKindLabel(tt, String(order.engagement_kind || ""));
}

export function pricingModelUnit(tt: UITranslate, order: Pick<BayOrder, "pricing_model" | "engagement_kind">): string {
  switch (resolvePricingModelKey(order)) {
    case "session":
      return tt("每次");
    case "hourly":
      return tt("每小时");
    case "milestone":
      return tt("整单分段");
    case "fixed":
    case "free":
      return tt("整单");
    default:
      return "";
  }
}

/** 「什么叫完成」：后端给的优先，没给就用计费模型的固定规则。 */
export function settlementRuleText(
  tt: UITranslate,
  order: Pick<BayOrder, "pricing_model" | "engagement_kind" | "settlement_rule">,
): string {
  const given = (order.settlement_rule || "").trim();
  if (given) return given;
  switch (resolvePricingModelKey(order)) {
    case "fixed":
      return tt("交付清单齐全即算完成");
    case "session":
      return tt("以会话时间戳为准；有争议时按已发生时长分割");
    case "hourly":
      return tt("按已记录时长结算；有争议时按已发生时长分割");
    case "milestone":
      return tt("每个里程碑单独验收，逐段算完成");
    case "free":
      return tt("不涉及金额，交付即完成");
    default:
      return tt("由双方在合同里约定");
  }
}

// --------------------------------------------------------------------------- //
// 自动验收倒计时与延长验收
// --------------------------------------------------------------------------- //

export const REVIEW_EXTENSION_MAX_DAYS = 14;
export const REVIEW_EXTENSION_MIN_DAYS = 1;

export interface BayAutoAcceptCountdown {
  /** none=没有自动验收时间；counting=还在验收期；due=已到点，等系统处理。 */
  state: "none" | "counting" | "due";
  dueAt: string | null;
  days: number;
  hours: number;
  totalHours: number;
}

export function autoAcceptCountdown(autoAcceptAt?: string | null, now = Date.now()): BayAutoAcceptCountdown {
  const empty: BayAutoAcceptCountdown = { state: "none", dueAt: null, days: 0, hours: 0, totalHours: 0 };
  if (!autoAcceptAt) return empty;
  const due = new Date(autoAcceptAt).getTime();
  if (!Number.isFinite(due)) return empty;
  const diff = due - now;
  if (diff <= 0) return { state: "due", dueAt: autoAcceptAt, days: 0, hours: 0, totalHours: 0 };
  const totalHours = Math.ceil(diff / 3_600_000);
  return {
    state: "counting",
    dueAt: autoAcceptAt,
    days: Math.floor(totalHours / 24),
    hours: totalHours % 24,
    totalHours,
  };
}

export function autoAcceptText(tt: UITranslate, countdown: BayAutoAcceptCountdown): string {
  if (countdown.state === "due") return tt("已到自动完成时间，系统正在处理");
  if (countdown.state !== "counting") return "";
  return countdown.totalHours < 24
    ? tt("还有约 {n} 小时自动完成", { n: countdown.totalHours })
    : tt("还有 {days} 天 {hours} 小时自动完成", { days: countdown.days, hours: countdown.hours });
}

export function reviewExtensionUsedDays(order: Pick<BayOrder, "review_extended_days">): number {
  const used = Number(order.review_extended_days || 0);
  return Number.isFinite(used) && used > 0 ? Math.floor(used) : 0;
}

export function reviewExtensionRemainingDays(order: Pick<BayOrder, "review_extended_days">): number {
  return Math.max(0, REVIEW_EXTENSION_MAX_DAYS - reviewExtensionUsedDays(order));
}

export function reviewExtensionWarning(tt: UITranslate, order: Pick<BayOrder, "review_extended_days">, days: number): string {
  if (!Number.isInteger(days) || days < REVIEW_EXTENSION_MIN_DAYS) {
    return tt("延长天数至少 {n} 天", { n: REVIEW_EXTENSION_MIN_DAYS });
  }
  const remaining = reviewExtensionRemainingDays(order);
  if (remaining <= 0) return tt("验收期已累计延长 {n} 天，不能再延长", { n: REVIEW_EXTENSION_MAX_DAYS });
  if (days > remaining) return tt("最多还能延长 {n} 天（累计上限 {max} 天）", { n: remaining, max: REVIEW_EXTENSION_MAX_DAYS });
  return "";
}

export function isOrderOverdue(order: BayOrder, now = Date.now()): boolean {
  if (order.status !== "active") return false;
  const deadline = order.requirements?.deadline;
  if (typeof deadline === "string" && deadline) {
    const due = new Date(deadline).getTime();
    if (Number.isFinite(due) && due < now) return true;
  }
  return (order.milestones || []).some((item) => {
    if (!item.due_at || item.status === "approved" || item.status === "cancelled" || item.status === "released") return false;
    const due = new Date(item.due_at).getTime();
    return Number.isFinite(due) && due < now;
  });
}

export function revisionsLeft(order: Pick<BayOrder, "revisions_allowed" | "revisions_used">): boolean {
  const allowed = Number(order.revisions_allowed ?? -1);
  const used = Number(order.revisions_used || 0);
  return allowed < 0 || used < allowed;
}

export function sortedDeliveries(order: Pick<BayOrder, "deliveries">): BayOrderDelivery[] {
  return [...(order.deliveries || [])].sort((a, b) => Number(b.round || 0) - Number(a.round || 0));
}

// --------------------------------------------------------------------------- //
// 谁能做什么（照 talent 订单页；买家与卖家看到的动作不同）
// --------------------------------------------------------------------------- //

export interface BayOrderActions {
  /** 洽谈中两边都能签；改过条款的那一方会被后端拒。 */
  sign: boolean;
  /** 付款就绪、买家、有钱要付且还没付。 */
  pay: boolean;
  /** 付款平台已开、买家还没有可用的付款方式：只给「去设置付款方式」。 */
  setupPayment: boolean;
  deliver: boolean;
  submitMilestone: boolean;
  approveMilestone: boolean;
  completeAll: boolean;
  acceptDelivery: boolean;
  requestRevision: boolean;
  extendReview: boolean;
  cancel: boolean;
  dispute: boolean;
  viewDispute: boolean;
  review: boolean;
  repeat: boolean;
  openProject: boolean;
  tradeThread: boolean;
}

export const NO_ORDER_ACTIONS: BayOrderActions = Object.freeze({
  sign: false,
  pay: false,
  setupPayment: false,
  deliver: false,
  submitMilestone: false,
  approveMilestone: false,
  completeAll: false,
  acceptDelivery: false,
  requestRevision: false,
  extendReview: false,
  cancel: false,
  dispute: false,
  viewDispute: false,
  review: false,
  repeat: false,
  openProject: false,
  tradeThread: false,
});

export function orderActionsFor(order: BayOrder | null | undefined, gate?: BayOrderPaymentsGate | null): BayOrderActions {
  if (!order) return { ...NO_ORDER_ACTIONS };
  const role = orderRoleOf(order);
  if (!role) return { ...NO_ORDER_ACTIONS };
  const buyer = role === "buyer";
  const seller = role === "seller";
  const status = order.status;
  const negotiating = status === "draft" || status === "negotiating";
  const milestones = order.milestones || [];
  const hasMilestones = milestones.length > 0;
  const allApproved =
    hasMilestones && milestones.every((item) => item.status === "approved" || item.status === "released" || item.status === "cancelled");
  const paid = Number(order.total_fen || 0) > 0;
  return {
    sign: negotiating,
    pay: canPayOrder(order, gate),
    setupPayment:
      buyer && paid && Boolean(gate?.enabled) && !gate?.buyer_ready && (negotiating || order.payment_state === "unfunded"),
    deliver: seller && status === "active" && !hasMilestones,
    submitMilestone: seller && status === "active" && milestones.some((item) => item.status === "pending"),
    approveMilestone: buyer && status === "active" && milestones.some((item) => item.status === "submitted"),
    completeAll: buyer && status === "active" && allApproved,
    acceptDelivery: buyer && status === "delivered",
    requestRevision: buyer && status === "delivered" && revisionsLeft(order),
    extendReview: buyer && status === "delivered",
    cancel: negotiating || status === "active",
    dispute: status === "active" || status === "delivered",
    viewDispute: status === "disputed",
    review: status === "completed",
    repeat: buyer && status === "completed",
    openProject: !negotiating && status !== "cancelled" && Boolean(order.project_id || order.im_conversation_id),
    tradeThread: Boolean(order.thread_id),
  };
}

/** 订单列表与订单卡上的「下一步」一句话（相对当前查看者）。 */
export function nextActionText(tt: UITranslate, order: BayOrder, gate?: BayOrderPaymentsGate | null): string {
  const buyer = orderRoleOf(order) === "buyer";
  const paying = Boolean(gate?.enabled) && contractPaymentsOn(order);
  if (paying && order.payment_state === "unfunded") {
    if (order.status === "draft" || order.status === "negotiating") {
      return buyer ? tt("确认条款；签约后付款") : tt("对方确认条款后才会付款");
    }
    if (order.status === "active" || order.status === "delivered") {
      return buyer ? (gate?.buyer_ready ? tt("去付款") : tt("付款暂未开放")) : tt("等待买家完成付款");
    }
  }
  if (paying && order.status === "completed") {
    if (order.payment_state === "released") return tt("已验收完成，款项已付给接单方，可以互评");
    if (order.payment_state === "refunded") return tt("已验收，款项已退款");
    if (order.payment_state === "split") return tt("已验收，部分放款部分退款，可以互评");
  }
  switch (order.status) {
    case "draft":
    case "negotiating":
      return buyer ? tt("等待对方确认条款") : tt("对方等你确认条款");
    case "active":
      return buyer ? tt("等待接单方交付") : tt("去提交交付");
    case "delivered":
      return buyer ? tt("验收，或要求修改") : tt("等待买家验收，超时将自动通过");
    case "completed":
      return tt("已验收完成，可以互评");
    case "cancelled":
      return tt("已取消");
    case "disputed":
      return tt("争议处理中，去看进展或补充说明");
    default:
      return "";
  }
}

/** 这单是否「等我动手」（我的订单里「待我处理」那一组）。 */
export function orderNeedsMe(order: BayOrder, gate?: BayOrderPaymentsGate | null): boolean {
  const actions = orderActionsFor(order, gate);
  const role = orderRoleOf(order);
  if (order.status === "draft" || order.status === "negotiating") return role === "seller" || actions.sign;
  return (
    actions.pay ||
    actions.deliver ||
    actions.submitMilestone ||
    actions.approveMilestone ||
    actions.completeAll ||
    actions.acceptDelivery
  );
}

export type BayOrderGroup = "active" | "todo" | "done" | "cancelled";

/** 「我的订单」的四组：进行中 / 待我处理 / 已完成 / 已取消。待我处理优先于进行中。 */
export function orderGroupOf(order: BayOrder, gate?: BayOrderPaymentsGate | null): BayOrderGroup {
  if (order.status === "completed") return "done";
  if (order.status === "cancelled") return "cancelled";
  return orderNeedsMe(order, gate) ? "todo" : "active";
}

// --------------------------------------------------------------------------- //
// 作品链接（契约 §4.2 末段：子站 origin + open_path；拿不到域名就不给链接）
// --------------------------------------------------------------------------- //

/** 站内相对路径：必须以单个 `/` 开头，不许带协议或 `//`。 */
export function safeSitePath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  const text = path.trim();
  if (!text.startsWith("/") || text.startsWith("//") || text.includes("\\") || /[\u0000-\u001f]/.test(text)) return null;
  if (text.length > 600) return null;
  return text;
}

export function orderWorkHref(
  work: BayOrderWork | null | undefined,
  resolve: { label: (siteKey: string) => string | null; origin: (label: string) => string | undefined },
): string | null {
  if (!work || typeof work.site_key !== "string") return null;
  const path = safeSitePath(work.open_path);
  if (!path) return null;
  const label = resolve.label(work.site_key);
  if (!label) return null;
  let origin: string | undefined;
  try {
    origin = resolve.origin(label);
  } catch {
    origin = undefined;
  }
  const base = safeHttpUrl(origin);
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}${path}`;
}
