// LeoBay 需求与报价客户端（W04）。页面不直接请求网关，所有读写都从这里经 http.ts 出去。
// 逻辑照 talent 站 lib/talent/demands.ts；Bay 额外记下发布站点（posted_site）与附带作品（attached_work）。

import { authed } from "../agent";
import { formatMoney, ledgerCurrency } from "../money";
import { BayApiError, bayDelete, bayGet, bayPost } from "./http";
import type { BayWorkRef } from "./types";

export type EngagementKind =
  | "fixed"
  | "session"
  | "hourly"
  | "milestone"
  | "free"
  | "retainer"
  | "bounty";

/** 发需求时可选的计费方式；`retainer` / `bounty` 只保留渲染能力。 */
export const DEMAND_ENGAGEMENT_KINDS: EngagementKind[] = [
  "fixed",
  "session",
  "hourly",
  "milestone",
  "free",
];

export type DemandStatus = "draft" | "open" | "closed" | "filled";
export type ProposalStatus = "pending" | "accepted" | "declined" | "withdrawn";

export interface BayPartyProfile {
  user_id: string;
  handle: string | null;
  display_name: string;
  avatar_url: string | null;
  headline?: string;
  rating_avg?: number | null;
  rating_count?: number;
  completed_contracts?: number;
  level?: "new" | "rising" | "pro" | "top";
}

export interface BayDemand {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  engagement_kind: EngagementKind;
  budget_min_fen: number | null;
  budget_max_fen: number | null;
  deadline_at: string | null;
  status: DemandStatus;
  proposal_count: number;
  created_at?: string;
  updated_at?: string;
  currency?: string;
  skills?: string[];
  reference_links?: string[];
  supplemental_notes?: string;
  close_reason?: string | null;
  buyer?: BayPartyProfile;
  unread_proposals?: number;
  posted_site?: string | null;
  handling_site?: string;
  attached_work?: BayWorkRef | null;
}

export interface DemandInviteLink {
  token: string;
  path: string;
  expires_at: string | null;
  created_at: string | null;
  claimed_at: string | null;
  claimed: boolean;
  claimed_by: string | null;
}

export interface BayDemandDetail extends BayDemand {
  is_owner?: boolean;
  my_proposal?: BayProposal | null;
  /** 只有需求 owner 读得到。 */
  invite?: DemandInviteLink | null;
}

export interface BayProposal {
  id: string;
  demand_id: string;
  user_id: string;
  message: string;
  price_fen: number;
  delivery_days: number | null;
  status: ProposalStatus;
  created_at?: string;
  currency?: string;
  seller?: BayPartyProfile;
  demand?: Pick<BayDemand, "id" | "title" | "status" | "category"> & { posted_site?: string | null };
}

export interface DemandInput {
  title: string;
  description?: string;
  category?: string;
  skills?: string[];
  engagement_kind?: EngagementKind;
  budget_min_fen?: number | null;
  budget_max_fen?: number | null;
  deadline_at?: string | null;
  reference_links?: string[];
  supplemental_notes?: string;
  status?: "draft" | "open";
}

/** 发布时的站点与附带作品。客户端只传作品的 kind + id，标题与所在站由服务端补全。 */
export interface DemandPlacement {
  postedSite: string | null;
  attachedWork?: Pick<BayWorkRef, "kind" | "id"> | null;
}

export interface DemandRequestBody extends DemandInput {
  posted_site: string | null;
  attached_work: { kind: "task"; id: string } | null;
  catalog_kind: "delivery";
  regulated_domain: "none";
}

export interface ProposalInput {
  message?: string;
  price_fen: number;
  delivery_days?: number | null;
}

export interface MineDemandPage {
  items: BayDemand[];
  total: number;
  unread_total?: number;
}

export interface MineProposalPage {
  items: BayProposal[];
  next_cursor?: string | null;
}

export const DEMAND_TITLE_MAX_LENGTH = 200;
export const DEMAND_DESCRIPTION_MAX_LENGTH = 20_000;
export const DEMAND_NOTES_MAX_LENGTH = 5_000;
export const PROPOSAL_MESSAGE_MAX_LENGTH = 5_000;

