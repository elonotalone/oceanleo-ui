// OceanLeo Bay 求助客户端（W04）：发求助、收件箱、认领、授权面、撤回、转合同。
// 形状照 talent 站 lib/talent/handoffs.ts；Bay 额外记下发布站点（posted_site）与附带作品（attached_work）。
// 授权语义不变：context 是白名单，没勾的内容对方认领之后也读不到；撤回立即生效。

import {
  HANDOFF_BRIEF_MAX_LENGTH,
  HANDOFF_ORIGIN_REF_MAX_LENGTH,
  normalizeHandoffContext,
  type Handoff,
  type HandoffContextGrant,
  type HandoffContextItem,
  type HandoffMode,
  type HandoffOriginKind,
  type TalentPage,
} from "../../api/talent-handoff";
import { bayGet, bayPost } from "./http";
import type { BayWorkRef } from "./types";

export type { Handoff, HandoffContextGrant, HandoffContextItem, HandoffMode, HandoffOriginKind };

/** Bay 里看到的一条求助：在 talent 求助上多了站点、作品与去处理的站。 */
export interface BayHandoff extends Handoff {
  posted_site?: string | null;
  handling_site?: string;
  attached_work?: BayWorkRef | null;
  context_message_count?: number;
  context_artifact_count?: number;
  regulated_domain?: string;
}

export interface BayHandoffInput {
  originKind: HandoffOriginKind;
  /** 会话 / 任务 id；手动发起（没有会话）时为空串。 */
  originRef: string;
  category: string;
  brief: string;
  budgetFen: number;
  mode: HandoffMode;
  invitedHandle?: string | null;
  context?: Partial<HandoffContextGrant>;
  postedSite: string | null;
  attachedWork?: Pick<BayWorkRef, "kind" | "id"> | null;
}

export interface BayHandoffBody {
  origin_kind: HandoffOriginKind;
  origin_ref: string;
  category: string;
  brief: string;
  budget_fen: number;
  mode: HandoffMode;
  invited_handle: string | null;
  context: HandoffContextGrant;
  posted_site: string | null;
  attached_work: { kind: "task"; id: string } | null;
}

const BASE = "/v1/talent/handoffs";

function id(value: string): string {
  return encodeURIComponent(value);
}

function page(options: { limit?: number; cursor?: string | null } = {}): string {
  const params = new URLSearchParams();
  if (options.limit && Number.isSafeInteger(options.limit) && options.limit > 0) {
    params.set("limit", String(options.limit));
  }
  if (options.cursor) params.set("cursor", options.cursor);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

/** 请求体总带上发布站点与附带作品（客户端只传作品的 kind + id）。 */
export function buildHandoffBody(input: BayHandoffInput): BayHandoffBody {
  const workId = String(input.attachedWork?.id || "").trim();
  return {
    origin_kind: input.originKind,
    origin_ref: String(input.originRef || "").slice(0, HANDOFF_ORIGIN_REF_MAX_LENGTH),
    category: String(input.category || "").trim(),
    brief: String(input.brief || "").trim().slice(0, HANDOFF_BRIEF_MAX_LENGTH),
    budget_fen: Number.isSafeInteger(input.budgetFen) && input.budgetFen > 0 ? input.budgetFen : 0,
    mode: input.mode,
    invited_handle:
      input.mode === "invited" ? String(input.invitedHandle || "").trim().replace(/^@/, "") || null : null,
    context: normalizeHandoffContext(input.context),
    posted_site: String(input.postedSite || "").trim() || null,
    attached_work: input.attachedWork?.kind === "task" && workId ? { kind: "task", id: workId } : null,
  };
}

export function createBayHandoff(input: BayHandoffInput): Promise<{ handoff: BayHandoff }> {
  return bayPost<{ handoff: BayHandoff }>(BASE, buildHandoffBody(input));
}

/** 我发出的求助。 */
export function listMyBayHandoffs(
  options: { limit?: number; cursor?: string | null } = {},
): Promise<TalentPage<BayHandoff>> {
  return bayGet<TalentPage<BayHandoff>>(`${BASE}/mine${page(options)}`);
}

/** 收件箱：公开池 + 定向邀请我的。 */
export function listBayHandoffInbox(
  options: { limit?: number; cursor?: string | null } = {},
): Promise<TalentPage<BayHandoff>> {
  return bayGet<TalentPage<BayHandoff>>(`${BASE}/inbox${page(options)}`);
}

export function getBayHandoff(handoffId: string): Promise<{ handoff: BayHandoff }> {
  return bayGet<{ handoff: BayHandoff }>(`${BASE}/${id(handoffId)}`);
}

/** 只有发起人与已认领者拿得到；没被勾选的内容根本不在返回里。 */
export function getBayHandoffContext(handoffId: string): Promise<{ items: HandoffContextItem[] }> {
  return bayGet<{ items: HandoffContextItem[] }>(`${BASE}/${id(handoffId)}/context`);
}

export function claimBayHandoff(handoffId: string): Promise<{ handoff: BayHandoff; thread_id: string }> {
  return bayPost<{ handoff: BayHandoff; thread_id: string }>(`${BASE}/${id(handoffId)}/claim`);
}

export function cancelBayHandoff(handoffId: string): Promise<{ handoff: BayHandoff }> {
  return bayPost<{ handoff: BayHandoff }>(`${BASE}/${id(handoffId)}/cancel`);
}

export function revokeBayHandoffContext(
  handoffId: string,
  grant: Partial<HandoffContextGrant>,
): Promise<{ revoked: number }> {
  const normalized = normalizeHandoffContext(grant);
  return bayPost<{ revoked: number }>(`${BASE}/${id(handoffId)}/revoke-context`, {
    message_ids: normalized.messages,
    artifact_ids: normalized.artifacts,
  });
}

export function createBayHandoffContract(
  handoffId: string,
  input: { title: string; description: string; engagement_kind: string; total_fen: number },
): Promise<{ contract_id: string }> {
  return bayPost<{ contract_id: string }>(`${BASE}/${id(handoffId)}/contract`, input);
}

/** 还在进行中的求助（等人接 / 已接住 / 已成合同）。 */
export function handoffIsLive(handoff: Pick<Handoff, "state">): boolean {
  return (
    handoff.state === "draft" ||
    handoff.state === "open" ||
    handoff.state === "claimed" ||
    handoff.state === "contracted"
  );
}

/** 收件箱两个分区：定向邀请我的在前，公开池在后。 */
export function splitInbox<T extends Pick<Handoff, "mode">>(items: T[]): { invited: T[]; open: T[] } {
  return {
    invited: items.filter((item) => item.mode === "invited"),
    open: items.filter((item) => item.mode !== "invited"),
  };
}

export type ClaimFailure = "taken" | "gone" | "not_invited" | "other";

/** 认领失败按状态码分成几种人话；文案在界面层用 tt() 出。 */
export function claimFailureKind(status: number | undefined): ClaimFailure {
  if (status === 409) return "taken";
  if (status === 404) return "gone";
  if (status === 403) return "not_invited";
  return "other";
}
