// Bay 订单争议（移植自 talent `lib/talent/orders.ts` 的纠纷段与 `trust.ts` 的争议段）。
// 三层在界面上必须是三层：验收期内自己解决 → 争议评估（没有约束力）→ 平台裁定（任何时候都能请求）。
// 只用「争议评估」「平台裁定」两个说法。请求一律走 `./http`；给用户看的话由调用方的 `tt` 翻译。

import type { UITranslate } from "../../i18n/ui/useUI";
import { bayGet, bayPost } from "./http";
import { formatOrderAmount, pricingModelSplitsByTime, type BayOrder } from "./orders";

export type BayDisputeState =
  | "open"
  | "assessed"
  | "responding"
  | "escalated"
  | "resolved"
  | "rejected"
  | "withdrawn"
  | "reviewing";

export interface BayDisputeEvidence {
  id?: string;
  url: string;
  description: string;
  added_by_me?: boolean;
  created_at?: string;
}

export interface BayDisputeTimelineItem {
  id?: string;
  kind?: string;
  title: string;
  detail?: string;
  created_at: string;
}

export interface BayDisputeAssessment {
  id: string;
  dispute_id: string;
  verdict_hint: string;
  rationale_zh: string;
  evidence_refs: string[];
  /** 数据库里写死为 false；前端也只按「没有约束力」渲染。 */
  is_binding: false;
  created_at: string;
}

export interface BayDispute {
  id: string;
  contract_id: string;
  opened_by?: string;
  against_user_id?: string;
  reason: string;
  detail: string;
  state: BayDisputeState;
  resolution?: string;
  resolved_at?: string | null;
  created_at: string;
  updated_at?: string;
  contract_title?: string;
  counterparty_display_name?: string;
  can_withdraw?: boolean;
  viewer_role?: "opener" | "respondent";
  evidence?: BayDisputeEvidence[];
  timeline?: BayDisputeTimelineItem[];
  assessment?: BayDisputeAssessment | null;
  statements?: { user_id?: string; statement: string; created_at: string }[];
}

export interface BayDisputeDetail {
  dispute: BayDispute;
  assessment?: BayDisputeAssessment | null;
  timeline?: BayDisputeTimelineItem[];
}

export interface BayDisputeEvidenceInput {
  url: string;
  description: string;
}

export interface BayDisputeCreateInput {
  contract_id: string;
  reason: string;
  detail: string;
  evidence?: BayDisputeEvidenceInput[];
}

/** 发起争议表单里的「主要原因」，值就是存进后端的中文（与 talent 一致）。 */
export const DISPUTE_REASONS = [
  "交付物与约定不符",
  "对方逾期未交付",
  "对方失联",
  "已发生时长与实际不符",
  "其他",
] as const;

export const DISPUTE_DETAIL_LIMIT = 2000;
export const DISPUTE_EVIDENCE_LIMIT = 10;

function seg(value: string): string {
  return encodeURIComponent(value);
}

function cleanEvidence(items: readonly BayDisputeEvidenceInput[] | null | undefined): BayDisputeEvidenceInput[] {
  const out: BayDisputeEvidenceInput[] = [];
  for (const item of items ?? []) {
    const url = typeof item?.url === "string" ? item.url.trim() : "";
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ url: url.slice(0, 1024), description: String(item.description ?? "").trim().slice(0, 500) });
    if (out.length >= DISPUTE_EVIDENCE_LIMIT) break;
  }
  return out;
}

/** 请求体的形状：`{ contract_id, reason, detail, evidence: [] }`，原因不在清单里一律记成「其他」。 */
export function disputeCreateBody(input: BayDisputeCreateInput): Required<BayDisputeCreateInput> {
  const reason = (DISPUTE_REASONS as readonly string[]).includes(input.reason) ? input.reason : "其他";
  return {
    contract_id: input.contract_id,
    reason,
    detail: (input.detail || "").trim().slice(0, DISPUTE_DETAIL_LIMIT),
    evidence: cleanEvidence(input.evidence),
  };
}

/** 表单能不能提交；能提交返回 null，否则返回给用户看的原因。 */
export function disputeInputProblem(tt: UITranslate, input: Pick<BayDisputeCreateInput, "contract_id" | "detail">): string | null {
  if (!input.contract_id) return tt("找不到这笔订单。");
  const detail = (input.detail || "").trim();
  if (!detail) return tt("请说清发生了什么。");
  if (detail.length > DISPUTE_DETAIL_LIMIT) return tt("说明最多 {n} 字。", { n: DISPUTE_DETAIL_LIMIT });
  return null;
}

export function createBayDispute(input: BayDisputeCreateInput): Promise<{ dispute: BayDispute }> {
  return bayPost<{ dispute: BayDispute }>("/v1/talent/disputes", disputeCreateBody(input));
}

