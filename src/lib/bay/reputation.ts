// Bay 声誉、评价与执业核验展示（移植自 talent `lib/talent/reputation.ts` 与 `trust.ts` 的评价段）。
// 三条口径照搬：样本不足显示「样本不足」，绝不渲染成 0；执业称谓只在对应领域核验通过时出现；
// 凭证编号任何界面都不显示。提交评价的函数也在这里，订单页（W07）import 它。

import type { UITranslate } from "../../i18n/ui/useUI";
import { bayGet, bayPost } from "./http";
import { bayQuery, type BayReview } from "./directory";

export interface BayReputationStats {
  delivered: number | null;
  median_hours: number | null;
  dispute_rate: number | null;
  rework_rate: number | null;
  repeat_rate: number | null;
  rating_avg: number | null;
  rating_count: number | null;
  window_days?: number | null;
  computed_at?: string | null;
}

export function getBayReputation(handle: string): Promise<BayReputationStats> {
  return bayGet<BayReputationStats>(`/v1/talent/reputation/${encodeURIComponent(handle)}`, { anonymous: true });
}

function blank(value: number | null | undefined): boolean {
  return value === null || value === undefined || !Number.isFinite(Number(value));
}

export function reputationRate(tt: UITranslate, value: number | null | undefined): string {
  if (blank(value)) return tt("样本不足");
  const raw = Number(value);
  const percent = Math.max(0, Math.min(100, raw <= 1 ? raw * 100 : raw));
  return `${Math.round(percent * 10) / 10}%`;
}

export function reputationCount(tt: UITranslate, value: number | null | undefined): string {
  if (blank(value)) return tt("样本不足");
  return `${Math.max(0, Math.round(Number(value)))}`;
}

export function reputationHours(tt: UITranslate, value: number | null | undefined): string {
  if (blank(value)) return tt("样本不足");
  const hours = Number(value);
  if (hours < 1) return tt("{n} 分钟", { n: Math.max(1, Math.round(hours * 60)) });
  if (hours < 48) return tt("{n} 小时", { n: Math.round(hours * 10) / 10 });
  return tt("{n} 天", { n: Math.round((hours / 24) * 10) / 10 });
}

/** 评分是辅位：没有已公开评价时说「暂无评价」，不编造分数。 */
export function reputationRating(
  tt: UITranslate,
  stats: Pick<BayReputationStats, "rating_avg" | "rating_count"> | null | undefined,
): string {
  if (!stats || blank(stats.rating_avg) || (stats.rating_count ?? 0) <= 0) return tt("暂无评价");
  return tt("{avg} 分 · {n} 条评价", { avg: Number(stats.rating_avg).toFixed(1), n: Math.round(Number(stats.rating_count)) });
}

/** 交付记录的主位指标，顺序就是版面顺序。 */
export function reputationHighlights(
  tt: UITranslate,
  stats: BayReputationStats | null | undefined,
): { key: string; label: string; value: string }[] {
  return [
    { key: "delivered", label: tt("已完成交付"), value: reputationCount(tt, stats?.delivered) },
    { key: "median_hours", label: tt("中位交付时长"), value: reputationHours(tt, stats?.median_hours) },
    { key: "dispute_rate", label: tt("争议率"), value: reputationRate(tt, stats?.dispute_rate) },
    { key: "rework_rate", label: tt("返工率"), value: reputationRate(tt, stats?.rework_rate) },
    { key: "repeat_rate", label: tt("复购率"), value: reputationRate(tt, stats?.repeat_rate) },
  ];
}

export type BayVettingState = "verified" | "expired" | "unverified";

function normalizeState(raw: unknown): BayVettingState {
  const value = String(raw ?? "").toLowerCase();
  if (value === "verified" || value === "valid" || value === "approved" || value === "pass") return "verified";
  if (value === "expired" || value === "revoked") return "expired";
  return "unverified";
}

/** 读不准就是「未核验」：从严兜底，绝不因为读不到就给出称谓。 */
export function practiceVettingOf(source: unknown): { domain: string; state: BayVettingState; checked_at: string | null }[] {
  if (!source || typeof source !== "object") return [];
  const holder = source as Record<string, unknown>;
  const raw = holder.practice_vetting ?? holder.vetting ?? holder.practice_credentials ?? null;
  if (!Array.isArray(raw)) return [];
  const out: { domain: string; state: BayVettingState; checked_at: string | null }[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.domain !== "string" || !row.domain) continue;
    out.push({
      domain: row.domain,
      state: normalizeState(row.state ?? row.status),
      checked_at: typeof row.checked_at === "string" ? row.checked_at : null,
    });
  }
  return out;
}

