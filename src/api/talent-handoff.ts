"use client";

// ============================================================================
// @oceanleo/ui — 人才市场「把正在进行的一段工作交给真人」客户端（单一事实源）
// ----------------------------------------------------------------------------
// 两条链，形状逐字对齐 talent-market-v1 合同 §3.1 / §3.2：
//   §3.1 Handoff   /v1/talent/handoffs*          用户在 AI 对话里卡住 → 叫真人
//   §3.2 Agent 雇人 /v1/talent/agent-hiring/*     用户的 agent 干不动 → 自己去请真人
//
// 传输层复用包内既有的 `authed()`（src/lib/agent.ts）：它自带网关 base、Bearer、
// no-store 与统一返回形状。这里**不新造 fetch、不硬编码任何域名**——跨域相关的面
// 一个字符都不碰。
//
// 三条不变量，写在客户端这一侧也要成立：
//   1. 上下文是**白名单**。`context` 里没列的消息/产物，真人 claim 之后也读不到；
//      所以调用方必须显式传要给出去的 ref，本模块不提供「把整段会话都给出去」的捷径。
//   2. agent 雇人的默认态是**最保守**的：总开关关、两个上限都是 0、每次都要人确认。
//      读策略失败时 UI 必须回落到 DEFAULT_AGENT_HIRING_POLICY，不许乐观放开。
//   3. 金额一律 fen（整数），时间一律 ISO8601 UTC 字符串。
// ============================================================================

import { authed, type AgentApiResult } from "../lib/agent";

/** 合同 §3：分页响应恒为 {items, next_cursor}。 */
export interface TalentPage<T> {
  items: T[];
  next_cursor: string | null;
}

export interface TalentPageQuery {
  limit?: number;
  cursor?: string | null;
}

export type HandoffOriginKind = "conversation" | "agent" | "manual";
export type HandoffMode = "open" | "invited";
export type HandoffState =
  | "draft"
  | "open"
  | "claimed"
  | "contracted"
  | "expired"
  | "cancelled";

export interface Handoff {
  id: string;
  requester_user_id: string;
  origin_kind: HandoffOriginKind;
  origin_ref: string;
  category: string;
  brief: string;
  budget_fen: number;
  mode: HandoffMode;
  invited_user_id: string | null;
  state: HandoffState;
  claimed_by: string | null;
  claimed_at: string | null;
  thread_id: string | null;
  contract_id: string | null;
  expires_at: string | null;
  created_at: string;
}

/** 已授权给对方的那一条上下文（授权面的唯一事实源来自服务端，不是本地勾选状态）。 */
export interface HandoffContextItem {
  kind: "message" | "artifact";
  ref: string;
  preview: string;
  granted_at: string;
}

/** 白名单：只有这里列出的 ref 会被对方看到。各 ≤50 条。 */
export interface HandoffContextGrant {
  messages: string[];
  artifacts: string[];
}

export interface CreateHandoffInput {
  origin_kind: HandoffOriginKind;
  origin_ref: string;
  category: string;
  brief: string;
  /** 0 = 先谈（面议）。 */
  budget_fen: number;
  mode: HandoffMode;
  /** mode="invited" 时必填：要请的那个人的 handle。 */
  invited_handle?: string | null;
  context: HandoffContextGrant;
}

/** 合同 §3.1：`brief` ≤4000、`origin_ref` ≤500、context 每类 ≤50 条。 */
export const HANDOFF_BRIEF_MAX_LENGTH = 4_000;
export const HANDOFF_ORIGIN_REF_MAX_LENGTH = 500;
export const HANDOFF_CONTEXT_MAX_ITEMS = 50;

/** 计费/品类目录（合同 §3.4，W03 实现）。`required_fields` 的形状由 W03 定，这里只读。 */
export interface TalentFieldSpec {
  key: string;
  label_zh: string;
  type: "text" | "int" | "enum" | "bool" | "list";
  required: boolean;
  machine_checkable: boolean;
  enum?: string[] | null;
  max_len?: number | null;
  max?: number | null;
}

export interface TalentCategory {
  slug: string;
  parent_slug?: string | null;
  name_zh: string;
  name_en?: string;
  summary?: string;
  icon?: string;
  position?: number;
  required_fields?: TalentFieldSpec[];
}

export type AgentHiringDecision =
  | "auto_allowed"
  | "pending_confirmation"
  | "blocked_by_cap"
  | "blocked_by_category"
  | "blocked_by_policy_off";

export interface AgentHiringPolicy {
  enabled: boolean;
  per_request_cap_fen: number;
  daily_cap_fen: number;
  allowed_categories: string[];
  require_confirmation: boolean;
}

