// Bay 资质审核（移植自 talent `lib/talent/vetting.ts`，形状按网关 `app/talent/vetting.py` 的实际返回）。
// 只提交可公开查验的凭证编号与查验来源：不收证件照片、身份证号、学籍原始数据。
// 限定领域（医疗、法律、宠物医疗）第一版不开放，这里的领域清单里永远没有它们。

import { bayGet, bayPost } from "./http";
import { isSellerRestrictedDomain } from "./seller";

/** 可提交审核的领域（后端 `REGULATED_DOMAINS` 去掉 none 与限定领域）。 */
export const BAY_VETTING_DOMAINS = ["tax", "psych", "edu_adult", "career", "research"] as const;
export type BayVettingDomain = (typeof BAY_VETTING_DOMAINS)[number];

/** 凭证种类：执业资格三种 + 在线学历验证报告。 */
export const BAY_VETTING_KINDS = ["practice_teaching", "practice_medical", "practice_legal", "education"] as const;
export type BayVettingKind = (typeof BAY_VETTING_KINDS)[number];

/** 界面上给卖家选的种类（开放领域不限种类，后端只对限定领域要求执业资格）。 */
export const BAY_VETTING_KIND_CHOICES: BayVettingKind[] = ["practice_teaching", "practice_medical", "practice_legal", "education"];

export type BayCredentialState = "pending" | "valid" | "expired" | "revoked";
export type BayDecisionVerdict = "pass" | "reject" | "manual";

export interface BayVettingCredential {
  id: string;
  domain: string;
  state: BayCredentialState;
  source: string;
  checked_at: string | null;
  expires_at: string | null;
  recheck_due_at: string | null;
}

export interface BayVettingDecision {
  id: string;
  service_id: string | null;
  verdict: BayDecisionVerdict;
  reason_code: string;
  reason_zh: string;
  actor: string;
  appealed: boolean;
  created_at: string | null;
}

export interface BayMyVetting {
  credentials: BayVettingCredential[];
  decisions: BayVettingDecision[];
  recheck_days: number;
}

export interface BayVettingSubmitInput {
  domain: string;
  kind: BayVettingKind;
  credential_no: string;
  source: string;
  expires_at?: string | null;
}

const CREDENTIAL_STATES: BayCredentialState[] = ["pending", "valid", "expired", "revoked"];
const VERDICTS: BayDecisionVerdict[] = ["pass", "reject", "manual"];

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function asCredential(value: unknown): BayVettingCredential | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  const domain = text(row.domain);
  if (!id || !domain || isSellerRestrictedDomain(domain)) return null;
  const state = CREDENTIAL_STATES.includes(row.state as BayCredentialState) ? (row.state as BayCredentialState) : "pending";
  return {
    id,
    domain,
    state,
    source: text(row.source),
    checked_at: nullableText(row.checked_at),
    expires_at: nullableText(row.expires_at),
    recheck_due_at: nullableText(row.recheck_due_at),
  };
}

function asDecision(value: unknown): BayVettingDecision | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  if (!id) return null;
  return {
    id,
    service_id: nullableText(row.service_id),
    verdict: VERDICTS.includes(row.verdict as BayDecisionVerdict) ? (row.verdict as BayDecisionVerdict) : "manual",
    reason_code: text(row.reason_code),
    reason_zh: text(row.reason_zh),
    actor: text(row.actor) || "auto",
    appealed: row.appealed === true,
    created_at: nullableText(row.created_at),
  };
}

export function normalizeMyVetting(raw: unknown): BayMyVetting {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const credentials = Array.isArray(body.credentials)
    ? body.credentials.map(asCredential).filter((row): row is BayVettingCredential => !!row)
    : [];
  const decisions = Array.isArray(body.decisions)
    ? body.decisions.map(asDecision).filter((row): row is BayVettingDecision => !!row)
    : [];
  const days = Number(body.recheck_days);
  return { credentials, decisions, recheck_days: Number.isFinite(days) && days > 0 ? days : 180 };
}

export async function fetchMyVetting(): Promise<BayMyVetting> {
  return normalizeMyVetting(await bayGet<unknown>("/v1/talent/vetting/mine"));
}

/** 证件号形状（18 位身份证）一律不让提交：这里只收公开可查的执业/资格编号。 */
export function looksLikeIdNumber(value: string): boolean {
  return /^\d{17}[\dXx]$/.test(value.replace(/\s+/g, ""));
}

export type BayVettingProblem = "domain" | "kind" | "credential" | "id_number" | "source";

/** 提交前在本地挡住的问题（后端仍会再判一次）；没有问题返回 null。 */
export function vettingSubmitProblem(input: Partial<BayVettingSubmitInput>): BayVettingProblem | null {
  const domain = text(input.domain);
  if (!domain || isSellerRestrictedDomain(domain) || !(BAY_VETTING_DOMAINS as readonly string[]).includes(domain)) return "domain";
  if (!input.kind || !BAY_VETTING_KIND_CHOICES.includes(input.kind)) return "kind";
  const credential = text(input.credential_no).trim();
  if (!credential) return "credential";
  if (looksLikeIdNumber(credential)) return "id_number";
  if (!text(input.source).trim()) return "source";
  return null;
}

export function vettingSubmitBody(input: BayVettingSubmitInput): BayVettingSubmitInput {
  const body: BayVettingSubmitInput = {
    domain: input.domain,
    kind: input.kind,
    credential_no: input.credential_no.trim().slice(0, 64),
    source: input.source.trim().slice(0, 200),
  };
  if (input.expires_at) body.expires_at = input.expires_at;
  return body;
}

export function submitVetting(input: BayVettingSubmitInput): Promise<{ verification_id: string; credential: BayVettingCredential }> {
  return bayPost<{ verification_id: string; credential: BayVettingCredential }>("/v1/talent/vetting/submit", vettingSubmitBody(input));
}

/** 只有被拒、且还没申诉过的那一条判定能申诉（后端第二次申诉回 409）。 */
export function canAppealDecision(decision: Pick<BayVettingDecision, "verdict" | "appealed"> | null | undefined): boolean {
  return Boolean(decision && decision.verdict === "reject" && !decision.appealed);
}

/** 申诉一次自动拒绝，转人工复核。网关不收申诉正文：理由就是那条判定本身。 */
export function appealVettingDecision(decisionId: string): Promise<{ decision: BayVettingDecision }> {
  return bayPost<{ decision: BayVettingDecision }>(`/v1/talent/vetting/${encodeURIComponent(decisionId)}/appeal`);
}

/** 复核到期的状态：还有几天 / 今天到期 / 已过期几天 / 还没有到期时间。 */
export type BayExpiry = { kind: "none" } | { kind: "future"; days: number } | { kind: "today" } | { kind: "past"; days: number };

export function vettingExpiry(expiresAt: string | null | undefined, now: number = Date.now()): BayExpiry {
  if (!expiresAt) return { kind: "none" };
  const due = new Date(expiresAt).getTime();
  if (!Number.isFinite(due)) return { kind: "none" };
  const days = Math.round((due - now) / 86_400_000);
  if (days < 0) return { kind: "past", days: Math.abs(days) };
  if (days === 0) return { kind: "today" };
  return { kind: "future", days };
}