export async function listBayDisputes(): Promise<BayDispute[]> {
  const data = await bayGet<{ items?: BayDispute[]; disputes?: BayDispute[] }>("/v1/talent/disputes");
  const items = data?.items ?? data?.disputes ?? [];
  return Array.isArray(items) ? items.filter((item) => item && typeof item.id === "string") : [];
}

/** 这单正在进行（或最近一次）的争议；没有返回 null。 */
export async function findBayDisputeForOrder(contractId: string): Promise<BayDispute | null> {
  const items = await listBayDisputes();
  const mine = items.filter((item) => item.contract_id === contractId);
  if (!mine.length) return null;
  mine.sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
  return mine[0];
}

export function getBayDisputeDetail(id: string): Promise<BayDisputeDetail> {
  return bayGet<BayDisputeDetail>(`/v1/talent/disputes/${seg(id)}`);
}

export function assessBayDispute(id: string): Promise<{ assessment: BayDisputeAssessment }> {
  return bayPost<{ assessment: BayDisputeAssessment }>(`/v1/talent/disputes/${seg(id)}/assess`);
}

export function respondBayDispute(
  id: string,
  input: { statement: string; evidence?: BayDisputeEvidenceInput[] },
): Promise<{ dispute: BayDispute }> {
  return bayPost<{ dispute: BayDispute }>(`/v1/talent/disputes/${seg(id)}/respond`, {
    statement: (input.statement || "").trim().slice(0, DISPUTE_DETAIL_LIMIT),
    evidence: cleanEvidence(input.evidence),
  });
}

/** 请求平台裁定：前端不设任何可见性或可点性条件，后端拒绝就把中文原样显示。 */
export function escalateBayDispute(id: string): Promise<{ dispute: BayDispute }> {
  return bayPost<{ dispute: BayDispute }>(`/v1/talent/disputes/${seg(id)}/escalate`);
}

export function addBayDisputeEvidence(id: string, input: BayDisputeEvidenceInput): Promise<BayDisputeDetail> {
  const [clean] = cleanEvidence([input]);
  return bayPost<BayDisputeDetail>(`/v1/talent/disputes/${seg(id)}/evidence`, clean ?? { url: "", description: "" });
}

export function withdrawBayDispute(id: string): Promise<BayDisputeDetail> {
  return bayPost<BayDisputeDetail>(`/v1/talent/disputes/${seg(id)}/withdraw`);
}

/** 契约把 assessment 放顶层，现网放在 dispute 里；两处都读。 */
export function disputeAssessmentOf(payload: BayDisputeDetail | null | undefined): BayDisputeAssessment | null {
  return payload?.assessment ?? payload?.dispute?.assessment ?? null;
}

export function disputeTimelineOf(payload: BayDisputeDetail | null | undefined): BayDisputeTimelineItem[] {
  return payload?.timeline ?? payload?.dispute?.timeline ?? [];
}

export function disputeStateLabel(tt: UITranslate, state: string | null | undefined): string {
  switch (state) {
    case "open":
      return tt("已提交，待处理");
    case "assessed":
      return tt("已给出争议评估");
    case "responding":
      return tt("对方陈述中");
    case "escalated":
      return tt("已请求平台裁定");
    case "resolved":
      return tt("平台已裁定");
    case "rejected":
      return tt("未获支持");
    case "withdrawn":
      return tt("已撤回");
    case "reviewing":
      return tt("平台处理中");
    default:
      return "";
  }
}

export function disputeReasonLabel(tt: UITranslate, reason: string): string {
  switch (reason) {
    case "交付物与约定不符":
      return tt("交付物与约定不符");
    case "对方逾期未交付":
      return tt("对方逾期未交付");
    case "对方失联":
      return tt("对方失联");
    case "已发生时长与实际不符":
      return tt("已发生时长与实际不符");
    case "其他":
      return tt("其他");
    default:
      return reason;
  }
}

export type BayDisputeLayerKey = "review_window" | "assessment" | "resolution";

export interface BayDisputeLayer {
  key: BayDisputeLayerKey;
  order: 1 | 2 | 3;
  title: string;
  what: string;
  who: string;
}

export function disputeLayers(tt: UITranslate): BayDisputeLayer[] {
  return [
    {
      key: "review_window",
      order: 1,
      title: tt("第一层 · 验收期内自己解决"),
      what: tt("还在验收期就先要求修改，或者等它自动完成。绝大多数争议其实只是忘了点确认。"),
      who: tt("买卖双方，不需要平台介入"),
    },
    {
      key: "assessment",
      order: 2,
      title: tt("第二层 · 争议评估"),
      what: tt("平台读合同字段、时间戳和交付记录，给出建议与依据，双方都能看到同一份。"),
      who: tt("平台自动给出，没有约束力"),
    },
    {
      key: "resolution",
      order: 3,
      title: tt("第三层 · 平台裁定"),
      what: tt("由平台的人复核整件事并给出裁定；这一层任何时候都能请求，不因为已给出评估而关闭。"),
      who: tt("平台的人"),
    },
  ];
}