export interface AgentHiringEvent {
  id: string;
  user_id: string;
  agent_ref: string;
  action: string;
  handoff_id: string | null;
  decision: AgentHiringDecision;
  reason: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AgentHiringRequestInput {
  agent_ref: string;
  category: string;
  brief: string;
  budget_fen: number;
  origin_ref: string;
  context: HandoffContextGrant;
}

export interface AgentHiringRequestOutcome {
  decision: AgentHiringDecision;
  handoff_id: string | null;
  event_id: string;
}

/**
 * 用户没主动开，agent 一个人都请不动。读策略失败（未登录 / 端点尚未上线 / 网络错）时
 * 界面必须显示这一份，而**不是**把开关画成开着的。
 */
export const DEFAULT_AGENT_HIRING_POLICY: Readonly<AgentHiringPolicy> =
  Object.freeze({
    enabled: false,
    per_request_cap_fen: 0,
    daily_cap_fen: 0,
    allowed_categories: [] as string[],
    require_confirmation: true,
  });

/**
 * 求助状态变了（新建 / 撤销授权 / 取消）。入口按钮与对话流里的状态条是两棵子树，
 * 靠这个事件对齐，不必让 AgentChat 替它们持有一份共享 state。
 */
export const TALENT_HANDOFF_CHANGED_EVENT = "oceanleo:talent-handoff-changed";

export function notifyTalentHandoffChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(TALENT_HANDOFF_CHANGED_EVENT));
  }
}

export function onTalentHandoffChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(TALENT_HANDOFF_CHANGED_EVENT, listener);
  return () =>
    window.removeEventListener(TALENT_HANDOFF_CHANGED_EVENT, listener);
}

function pageQuery(query?: TalentPageQuery): string {
  const params = new URLSearchParams();
  if (query?.limit && Number.isSafeInteger(query.limit) && query.limit > 0) {
    params.set("limit", String(query.limit));
  }
  if (query?.cursor) params.set("cursor", query.cursor);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function trimmedRefs(refs: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const ref of refs) {
    const value = String(ref || "").trim();
    if (value) seen.add(value);
  }
  return [...seen].slice(0, HANDOFF_CONTEXT_MAX_ITEMS);
}

/**
 * 白名单收口：去空、去重、按 §3.1 截到 50 条。上层永远走这里，免得某个界面
 * 把一整段会话推给服务端再指望服务端截断。
 */
export function normalizeHandoffContext(
  context: Partial<HandoffContextGrant> | undefined,
): HandoffContextGrant {
  return {
    messages: trimmedRefs(context?.messages || []),
    artifacts: trimmedRefs(context?.artifacts || []),
  };
}

export function listTalentCategories(): Promise<
  AgentApiResult<{ items: TalentCategory[] }>
> {
  return authed<{ items: TalentCategory[] }>("/v1/talent/categories");
}

