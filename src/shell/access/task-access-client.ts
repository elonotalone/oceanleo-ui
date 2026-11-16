"use client";

import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import type { AccessMember, AccessRole } from "./access-types";

export type GeneralAccess = "public_view" | "restricted" | "private";
export interface TaskAccess {
  role: "owner" | "collaborate" | "view" | "none";
  state: "owner" | "member" | "invited" | "public" | "removed" | "none";
  invite_role?: AccessRole;
  general_access: GeneralAccess;
  can_send: boolean;
  can_manage: boolean;
  can_fork: boolean;
  visible_until?: { message_id: number; frame_id: number; removed_at?: string | null } | null;
  owner: { name: string; initial: string };
  participant_count?: number;
}

export interface TaskAccessClient {
  getAccess(id: string, signal?: AbortSignal): Promise<TaskAccess>;
  setAccess(id: string, value: Exclude<GeneralAccess, "private">): Promise<unknown>;
  members(id: string): Promise<AccessMember[]>;
  invite(id: string, email: string, role: AccessRole): Promise<AccessMember>;
  changeRole(id: string, memberId: string, role: AccessRole): Promise<void>;
  remove(id: string, memberId: string): Promise<void>;
  accept(id: string): Promise<unknown>;
  decline(id: string): Promise<unknown>;
  fork(id: string): Promise<{ task_id: string }>;
  signedIn(): Promise<boolean>;
}

export function isTaskAccess(value: unknown): value is TaskAccess {
  if (!value || typeof value !== "object") return false;
  const item = value as TaskAccess;
  if (item.state === "removed" && (!item.visible_until ||
    !Number.isSafeInteger(item.visible_until.message_id) || item.visible_until.message_id < 0 ||
    !Number.isSafeInteger(item.visible_until.frame_id) || item.visible_until.frame_id < 0)) return false;
  return ["owner", "collaborate", "view", "none"].includes(item.role) &&
    ["owner", "member", "invited", "public", "removed", "none"].includes(item.state) &&
    ["private", "restricted", "public_view"].includes(item.general_access) &&
    typeof item.can_send === "boolean" && typeof item.can_manage === "boolean" && typeof item.can_fork === "boolean" &&
    Boolean(item.owner && typeof item.owner.name === "string" && typeof item.owner.initial === "string");
}

export class TaskAccessError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(status === 401 ? "请先登录，再继续此任务。" : status === 404 ? "无法打开此任务。" : "未能保存更改，请重试。");
    this.name = "TaskAccessError";
    this.status = status;
  }
}

/** The new identity-bound task routes; snapshot /share links stay independent. */
export function createTaskAccessClient(options: {
  fetchImpl?: typeof fetch;
  tokenImpl?: () => Promise<string | null>;
  base?: string;
} = {}): TaskAccessClient {
  const tokenImpl = options.tokenImpl ?? accessToken;
  const request = async <T>(id: string, suffix: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> => {
    const token = await tokenImpl();
    if (method !== "GET" && !token) throw new TaskAccessError(401);
    const response = await (options.fetchImpl ?? fetch)(`${options.base ?? GATEWAY_BASE}/v1/tasks/${encodeURIComponent(id)}${suffix}`, {
      method, signal, cache: "no-store", credentials: "include",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new TaskAccessError(response.status);
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  };
  return {
    getAccess: async (id, signal) => {
      const value = await request<unknown>(id, "/access", "GET", undefined, signal);
      if (!isTaskAccess(value)) throw new TaskAccessError(502);
      return value;
    },
    setAccess: (id, general_access) => request(id, "/access", "PUT", { general_access }),
    members: async (id) => {
      const result = await request<AccessMember[] | { members?: AccessMember[]; items?: AccessMember[] }>(id, "/members");
      return Array.isArray(result) ? result : result.members ?? result.items ?? [];
    },
    invite: async (id, email, role) => {
      const result = await request<AccessMember | { member: AccessMember }>(id, "/members", "POST", { email: email.trim().toLowerCase(), role });
      return "member" in result ? result.member : result;
    },
    changeRole: async (id, memberId, role) => { await request(id, `/members/${encodeURIComponent(memberId)}`, "PATCH", { role }); },
    remove: async (id, memberId) => { await request(id, `/members/${encodeURIComponent(memberId)}`, "DELETE"); },
    accept: (id) => request(id, "/members/accept", "POST"),
    decline: (id) => request(id, "/members/decline", "POST"),
    fork: (id) => request(id, "/fork", "POST"),
    signedIn: async () => Boolean(await tokenImpl()),
  };
}

export const taskAccessClient = createTaskAccessClient();

export function taskAccessRights(access: TaskAccess | null, taskId?: string | null) {
  if (!taskId) return { canSend: true, canManage: true, canView: true };
  return {
    canSend: Boolean(access?.can_send && (access.state === "owner" && access.role === "owner" || access.state === "member" && access.role === "collaborate")),
    canManage: Boolean(access?.can_manage && access.state === "owner" && access.role === "owner"),
    canView: Boolean(access && ["owner", "member", "invited", "public", "removed"].includes(access.state) && access.role !== "none"),
  };
}
