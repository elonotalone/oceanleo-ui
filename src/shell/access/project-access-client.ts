"use client";

import { accessToken } from "../../lib/auth/client";
import { gatewayBase } from "../../lib/auth/config";
import type { AccessMember, AccessRole } from "./access-types";

export interface ProjectAccess {
  state: "owner" | "member" | "invited" | "none";
  role: "owner" | AccessRole | "none";
  invite_role: AccessRole | null;
  project: { id: string; name: string; icon?: string; tagline?: string };
}

export interface ProjectMembers {
  owner: { name: string; initial: string; email?: string };
  members: AccessMember[];
}

/** Kept injectable so the shared panel and native consumers use the same routes. */
export interface ProjectAccessClient {
  getAccess(id: string, signal?: AbortSignal): Promise<ProjectAccess>;
  getMembers(id: string, signal?: AbortSignal): Promise<ProjectMembers>;
  invite(id: string, email: string, role?: AccessRole): Promise<AccessMember>;
  changeRole(id: string, memberId: string, role: AccessRole): Promise<void>;
  remove(id: string, memberId: string): Promise<void>;
  accept(id: string): Promise<void>;
  decline(id: string): Promise<void>;
}

export class ProjectAccessError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("未能保存更改，请重试。");
    this.name = "ProjectAccessError";
    this.status = status;
  }
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json => value && typeof value === "object" ? value as Json : {};
const text = (value: unknown): string => typeof value === "string" ? value : "";
export const projectUiRole = (role: unknown): AccessRole => role === "edit" || role === "collaborate" ? "collaborate" : "view";

function memberRow(value: unknown, invited = false): AccessMember {
  const raw = record(value);
  const uid = text(raw.user_id) || text(raw.id);
  const name = text(raw.name) || text(raw.display_name) || text(raw.label) || text(raw.handle);
  const email = text(raw.email) || (invited && raw.contact_kind !== "phone" ? text(raw.contact) : "");
  return {
    id: `${invited ? "invite" : "member"}:${invited ? text(raw.id) : uid}`,
    user_id: uid || null,
    name: name || null,
    initial: text(raw.initial) || Array.from(name || email)[0]?.toLocaleUpperCase() || "?",
    ...(email ? { email } : {}),
    role: raw.is_owner === true || raw.role === "owner" ? "owner" : projectUiRole(raw.role),
    status: invited ? "invited" : "accepted",
  };
}

export function projectMembersFromResponse(value: unknown): ProjectMembers {
  const raw = record(value);
  const accepted = Array.isArray(raw.members) ? raw.members.map(value => memberRow(value)) : [];
  const invites = Array.isArray(raw.invites) ? raw.invites.filter(value => {
    const status = text(record(value).status);
    return !status || status === "pending" || status === "invited";
  }).map(value => memberRow(value, true)) : [];
  const owner = accepted.find(member => member.role === "owner");
  return {
    owner: { name: owner?.name || "", initial: owner?.initial || "?", ...(owner?.email ? { email: owner.email } : {}) },
    members: [...accepted.filter(member => member.role !== "owner"), ...invites],
  };
}

export function createProjectAccessClient(options: {
  fetchImpl?: typeof fetch;
  tokenImpl?: () => Promise<string | null>;
  baseUrl?: string;
} = {}): ProjectAccessClient {
  const path = (id: string, suffix: string) => `/v1/projects/${encodeURIComponent(id)}${suffix}`;
  const request = async (route: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<unknown> => {
    const token = await (options.tokenImpl || accessToken)();
    if (!token) throw new ProjectAccessError(401);
    let response: Response;
    try {
      response = await (options.fetchImpl || fetch)(`${options.baseUrl ?? gatewayBase()}${route}`, {
        method, signal, cache: "no-store", credentials: "include",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ProjectAccessError(0);
    }
    if (!response.ok) throw new ProjectAccessError(response.status);
    if (response.status === 204) return {};
    return response.json();
  };
  const memberPath = (id: string, memberId: string) => {
    const invite = memberId.startsWith("invite:");
    const prefix = invite ? "invite:" : "member:";
    const rowId = memberId.startsWith(prefix) ? memberId.slice(prefix.length) : memberId;
    return path(id, `/${invite ? "invites" : "members"}/${encodeURIComponent(rowId)}`);
  };
  return {
    async getAccess(id, signal) {
      const raw = record(await request(path(id, "/access"), "GET", undefined, signal));
      const state = raw.state === "owner" || raw.state === "member" || raw.state === "invited" ? raw.state : "none";
      const project = record(raw.project);
      return {
        state,
        role: state === "owner" ? "owner" : state === "member" ? projectUiRole(raw.role) : "none",
        invite_role: raw.invite_role == null ? null : projectUiRole(raw.invite_role),
        project: { id: text(project.id) || id, name: text(project.name), icon: text(project.icon), tagline: text(project.tagline) },
      };
    },
    async getMembers(id, signal) {
      return projectMembersFromResponse(await request(path(id, "/members"), "GET", undefined, signal));
    },
    async invite(id, email, role = "view") {
      const normalized = email.trim().toLocaleLowerCase();
      const raw = record(await request(path(id, "/invites"), "POST", { contact: normalized, role }));
      if (text(record(raw.invite).id)) return memberRow(raw.invite, true);
      // The new account-independent create response can omit the row id.
      // Recover it from the owner-only list before presenting editable controls.
      const rows = projectMembersFromResponse(await request(path(id, "/members")));
      const invited = rows.members.find(member => member.status === "invited" && member.email?.toLocaleLowerCase() === normalized);
      if (!invited) throw new ProjectAccessError(502);
      return invited;
    },
    async changeRole(id, memberId, role) {
      await request(memberPath(id, memberId), "PATCH", { role });
    },
    async remove(id, memberId) { await request(memberPath(id, memberId), "DELETE"); },
    async accept(id) { await request(path(id, "/join"), "POST", {}); },
    async decline(id) { await request(path(id, "/decline"), "POST", {}); },
  };
}

export const projectAccessClient = createProjectAccessClient();
