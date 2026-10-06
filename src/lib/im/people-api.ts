// 联系人、请求、邀请链接、拉黑、资料卡的接口封装（work-chat 契约 §4.1）+ 这块界面共用的纯函数。
// 所有请求都走 W08 的 imFetch（带 token 与网关地址）；后端拒绝时抛 ImApiError，message 是后端给的中文原因。

import { useCallback, useEffect, useRef, useState } from "react";
import { imFetch } from "./client";
import type {
  ImContact,
  ImContactRequest,
  ImGroupInvite,
  ImInviteLink,
  ImInvitePreview,
  ImPresence,
  ImProfile,
} from "./types";

/* ---------- 纯函数（测试直接判这些） ---------- */

const PRESENCE_ORDER: Record<ImPresence, number> = { online: 0, away: 1, offline: 2 };

export function presenceRank(presence: ImPresence | undefined): number {
  return PRESENCE_ORDER[presence ?? "offline"] ?? 2;
}

/** 联系人排序：在线 → 离开 → 离线；同状态按名字；`query` 按名字包含过滤（不分大小写）。 */
export function sortContacts(
  contacts: readonly ImContact[],
  presence: Readonly<Record<string, ImPresence>>,
  query = "",
): ImContact[] {
  const needle = query.trim().toLocaleLowerCase();
  return contacts
    .filter((c) => !needle || c.profile.display_name.toLocaleLowerCase().includes(needle))
    .slice()
    .sort((a, b) => {
      const byPresence = presenceRank(presence[a.user_id]) - presenceRank(presence[b.user_id]);
      if (byPresence !== 0) return byPresence;
      return a.profile.display_name.localeCompare(b.profile.display_name);
    });
}

/**
 * 选人时一个人的状态：
 * direct 可以直接加；consent 要等对方同意；blocked 已拉黑不可选；existing 已经在群里。
 * 联系人 / 同 Team / 同项目 = 直接；其余（同群成员等）= 需要同意（契约 §9.3）。
 */
export type CandidateStatus = "direct" | "consent" | "blocked" | "existing";

export function classifyCandidate(
  profile: Pick<ImProfile, "user_id" | "relation">,
  ctx: { blockedIds?: ReadonlySet<string>; existingIds?: ReadonlySet<string> } = {},
): CandidateStatus {
  if (ctx.existingIds?.has(profile.user_id)) return "existing";
  if (ctx.blockedIds?.has(profile.user_id)) return "blocked";
  const r = profile.relation;
  if (r === "contact" || r === "teammate" || r === "project") return "direct";
  return "consent";
}

/** 邀请链接有效期（小时）。null = 永不过期。 */
export const INVITE_EXPIRY_CHOICES: ReadonlyArray<{ hours: number | null; label: string }> = [
  { hours: 1, label: "1 小时" },
  { hours: 24, label: "1 天" },
  { hours: 168, label: "7 天" },
  { hours: 720, label: "30 天" },
  { hours: null, label: "永不过期" },
];

export const INVITE_USES_CHOICES: ReadonlyArray<{ uses: number | null; label: string }> = [
  { uses: 1, label: "1 次" },
  { uses: 5, label: "5 次" },
  { uses: 20, label: "20 次" },
  { uses: null, label: "不限次数" },
];

/** 邀请落地的三种结果 + 失效，统一成界面要显示的状态。 */
export type InviteOutcome = "joined" | "contact" | "pending" | "gone";

export interface InviteAcceptResult {
  conversation_id?: string | null;
  status: "joined" | "pending" | "contact";
}

export function inviteOutcomeOf(input: { result?: InviteAcceptResult | null; error?: unknown }): InviteOutcome {
  if (input.result) return input.result.status;
  const e = input.error as { status?: number; code?: string } | undefined;
  if (e && (e.code === "gone" || e.status === 410 || e.status === 404)) return "gone";
  // 202 need_consent 不是错误：imFetch 若把它当错误抛出，也按「已申请」处理。
  if (e && (e.code === "need_consent" || e.status === 202)) return "pending";
  return "gone";
}

/** 取后端给的中文原因；没有就给一句通用话。 */
export function reasonOf(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

export function errorCodeOf(error: unknown): string {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" ? code : "";
}

/* ---------- 小工具：加载一次、可重载 ---------- */

export interface Loader<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
  reload: () => void;
}

