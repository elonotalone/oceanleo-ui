"use client";

import { authed, type AgentApiResult } from "./agent";

export type BrowserApprovalScope = "once" | "task" | "site_action";
export type BrowserApprovalDecision = "approve" | "deny";
export type BrowserTrustSettings = { save_logins: boolean };
export type BrowserSavedLogin = {
  id: string;
  origin: string;
  saved_at: string;
  last_used_at: string | null;
};
export type BrowserApprovalGrant = {
  id: string;
  origin: string;
  action_kind: string;
  scope: BrowserApprovalScope;
  task_id: string | null;
  created_at: string;
};
export type BrowserPendingApproval = {
  request_id: string;
  origin: string;
  action_kind: string;
  summary: string;
  reason: string;
};
export type BrowserLoginCandidate = { id: string; origin: string };
export type BrowserSessionTrust = {
  pending_approvals: BrowserPendingApproval[];
  login_candidates: BrowserLoginCandidate[];
  privacy_active: boolean;
};

export type BrowserTrustRequest = <T>(
  path: string,
  init?: RequestInit,
) => Promise<AgentApiResult<T>>;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, limit = 256): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, limit)
    : "";
}

/** Display only the site origin, never a login URL's credentials, query or path. */
export function browserTrustOrigin(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
  } catch {
    return "";
  }
}

function date(value: unknown): string {
  if (typeof value !== "string") return "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function scope(value: unknown): BrowserApprovalScope | null {
  return value === "once" || value === "task" || value === "site_action" ? value : null;
}

function items<T>(value: unknown, project: (row: Record<string, unknown>) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const result: T[] = [];
  for (const item of value) {
    const row = record(item);
    const projected = row && project(row);
    if (!projected) return null;
    result.push(projected);
  }
  return result;
}

function projectLogin(row: Record<string, unknown>): BrowserSavedLogin | null {
  const id = text(row.id);
  const origin = browserTrustOrigin(row.origin);
  const saved_at = date(row.saved_at);
  return id && origin && saved_at ? {
    id, origin, saved_at, last_used_at: date(row.last_used_at) || null,
  } : null;
}

function projectGrant(row: Record<string, unknown>): BrowserApprovalGrant | null {
  const id = text(row.id);
  const origin = browserTrustOrigin(row.origin);
  const action_kind = text(row.action_kind, 80);
  const grantScope = scope(row.scope);
  const created_at = date(row.created_at);
  return id && origin && action_kind && grantScope && created_at ? {
    id, origin, action_kind, scope: grantScope,
    task_id: text(row.task_id) || null, created_at,
  } : null;
}

/** Explicit projection prevents profile bytes, cookies and action arguments entering UI state. */
export function projectBrowserSessionTrust(value: unknown): BrowserSessionTrust | null {
  const row = record(value);
  if (!row || typeof row.privacy_active !== "boolean") return null;
  const pending_approvals = items(row.pending_approvals, (item): BrowserPendingApproval | null => {
    const request_id = text(item.request_id);
    const origin = browserTrustOrigin(item.origin);
    const action_kind = text(item.action_kind, 80);
    return request_id && origin && action_kind ? {
      request_id, origin, action_kind,
      summary: text(item.summary, 400), reason: text(item.reason, 400),
    } : null;
  });
  const login_candidates = items(row.login_candidates, (item): BrowserLoginCandidate | null => {
    const id = text(item.id);
    const origin = browserTrustOrigin(item.origin);
    return id && origin ? { id, origin } : null;
  });
  return pending_approvals && login_candidates ? {
    pending_approvals, login_candidates, privacy_active: row.privacy_active,
  } : null;
}

export function createCloudBrowserTrustClient(request: BrowserTrustRequest = authed) {
  async function call<T>(
    path: string,
    project: (data: unknown) => T | null,
    method = "GET",
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<AgentApiResult<T>> {
    try {
      const timeout = AbortSignal.timeout(15_000);
      const result = await request<unknown>(path, {
        method,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!result.ok) return { ok: false, status: result.status, error: "BROWSER_TRUST_UNAVAILABLE" };
      const data = project(result.data);
      return data === null
        ? { ok: false, status: 502, error: "BROWSER_TRUST_INVALID_RESPONSE" }
        : { ok: true, data };
    } catch {
      return { ok: false, status: 0, error: "BROWSER_TRUST_UNAVAILABLE" };
    }
  }

  const root = "/v1/browser/trust";
  const sessionRoot = (id: string) => `/v1/browser/sessions/${encodeURIComponent(id)}/trust`;
  const settings = (value: unknown): BrowserTrustSettings | null => {
    const row = record(value);
    return typeof row?.save_logins === "boolean" ? { save_logins: row.save_logins } : null;
  };
  // Mutation results deliberately discard the resumed action's result and any secret-bearing fields.
  const acknowledged = (value: unknown) => record(value)?.ok === true ? { ok: true as const } : null;
  return {
    settings: (signal?: AbortSignal) => call(root + "/settings", settings, "GET", undefined, signal),
    updateSettings: (save_logins: boolean, signal?: AbortSignal) =>
      call(root + "/settings", settings, "PATCH", { save_logins }, signal),
    logins: (signal?: AbortSignal) => call(root + "/logins", (value) => {
      const logins = items(record(value)?.logins, projectLogin);
      return logins ? { logins } : null;
    }, "GET", undefined, signal),
    deleteLogin: (id: string, signal?: AbortSignal) =>
      call(`${root}/logins/${encodeURIComponent(id)}`, acknowledged, "DELETE", undefined, signal),
    deleteAllLogins: (signal?: AbortSignal) =>
      call(root + "/logins", acknowledged, "DELETE", undefined, signal),
    approvals: (signal?: AbortSignal) => call(root + "/approvals", (value) => {
      const approvals = items(record(value)?.approvals, projectGrant);
      return approvals ? { approvals } : null;
    }, "GET", undefined, signal),
    revokeApproval: (id: string, signal?: AbortSignal) =>
      call(`${root}/approvals/${encodeURIComponent(id)}`, acknowledged, "DELETE", undefined, signal),
    revokeAllApprovals: (signal?: AbortSignal) =>
      call(root + "/approvals", acknowledged, "DELETE", undefined, signal),
    session: (id: string, signal?: AbortSignal) =>
      call(sessionRoot(id), projectBrowserSessionTrust, "GET", undefined, signal),
    decideLogin: (id: string, candidate_id: string, save: boolean, signal?: AbortSignal) =>
      call(sessionRoot(id) + "/logins", acknowledged, "POST", { candidate_id, save }, signal),
    decideApproval: (
      id: string, requestId: string, decision: BrowserApprovalDecision,
      approvalScope: BrowserApprovalScope, signal?: AbortSignal,
    ) => call(`${sessionRoot(id)}/approvals/${encodeURIComponent(requestId)}`,
      acknowledged, "POST", { decision, scope: approvalScope }, signal),
  };
}

export const cloudBrowserTrustApi = createCloudBrowserTrustClient();