export function createHandoff(
  input: CreateHandoffInput,
): Promise<AgentApiResult<{ handoff: Handoff }>> {
  const body: CreateHandoffInput = {
    ...input,
    origin_ref: input.origin_ref.slice(0, HANDOFF_ORIGIN_REF_MAX_LENGTH),
    brief: input.brief.trim().slice(0, HANDOFF_BRIEF_MAX_LENGTH),
    budget_fen:
      Number.isSafeInteger(input.budget_fen) && input.budget_fen > 0
        ? input.budget_fen
        : 0,
    invited_handle:
      input.mode === "invited"
        ? (input.invited_handle || "").trim() || null
        : null,
    context: normalizeHandoffContext(input.context),
  };
  return authed<{ handoff: Handoff }>("/v1/talent/handoffs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listMyHandoffs(
  query?: TalentPageQuery,
): Promise<AgentApiResult<TalentPage<Handoff>>> {
  return authed<TalentPage<Handoff>>(
    `/v1/talent/handoffs/mine${pageQuery(query)}`,
  );
}

export function listHandoffInbox(
  query?: TalentPageQuery,
): Promise<AgentApiResult<TalentPage<Handoff>>> {
  return authed<TalentPage<Handoff>>(
    `/v1/talent/handoffs/inbox${pageQuery(query)}`,
  );
}

export function getHandoff(
  id: string,
): Promise<AgentApiResult<{ handoff: Handoff }>> {
  return authed<{ handoff: Handoff }>(
    `/v1/talent/handoffs/${encodeURIComponent(id)}`,
  );
}

/** 仅发起人与已 claim 者可读；返回的是**服务端认账的授权面**。 */
export function getHandoffContext(
  id: string,
): Promise<AgentApiResult<{ items: HandoffContextItem[] }>> {
  return authed<{ items: HandoffContextItem[] }>(
    `/v1/talent/handoffs/${encodeURIComponent(id)}/context`,
  );
}

export function claimHandoff(
  id: string,
): Promise<AgentApiResult<{ handoff: Handoff; thread_id: string }>> {
  return authed<{ handoff: Handoff; thread_id: string }>(
    `/v1/talent/handoffs/${encodeURIComponent(id)}/claim`,
    { method: "POST" },
  );
}

export async function cancelHandoff(
  id: string,
): Promise<AgentApiResult<{ handoff: Handoff }>> {
  const result = await authed<{ handoff: Handoff }>(
    `/v1/talent/handoffs/${encodeURIComponent(id)}/cancel`,
    { method: "POST" },
  );
  if (result.ok) notifyTalentHandoffChanged();
  return result;
}

/** 撤回授权：立即生效。撤到空也合法——那是「我全收回」。 */
export async function revokeHandoffContext(
  id: string,
  grant: Partial<HandoffContextGrant>,
): Promise<AgentApiResult<{ revoked: number }>> {
  const normalized = normalizeHandoffContext(grant);
  const result = await authed<{ revoked: number }>(
    `/v1/talent/handoffs/${encodeURIComponent(id)}/revoke-context`,
    {
      method: "POST",
      body: JSON.stringify({
        message_ids: normalized.messages,
        artifact_ids: normalized.artifacts,
      }),
    },
  );
  if (result.ok) notifyTalentHandoffChanged();
  return result;
}

export function createHandoffContract(
  id: string,
  body: {
    title: string;
    description: string;
    engagement_kind: string;
    total_fen: number;
  },
): Promise<AgentApiResult<{ contract_id: string }>> {
  return authed<{ contract_id: string }>(
    `/v1/talent/handoffs/${encodeURIComponent(id)}/contract`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function getAgentHiringPolicy(): Promise<
  AgentApiResult<{ policy: AgentHiringPolicy }>
> {
  return authed<{ policy: AgentHiringPolicy }>(
    "/v1/talent/agent-hiring/policy",
  );
}

export function putAgentHiringPolicy(
  policy: AgentHiringPolicy,
): Promise<AgentApiResult<{ policy: AgentHiringPolicy }>> {
  return authed<{ policy: AgentHiringPolicy }>(
    "/v1/talent/agent-hiring/policy",
    { method: "PUT", body: JSON.stringify(normalizeAgentHiringPolicy(policy)) },
  );
}

/**
 * 上限只能是非负整数 fen。任何脏值（NaN / 负数 / 小数）都归 0 = 请不动人，
 * 而不是「视为无限」。
 */
export function normalizeAgentHiringPolicy(
  policy: Partial<AgentHiringPolicy> | undefined,
): AgentHiringPolicy {
  const cap = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value > 0
      ? value
      : 0;
  return {
    enabled: policy?.enabled === true,
    per_request_cap_fen: cap(policy?.per_request_cap_fen),
    daily_cap_fen: cap(policy?.daily_cap_fen),
    allowed_categories: Array.isArray(policy?.allowed_categories)
      ? trimmedRefs(policy.allowed_categories as string[])
      : [],
    require_confirmation: policy?.require_confirmation !== false,
  };
}

export function requestAgentHiring(
  input: AgentHiringRequestInput,
): Promise<AgentApiResult<AgentHiringRequestOutcome>> {
  return authed<AgentHiringRequestOutcome>("/v1/talent/agent-hiring/requests", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      brief: input.brief.trim().slice(0, HANDOFF_BRIEF_MAX_LENGTH),
      origin_ref: input.origin_ref.slice(0, HANDOFF_ORIGIN_REF_MAX_LENGTH),
      context: normalizeHandoffContext(input.context),
    }),
  });
}

export function listAgentHiringEvents(
  query?: TalentPageQuery,
): Promise<AgentApiResult<TalentPage<AgentHiringEvent>>> {
  return authed<TalentPage<AgentHiringEvent>>(
    `/v1/talent/agent-hiring/events${pageQuery(query)}`,
  );
}

/** 人类推翻 agent 的唯一入口（欧盟 (EU) 2024/2831 的算法管理复核要求）。 */
export function overrideAgentHiringEvent(
  eventId: string,
  action: "approve" | "reject",
  note = "",
): Promise<AgentApiResult<{ event: AgentHiringEvent }>> {
  return authed<{ event: AgentHiringEvent }>(
    `/v1/talent/agent-hiring/events/${encodeURIComponent(eventId)}/override`,
    { method: "POST", body: JSON.stringify({ action, note }) },
  );
}

/** fen → 「¥12.34」。整数元不拖两位小数。金额单位在传输层恒为 fen。 */
export function formatFen(fen: number): string {
  const value = Number.isFinite(fen) ? Math.max(0, Math.trunc(fen)) : 0;
  const yuan = value / 100;
  return `¥${
    Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2)
  }`;
}

/** 界面里用户填的是元；空 / 脏值一律 0 = 面议。 */
export function fenFromYuanInput(input: string): number {
  const parsed = Number.parseFloat(String(input || "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}