function id(value: string): string {
  return encodeURIComponent(value);
}

function query(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

function cleanList(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  for (const value of values || []) {
    const item = String(value || "").trim();
    if (item) seen.add(item);
  }
  return [...seen];
}

function workRef(work: DemandPlacement["attachedWork"]): { kind: "task"; id: string } | null {
  const workId = String(work?.id || "").trim();
  return work?.kind === "task" && workId ? { kind: "task", id: workId } : null;
}

/** Bay 只发交付型需求（答疑不上架），请求体总带上发布站点与附带作品。 */
export function buildDemandBody(input: DemandInput, placement: DemandPlacement): DemandRequestBody {
  return {
    ...input,
    title: input.title.trim().slice(0, DEMAND_TITLE_MAX_LENGTH),
    description: (input.description || "").trim().slice(0, DEMAND_DESCRIPTION_MAX_LENGTH),
    skills: cleanList(input.skills),
    reference_links: cleanList(input.reference_links),
    supplemental_notes: (input.supplemental_notes || "").trim().slice(0, DEMAND_NOTES_MAX_LENGTH),
    posted_site: String(placement.postedSite || "").trim() || null,
    attached_work: workRef(placement.attachedWork),
    catalog_kind: "delivery",
    regulated_domain: "none",
  };
}

async function bayPut<T>(path: string, body: unknown): Promise<T> {
  const result = await authed<T>(path, { method: "PUT", body: JSON.stringify(body) });
  if (result.ok) return result.data as T;
  const detail = result.detail as { message?: unknown; code?: unknown } | undefined;
  const message =
    typeof detail?.message === "string" && detail.message
      ? detail.message
      : result.error || "请求失败，请稍后再试。";
  throw new BayApiError(message, result.status ?? 0, typeof detail?.code === "string" ? detail.code : null);
}

export function getDemand(demandId: string): Promise<{ demand: BayDemandDetail }> {
  return bayGet<{ demand: BayDemandDetail }>(`/v1/talent/demands/${id(demandId)}`, {
    anonymous: true,
  });
}

export function listMyDemands(
  filters: { status?: DemandStatus | "all"; limit?: number; offset?: number } = {},
): Promise<MineDemandPage> {
  return bayGet<MineDemandPage>(
    `/v1/talent/demands/mine${query({
      status: filters.status === "all" ? undefined : filters.status,
      limit: filters.limit,
      offset: filters.offset,
    })}`,
  );
}

export function createDemand(
  input: DemandInput,
  placement: DemandPlacement,
): Promise<{ demand: BayDemand }> {
  return bayPost<{ demand: BayDemand }>("/v1/talent/demands", buildDemandBody(input, placement));
}

/** 编辑不改发布站点；附带作品可以换或去掉。 */
export function updateDemand(
  demandId: string,
  input: Partial<DemandInput>,
  attachedWork?: DemandPlacement["attachedWork"],
): Promise<{ demand: BayDemand }> {
  const body: Record<string, unknown> = { ...input };
  if (attachedWork !== undefined) body.attached_work = workRef(attachedWork);
  return bayPut<{ demand: BayDemand }>(`/v1/talent/demands/${id(demandId)}`, body);
}

export function closeDemand(demandId: string, reason: string): Promise<{ demand: BayDemand }> {
  return bayPost<{ demand: BayDemand }>(`/v1/talent/demands/${id(demandId)}/close`, {
    reason: reason.trim().slice(0, 500),
  });
}

export function reopenDemand(demandId: string): Promise<{ demand: BayDemand }> {
  return bayPost<{ demand: BayDemand }>(`/v1/talent/demands/${id(demandId)}/reopen`);
}

export function submitProposal(
  demandId: string,
  input: ProposalInput,
): Promise<{ proposal: BayProposal }> {
  return bayPost<{ proposal: BayProposal }>(`/v1/talent/demands/${id(demandId)}/proposals`, {
    price_fen: input.price_fen,
    delivery_days: input.delivery_days ?? null,
    message: (input.message || "").trim().slice(0, PROPOSAL_MESSAGE_MAX_LENGTH),
  });
}

/** 需求 owner 拿到全部报价，其他人只拿到自己那一条。 */
export function listProposals(demandId: string): Promise<{ items: BayProposal[] }> {
  return bayGet<{ items: BayProposal[] }>(`/v1/talent/demands/${id(demandId)}/proposals`);
}

/** 我发出的报价（卖家视角）。 */
export function listMyProposals(
  options: { limit?: number; cursor?: string | null } = {},
): Promise<MineProposalPage> {
  return bayGet<MineProposalPage>(
    `/v1/talent/proposals/mine${query({ limit: options.limit, cursor: options.cursor })}`,
  );
}

export function withdrawProposal(proposalId: string): Promise<{ proposal: BayProposal }> {
  return bayPost<{ proposal: BayProposal }>(`/v1/talent/proposals/${id(proposalId)}/withdraw`);
}

/** 拒绝只改这一条报价的状态，不群发落选通知。 */
export function declineProposal(proposalId: string): Promise<{ proposal: BayProposal }> {
  return bayPost<{ proposal: BayProposal }>(`/v1/talent/proposals/${id(proposalId)}/decline`);
}

/** 接受报价只生成合同草稿，不代表付款或成交。 */
export function acceptProposal(
  proposalId: string,
): Promise<{ contract: { id: string; thread_id?: string | null } }> {
  return bayPost<{ contract: { id: string; thread_id?: string | null } }>(
    `/v1/talent/proposals/${id(proposalId)}/accept`,
  );
}

export function inviteTalent(
  demandId: string,
  handle: string,
): Promise<{ invited: boolean; duplicate?: boolean }> {
  return bayPost<{ invited: boolean; duplicate?: boolean }>(
    `/v1/talent/demands/${id(demandId)}/invite`,
    { handle: handle.trim().replace(/^@/, "") },
  );
}

const CONTACT_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+?\d[\d\s-]{7,}\d)/;

