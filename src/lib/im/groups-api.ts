// 群组与会话信息的接口封装（work-chat 契约 §4.1）+ 按角色决定「显示哪些按钮」的纯函数（§9.3 / §9.4）。

import { imFetch } from "./client";
import type {
  ImConversationDetail,
  ImJoinRequest,
  ImMember,
  ImNotifyLevel,
  ImRole,
} from "./types";

/* ---------- 角色规则（测试直接判这些） ---------- */

export interface ConversationCaps {
  /** 群组 / Team 群 / 项目群（有「群信息」的会话），私聊为 false */
  isGroupLike: boolean;
  /** 只有手建的群组可以手动拉人、移人、转让、解散、升级；Team 群 / 项目群的成员跟 Team / 项目同步 */
  isManual: boolean;
  canEditSettings: boolean;
  canAddMembers: boolean;
  canApproveJoins: boolean;
  canManageInviteLinks: boolean;
  canDissolve: boolean;
  canUpgradeToTeam: boolean;
  canLeave: boolean;
  /** owner 想退出，必须先转让（只剩自己时除外） */
  leaveNeedsTransfer: boolean;
  canHide: boolean;
  canReport: boolean;
}

type CapInput = Pick<ImConversationDetail, "kind" | "my_role" | "members_can_add" | "dissolved" | "member_count">;

export function conversationCaps(c: CapInput): ConversationCaps {
  const role: ImRole | null = c.my_role;
  const isManager = role === "owner" || role === "admin";
  const isGroupLike = c.kind === "group" || c.kind === "team" || c.kind === "project";
  const isManual = c.kind === "group";
  const live = !c.dissolved && role !== null;
  const lastOne = c.member_count <= 1;
  return {
    isGroupLike,
    isManual,
    canEditSettings: live && isGroupLike && isManager,
    canAddMembers: live && isManual && (isManager || c.members_can_add),
    canApproveJoins: live && isManual && isManager,
    canManageInviteLinks: live && isManual && isManager,
    canDissolve: live && isManual && role === "owner",
    canUpgradeToTeam: live && isManual && role === "owner",
    canLeave: live && isManual && (role !== "owner" || lastOne),
    leaveNeedsTransfer: live && isManual && role === "owner" && !lastOne,
    canHide: live && c.kind === "dm",
    canReport: live && isGroupLike,
  };
}

export interface MemberActions {
  canSetAdmin: boolean;
  canRevokeAdmin: boolean;
  canTransfer: boolean;
  canRemove: boolean;
}

/** 针对列表里的某个成员，我能做什么。自己没有任何操作（退出在别处）。 */
export function memberActionsFor(
  c: Pick<ImConversationDetail, "kind" | "my_role" | "dissolved">,
  target: Pick<ImMember, "user_id" | "role">,
  myUserId: string | null,
): MemberActions {
  const none: MemberActions = { canSetAdmin: false, canRevokeAdmin: false, canTransfer: false, canRemove: false };
  if (c.kind !== "group" || c.dissolved || c.my_role === null) return none;
  if (!myUserId || target.user_id === myUserId || target.role === "owner") return none;
  if (c.my_role === "owner") {
    return {
      canSetAdmin: target.role === "member",
      canRevokeAdmin: target.role === "admin",
      canTransfer: true,
      canRemove: true,
    };
  }
  if (c.my_role === "admin") {
    return { ...none, canRemove: target.role === "member" };
  }
  return none;
}

/** 免打扰时长选项（小时）。null = 取消免打扰。 */
export const MUTE_CHOICES: ReadonlyArray<{ hours: number | null; label: string }> = [
  { hours: null, label: "不免打扰" },
  { hours: 1, label: "1 小时" },
  { hours: 8, label: "8 小时" },
  { hours: 24, label: "24 小时" },
  { hours: 168, label: "7 天" },
];

