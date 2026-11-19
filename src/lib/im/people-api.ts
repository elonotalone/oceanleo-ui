// 关注、联系人、群邀请链接、拉黑、资料卡的接口封装与界面共用的纯函数。
// 所有请求都走 W08 的 imFetch（带 token 与网关地址）；后端拒绝时抛 ImApiError，message 是后端给的中文原因。

import { useCallback, useEffect, useRef, useState } from "react";
import { imFetch } from "./client";
import { currentDomainProfile } from "../../contracts/domain-family";
import type {
  ImContact,
  ImConversationSummary,
  ImInviteLink,
  ImInvitePreview,
  ImPage,
  ImPresence,
  ImProfile,
} from "./types";

/* ---------- 纯函数（测试直接判这些） ---------- */

const PRESENCE_ORDER: Record<ImPresence, number> = { online: 0, away: 1, offline: 2 };

export function presenceRank(presence: ImPresence | undefined): number {
  return PRESENCE_ORDER[presence ?? "offline"] ?? 2;
}

/** 联系人排序：在线 → 离开 → 离线；同状态按名字；`query` 按名字或备注包含过滤（不分大小写）。 */
export function sortContacts<T extends Pick<ImContact, "user_id" | "profile">>(
  contacts: readonly T[],
  presence: Readonly<Record<string, ImPresence>>,
  query = "",
): T[] {
  return contacts
    .filter((c) => nameQueryHit(c.profile, query))
    .slice()
    .sort((a, b) => {
      const byPresence = presenceRank(presence[a.user_id]) - presenceRank(presence[b.user_id]);
      if (byPresence !== 0) return byPresence;
      return visiblePersonName(a.profile).localeCompare(visiblePersonName(b.profile), "zh");
    });
}

/** 我对这个人看到的名字：备注优先，其次群昵称（可选），再是对方自己的名字。 */
export function visiblePersonName(
  profile: { display_name: string; remark?: string | null; nickname?: string | null },
  opts?: { showNickname?: boolean },
): string {
  const remark = (profile.remark || "").trim();
  if (remark) return remark;
  if (opts?.showNickname) {
    const nick = (profile.nickname || "").trim();
    if (nick) return nick;
  }
  return profile.display_name;
}

/** 会话标题：我对群/人的备注优先。 */
export function conversationDisplayTitle(item: {
  title: string;
  remark?: string | null;
  peer?: { display_name: string; remark?: string | null } | null;
}): string {
  const remark = (item.remark || "").trim();
  if (remark) return remark;
  if (item.peer) {
    const peerRemark = (item.peer.remark || "").trim();
    if (peerRemark) return peerRemark;
    if (item.peer.display_name) return item.peer.display_name;
  }
  return item.title || "";
}

export function nameQueryHit(
  profile: { display_name: string; remark?: string | null; nickname?: string | null },
  query = "",
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const hay = [profile.display_name, profile.remark, profile.nickname]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .toLocaleLowerCase();
  return hay.includes(needle);
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

/** Share this formatter with the composer so reply limits have one plain explanation. */
export function peopleMessageError(error: unknown, tt: (key: string, vars?: Record<string, string | number>) => string): string {
  const code = errorCodeOf(error);
  if (code === "reply_limit") return tt("对方回复前，每周最多发送 3 条消息。");
  if (code === "people_unavailable" || (error as { status?: number } | null)?.status === 404) return tt("找人功能暂不可用。");
  if (code === "username_taken") return tt("这个用户名已被使用。");
  if (code === "username_invalid") return tt("用户名需为 3–32 位小写字母、数字、下划线或连字符，并以字母或数字开头。");
  return reasonOf(error, tt("没成功，请稍后再试。"));
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
    setState({ data: null, loading: true, error: null });
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
  useEffect(() => { run(); return () => { ++ticket.current; }; }, deps);
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

export async function listContactGroups(): Promise<ImConversationSummary[]> {
  return itemsOf(await imFetch<Items<ImConversationSummary>>("/v1/im/contacts/groups"));
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

export async function setUserRemark(userId: string, remark: string): Promise<{ user_id: string; remark: string }> {
  return imFetch<{ user_id: string; remark: string }>(`/v1/im/remarks/${encodeURIComponent(userId)}`, {
    method: "PUT",
    json: { remark },
  });
}

/** 已勾选「保存到通讯录」的群 / Team 群 / 项目群。 */
export async function listSavedGroups(): Promise<ImConversationSummary[]> {
  const page = await imFetch<ImPage<ImConversationSummary>>("/v1/im/conversations?filter=contacts&limit=100");
  return (page.items ?? []).filter((item) => item.kind !== "dm" && item.kind !== "talent");
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

/* ---------- Public people model (social wave) ---------- */
export interface PersonCard {
  user_id: string;
  username: string | null;
  name: string;
  avatar_url: string | null;
  following: boolean;
  follows_me: boolean;
  blocked: boolean;
}
export interface PeoplePage { people: PersonCard[]; next_cursor: string | null }
export interface FollowSuggestionGroup { key: "team" | "project" | "bay"; title_key: string; people: PersonCard[] }
export interface UsernameState { username: string | null; suggested: string }

export function getUsername(): Promise<UsernameState> { return imFetch("/v1/im/username"); }
export function setUsername(username: string): Promise<{ username: string }> {
  return imFetch("/v1/im/username", { method: "PUT", json: { username } });
}
export function usernameValid(username: string): boolean { return /^[a-z0-9][a-z0-9_-]{2,31}$/.test(username); }
export function usernameAvailability(username: string): Promise<{ available: boolean }> {
  return imFetch(`/v1/im/username/availability?username=${encodeURIComponent(username)}`);
}
export async function searchPeople(query: string): Promise<PersonCard[]> {
  const page = await imFetch<{ people: PersonCard[] }>(`/v1/im/users/search?q=${encodeURIComponent(query.trim())}&limit=20`);
  return page.people;
}
export function listFollows(box: "following" | "followers" = "following", cursor?: string | null): Promise<PeoplePage> {
  return imFetch(`/v1/im/follows?box=${box}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
}
export async function followSuggestions(): Promise<FollowSuggestionGroup[]> {
  const page = await imFetch<{ groups: FollowSuggestionGroup[] }>("/v1/im/follow-suggestions");
  return page.groups;
}
export function followPerson(userId: string): Promise<{ following: true; mutual: boolean }> {
  return imFetch("/v1/im/follows", { method: "POST", json: { user_id: userId } });
}
export function unfollowPerson(userId: string): Promise<{ following: false }> {
  return imFetch(`/v1/im/follows/${encodeURIComponent(userId)}`, { method: "DELETE" });
}
export function listMessageRequests(cursor?: string | null): Promise<ImPage<ImConversationSummary>> {
  return imFetch(`/v1/im/conversations?box=requests&limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
}
export function profileLink(username: string): string {
  return `${currentDomainProfile().portalOrigin}/leochat?find=1&username=${encodeURIComponent(username)}`;
}

/** Profile actions need the actual follow state even when the person is beyond page one. */
export async function findFollowing(userId: string): Promise<PersonCard | null> {
  let cursor: string | null = null;
  const seen = new Set<string>();
  do {
    const page = await listFollows("following", cursor);
    const person = page.people.find(p => p.user_id === userId);
    if (person) return person;
    cursor = page.next_cursor;
    if (cursor && seen.has(cursor)) throw new Error("Repeated following cursor");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return null;
}

export async function listUserRemarks(): Promise<{ user_id: string; remark: string }[]> {
  return itemsOf(await imFetch<Items<{ user_id: string; remark: string }>>("/v1/im/remarks"));
}