/** 链接里只许有后端签发的不可反推 token，不许出现邮箱或手机号。 */
export function isSafeInviteToken(token: string): boolean {
  if (!token || token.length > 200) return false;
  if (CONTACT_PATTERN.test(token)) return false;
  return /^[A-Za-z0-9._~-]+$/.test(token);
}

/** 需求邀请链接一律落在门户的 Bay 公开页（W10 做页面）。 */
export function bayDemandInvitePath(token: string): string | null {
  return isSafeInviteToken(token) ? `/bay/demands/invite/${encodeURIComponent(token)}` : null;
}

export function createDemandInviteLink(
  demandId: string,
  options: { ttl_days?: number } = {},
): Promise<{ invite: DemandInviteLink | null; demand_id: string }> {
  return bayPost<{ invite: DemandInviteLink | null; demand_id: string }>(
    `/v1/talent/demands/${id(demandId)}/invite-link`,
    { ttl_days: options.ttl_days ?? 14 },
  );
}

export function revokeDemandInviteLink(demandId: string): Promise<{ ok: boolean; revoked: boolean }> {
  return bayDelete<{ ok: boolean; revoked: boolean }>(`/v1/talent/demands/${id(demandId)}/invite-link`);
}

/** 预算换算：用户填的是主单位（元 / 美元）；空串 = 面议（null），脏值 = NaN。 */
export function parseMoneyInput(input: string): number | null {
  const raw = String(input || "").trim();
  if (!raw) return null;
  if (raw.includes("-")) return Number.NaN;
  const value = Number(raw.replace(/[,，\s]/g, ""));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : Number.NaN;
}

export function formatBayFen(fen: number, currency?: string | null): string {
  const value = Number.isFinite(fen) ? Math.max(0, Math.trunc(fen)) : 0;
  const major = value / 100;
  return formatMoney(major, currency || ledgerCurrency(), Number.isInteger(major) ? 0 : 2);
}