export const NOTIFY_CHOICES: ReadonlyArray<{ level: ImNotifyLevel; label: string }> = [
  { level: "all", label: "全部消息" },
  { level: "mentions", label: "仅 @我" },
  { level: "none", label: "静音" },
];

export function mutedUntilFromHours(hours: number | null, now = Date.now()): string | null {
  return hours === null ? null : new Date(now + hours * 3_600_000).toISOString();
}

/* ---------- 接口 ---------- */

export interface CreateGroupResult {
  conversation: ImConversationDetail;
  pending_invites: number;
}

export async function createGroup(input: {
  title: string;
  member_ids: string[];
  description?: string;
  avatar_url?: string | null;
  join_approval?: boolean;
}): Promise<CreateGroupResult> {
  return imFetch<CreateGroupResult>("/v1/im/conversations", { method: "POST", json: input });
}

export async function openTeamConversation(orgId: string): Promise<string> {
  const r = await imFetch<{ conversation?: { id: string }; id?: string }>("/v1/im/conversations/team", {
    method: "POST",
    json: { org_id: orgId },
  });
  return r.conversation?.id ?? r.id ?? "";
}

export async function openProjectConversation(projectId: string): Promise<string> {
  const r = await imFetch<{ conversation?: { id: string }; id?: string }>("/v1/im/conversations/project", {
    method: "POST",
    json: { project_id: projectId },
  });
  return r.conversation?.id ?? r.id ?? "";
}

export async function getConversationDetail(id: string): Promise<ImConversationDetail> {
  return imFetch<ImConversationDetail>(`/v1/im/conversations/${encodeURIComponent(id)}`);
}

export async function patchConversation(
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    avatar_url: string | null;
    join_approval: boolean;
    members_can_add: boolean;
    leo_enabled: boolean;
  }>,
): Promise<void> {
  await imFetch(`/v1/im/conversations/${encodeURIComponent(id)}`, { method: "PATCH", json: patch });
}

export interface AddMembersResult {
  added: string[];
  pending: string[];
  refused: Array<{ user_id: string; code: string }>;
}

export async function addMembers(id: string, userIds: string[]): Promise<AddMembersResult> {
  const r = await imFetch<Partial<AddMembersResult>>(`/v1/im/conversations/${encodeURIComponent(id)}/members`, {
    method: "POST",
    json: { user_ids: userIds },
  });
  return { added: r.added ?? [], pending: r.pending ?? [], refused: r.refused ?? [] };
}

export async function removeMember(id: string, userId: string): Promise<void> {
  await imFetch(`/v1/im/conversations/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

export async function setMemberRole(id: string, userId: string, role: ImRole): Promise<void> {
  await imFetch(`/v1/im/conversations/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    json: { role },
  });
}

export async function listJoinRequests(id: string): Promise<ImJoinRequest[]> {
  const r = await imFetch<{ items: ImJoinRequest[] }>(`/v1/im/conversations/${encodeURIComponent(id)}/join-requests`);
  return r.items ?? [];
}

export async function decideJoinRequest(id: string, requestId: string, action: "approve" | "reject"): Promise<void> {
  await imFetch(
    `/v1/im/conversations/${encodeURIComponent(id)}/join-requests/${encodeURIComponent(requestId)}/${action}`,
    { method: "POST" },
  );
}

export async function patchMySettings(
  id: string,
  patch: Partial<{ notify_level: ImNotifyLevel; muted_until: string | null; hidden: boolean }>,
): Promise<void> {
  await imFetch(`/v1/im/conversations/${encodeURIComponent(id)}/me`, { method: "PATCH", json: patch });
}

export async function dissolveConversation(id: string): Promise<void> {
  await imFetch(`/v1/im/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function upgradeToTeam(id: string, teamName: string): Promise<{ org_id: string }> {
  return imFetch<{ org_id: string }>(`/v1/im/conversations/${encodeURIComponent(id)}/upgrade-team`, {
    method: "POST",
    json: { team_name: teamName.trim() },
  });
}