function practiceTitleText(tt: UITranslate, domain: string): string | null {
  switch (domain) {
    case "medical":
      return tt("医师执业信息已核验");
    case "legal":
      return tt("律师执业信息已核验");
    case "vet":
      return tt("执业兽医信息已核验");
    case "edu_adult":
      return tt("教师资格已核验");
    default:
      return null;
  }
}

/** 执业称谓：只有该领域核验通过时才有值；过期与未核验都返回 null。 */
export function practiceTitleFor(tt: UITranslate, source: unknown, domain: string | null | undefined): string | null {
  if (!domain || domain === "none") return null;
  const found = practiceVettingOf(source).find((item) => item.domain === domain);
  return found?.state === "verified" ? practiceTitleText(tt, domain) : null;
}

/** 一个人全部已核验的执业信息（只给称谓，不给凭证编号）。 */
export function verifiedPracticeTitles(tt: UITranslate, source: unknown): string[] {
  return practiceVettingOf(source)
    .filter((item) => item.state === "verified")
    .map((item) => practiceTitleText(tt, item.domain))
    .filter((title): title is string => Boolean(title));
}

/** 未核验时能显示的只有自述职业，且必须标明是自述。 */
export function selfDescribedRoleOf(source: unknown): string {
  if (!source || typeof source !== "object") return "";
  const value = (source as Record<string, unknown>).self_described_role;
  return typeof value === "string" ? value.trim() : "";
}

export interface BayReviewInput {
  contract_id: string;
  rating: number;
  score_communication: number;
  score_quality: number;
  score_timeliness: number;
  score_value: number;
  body: string;
}

export interface BayTrustReview extends BayReview {
  score_communication?: number | null;
  score_quality?: number | null;
  score_timeliness?: number | null;
  score_value?: number | null;
  seller_reply?: string;
  seller_replied_at?: string | null;
}

const SCORE_KEYS = ["rating", "score_communication", "score_quality", "score_timeliness", "score_value"] as const;

/** 评价能不能提交：五项分数都是 1–5 的整数、正文不超过 2000 字。返回给用户看的原因，可提交时返回 null。 */
export function reviewInputProblem(tt: UITranslate, input: BayReviewInput): string | null {
  if (!input.contract_id) return tt("找不到这笔订单。");
  for (const key of SCORE_KEYS) {
    const value = input[key];
    if (!Number.isInteger(value) || value < 1 || value > 5) return tt("请给每一项打 1–5 分。");
  }
  if ((input.body || "").length > 2000) return tt("评价最多 2000 字。");
  return null;
}

export function submitBayReview(input: BayReviewInput): Promise<{ review: BayTrustReview; revealed: boolean }> {
  return bayPost<{ review: BayTrustReview; revealed: boolean }>("/v1/talent/reviews", {
    ...input,
    body: (input.body || "").trim(),
  });
}

export interface BayContractReviews {
  reviews: BayTrustReview[];
  revealed: boolean;
  mine?: BayTrustReview | null;
}

export function listBayContractReviews(contractId: string): Promise<BayContractReviews> {
  return bayGet<BayContractReviews>(`/v1/talent/reviews${bayQuery({ contract_id: contractId })}`);
}

export function listBayUserReviews(
  targetUserId: string,
  options?: { sort?: "recent" | "rating_desc" | "rating_asc"; limit?: number; offset?: number },
): Promise<{ reviews: BayTrustReview[]; revealed: boolean }> {
  return bayGet<{ reviews: BayTrustReview[]; revealed: boolean }>(
    `/v1/talent/reviews${bayQuery({ target_user_id: targetUserId, sort: options?.sort, limit: options?.limit, offset: options?.offset })}`,
  );
}

export function replyBayReview(reviewId: string, reply: string): Promise<{ review: BayTrustReview }> {
  return bayPost<{ review: BayTrustReview }>(`/v1/talent/reviews/${encodeURIComponent(reviewId)}/reply`, { reply: reply.trim() });
}