/** 争议现在处在哪一层：已请求平台裁定或已裁定 → 第三层；已评估 → 第二层；其余第一层。 */
export function currentDisputeLayer(dispute: Pick<BayDispute, "state"> | null, assessment?: BayDisputeAssessment | null): BayDisputeLayerKey {
  if (!dispute) return "review_window";
  if (dispute.state === "escalated" || dispute.state === "resolved" || dispute.state === "rejected") return "resolution";
  if (assessment || dispute.state === "assessed" || dispute.state === "responding") return "assessment";
  return "review_window";
}

export function assessmentNonBindingNote(tt: UITranslate): string {
  return tt("这是平台的争议评估，没有约束力，双方都可以不接受；不接受时可以继续请求平台裁定。");
}

export function disputeMoneyBanner(tt: UITranslate, enabled: boolean): string {
  return enabled
    ? tt("裁定会指令 Stripe 按结论退回买家或付给接单方。争议条款也允许双方另行约定提交独立第三方机构。")
    : tt("平台不代收也不代付这笔钱，所以不做资金冻结：任何结论都只写进订单与争议记录，实际款项由双方按结论自行结算。");
}

// --------------------------------------------------------------------------- //
// 按已发生时长分割（按次会诊 / 按时计费；不是「全退 / 不退」的二元裁决）
// --------------------------------------------------------------------------- //

export interface BayElapsedSplit {
  mechanical: boolean;
  startedAt: string | null;
  endedAt: string | null;
  elapsedHours: number | null;
  agreedHours: number | null;
  providerFen: number | null;
  requesterFen: number | null;
  steps: string[];
  note: string;
}

function agreedHoursOf(order: BayOrder): number | null {
  const value = Number(order.requirements?.hours);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function elapsedSplit(tt: UITranslate, order: BayOrder, now = Date.now()): BayElapsedSplit | null {
  if (!pricingModelSplitsByTime(order)) return null;
  const startedAt = order.accepted_at || order.created_at || null;
  const endedAt = order.delivered_at || order.disputed_at || null;
  const startMs = startedAt ? new Date(startedAt).getTime() : NaN;
  const endMs = endedAt ? new Date(endedAt).getTime() : now;
  const elapsedHours =
    Number.isFinite(startMs) && endMs > startMs ? Math.round(((endMs - startMs) / 3_600_000) * 100) / 100 : null;
  const agreedHours = agreedHoursOf(order);
  const missing = tt("缺失");
  const steps = [
    tt("开始时间戳：{at}", { at: startedAt || missing }),
    tt("结束时间戳：{at}", { at: endedAt || tt("尚未交付，按当前时间计") }),
    elapsedHours === null
      ? tt("已发生时长 = 结束 − 开始 = 无法计算")
      : tt("已发生时长 = 结束 − 开始 = {n} 小时", { n: elapsedHours }),
  ];
  const total = Number(order.total_fen || 0);
  if (elapsedHours === null || agreedHours === null || total <= 0) {
    steps.push(agreedHours === null ? tt("合同里没有记录约定时长，无法机械分割") : tt("时间戳不完整，无法机械分割"));
    return {
      mechanical: false,
      startedAt,
      endedAt,
      elapsedHours,
      agreedHours,
      providerFen: null,
      requesterFen: null,
      steps,
      note: tt("这笔订单缺少可机械判定的时长依据，需要平台裁定，平台不会自己算一个数字出来。"),
    };
  }
  const ratio = Math.min(1, elapsedHours / agreedHours);
  const providerFen = Math.min(total, Math.round(total * ratio));
  const requesterFen = total - providerFen;
  steps.push(
    tt("约定时长：{n} 小时", { n: agreedHours }),
    tt("已发生比例 = min(1, {a} ÷ {b}) = {pct}%", { a: elapsedHours, b: agreedHours, pct: (ratio * 100).toFixed(1) }),
    tt("归接单方 = 订单金额 × 已发生比例 = {amount}", { amount: formatOrderAmount(providerFen, order.currency) }),
    tt("归买家 = 订单金额 − 归接单方 = {amount}", { amount: formatOrderAmount(requesterFen, order.currency) }),
  );
  return {
    mechanical: true,
    startedAt,
    endedAt,
    elapsedHours,
    agreedHours,
    providerFen,
    requesterFen,
    steps,
    note: tt("这是按时间戳算出来的分割建议，不是二元裁决。"),
  };
}
