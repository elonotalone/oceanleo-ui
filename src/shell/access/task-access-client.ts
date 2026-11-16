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
  visible_until?: number | string | null;
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

export class TaskAccessError extends Error {
  constructor(readonly status: number) {
    super(status === 401 ? "请先登录，再继续此任务。" : status === 404 ? "无法打开此任务。" : "未能保存更改，请重试。");
    this.name = "TaskAccessError";
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
    getAccess: (id, signal) => request(id, "/access", "GET", undefined, signal),
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
    canSend: Boolean(access?.can_send && (access.state === "owner" || access.state === "member" && access.role === "collaborate")),
    canManage: Boolean(access?.can_manage && access.state === "owner" && access.role === "owner"),
    canView: Boolean(access && access.state !== "none"),
  };
}