/** 组件挂载（或 deps 变）时执行 fn，结果存起来；reload() 重新拉。晚到的旧结果会被丢弃。 */
export function useLoader<T>(fn: () => Promise<T>, deps: ReadonlyArray<unknown>): Loader<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: unknown }>({
    data: null,
    loading: true,
    error: null,
  });
  const ticket = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(() => {
    const mine = ++ticket.current;
    setState((s) => ({ ...s, loading: true }));
    fnRef.current().then(
      (data) => {
        if (mine === ticket.current) setState({ data, loading: false, error: null });
      },
      (error) => {
        if (mine === ticket.current) setState((s) => ({ data: s.data, loading: false, error }));
      },
    );
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(run, deps);
  return { ...state, reload: run };
}

/* ---------- 接口 ---------- */

type Items<T> = { items: T[] };

function itemsOf<T>(raw: Items<T> | T[] | null | undefined): T[] {
  if (Array.isArray(raw)) return raw;
  return raw?.items ?? [];
}

export async function getMe(): Promise<ImProfile> {
  const r = await imFetch<{ profile: ImProfile }>("/v1/im/me");
  return r.profile;
}

export async function getProfile(userId: string): Promise<ImProfile | null> {
  const r = await imFetch<Items<ImProfile>>(`/v1/im/profiles?ids=${encodeURIComponent(userId)}`);
  return itemsOf(r)[0] ?? null;
}

export async function getProfiles(ids: readonly string[]): Promise<ImProfile[]> {
  if (!ids.length) return [];
  const r = await imFetch<Items<ImProfile>>(`/v1/im/profiles?ids=${ids.map(encodeURIComponent).join(",")}`);
  return itemsOf(r);
}

export async function searchDirectory(q: string): Promise<ImProfile[]> {
  const r = await imFetch<Items<ImProfile>>(`/v1/im/directory?q=${encodeURIComponent(q.trim())}`);
  return itemsOf(r);
}

export async function listContacts(): Promise<ImContact[]> {
  return itemsOf(await imFetch<Items<ImContact>>("/v1/im/contacts"));
}

export async function removeContact(userId: string): Promise<void> {
  await imFetch(`/v1/im/contacts/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export async function listContactRequests(box: "in" | "out"): Promise<ImContactRequest[]> {
  return itemsOf(await imFetch<Items<ImContactRequest>>(`/v1/im/contact-requests?box=${box}`));
}

export async function sendContactRequest(toUserId: string, message = ""): Promise<void> {
  await imFetch("/v1/im/contact-requests", {
    method: "POST",
    json: { to_user_id: toUserId, ...(message.trim() ? { message: message.trim() } : {}) },
  });
}

export async function respondContactRequest(id: string, action: "accept" | "decline" | "cancel"): Promise<void> {
  await imFetch(`/v1/im/contact-requests/${encodeURIComponent(id)}/${action}`, { method: "POST" });
}

export async function listGroupInvites(): Promise<ImGroupInvite[]> {
  return itemsOf(await imFetch<Items<ImGroupInvite>>("/v1/im/group-invites"));
}

export async function respondGroupInvite(id: string, action: "accept" | "decline"): Promise<{ conversation_id?: string }> {
  const r = await imFetch<{ conversation_id?: string } | undefined>(
    `/v1/im/group-invites/${encodeURIComponent(id)}/${action}`,
    { method: "POST" },
  );
  return r ?? {};
}

export async function createInviteLink(input: {
  kind: "contact" | "group";
  conversation_id?: string | null;
  requires_approval?: boolean;
  max_uses?: number | null;
  expires_in_hours?: number | null;
}): Promise<ImInviteLink> {
  const body: Record<string, unknown> = { kind: input.kind };
  if (input.conversation_id) body.conversation_id = input.conversation_id;
  if (input.requires_approval) body.requires_approval = true;
  if (input.max_uses) body.max_uses = input.max_uses;
  if (input.expires_in_hours) body.expires_in_hours = input.expires_in_hours;
  const r = await imFetch<{ link: ImInviteLink }>("/v1/im/invite-links", { method: "POST", json: body });
  return r.link;
}

export async function listInviteLinks(conversationId?: string | null): Promise<ImInviteLink[]> {
  const q = conversationId ? `?conversation_id=${encodeURIComponent(conversationId)}` : "";
  return itemsOf(await imFetch<Items<ImInviteLink>>(`/v1/im/invite-links${q}`));
}

export async function revokeInviteLink(code: string): Promise<void> {
  await imFetch(`/v1/im/invite-links/${encodeURIComponent(code)}`, { method: "DELETE" });
}

export async function getInvitePreview(code: string): Promise<ImInvitePreview> {
  return imFetch<ImInvitePreview>(`/v1/im/invite-links/${encodeURIComponent(code)}`);
}

export async function acceptInvite(code: string, message = ""): Promise<InviteAcceptResult> {
  const r = await imFetch<InviteAcceptResult>(`/v1/im/invite-links/${encodeURIComponent(code)}/accept`, {
    method: "POST",
    json: message.trim() ? { message: message.trim() } : {},
  });
  return r;
}

export async function listBlocks(): Promise<ImProfile[]> {
  return itemsOf(await imFetch<Items<ImProfile> | ImProfile[]>("/v1/im/blocks"));
}

export async function blockUser(userId: string): Promise<void> {
  await imFetch("/v1/im/blocks", { method: "POST", json: { user_id: userId } });
}

export async function unblockUser(userId: string): Promise<void> {
  await imFetch(`/v1/im/blocks/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export async function openDm(userId: string): Promise<string> {
  // 契约没写返回形状（只写了「取或建私聊」），三种常见写法都认。
  const r = await imFetch<{ conversation?: { id: string }; conversation_id?: string; id?: string }>(
    "/v1/im/conversations/dm",
    { method: "POST", json: { user_id: userId } },
  );
  return r.conversation?.id ?? r.conversation_id ?? r.id ?? "";
}

/** 复制到剪贴板；不支持时返回 false，界面改成「请手动复制」。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
