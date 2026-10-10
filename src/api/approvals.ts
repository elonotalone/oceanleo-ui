"use client";

import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

export type ApprovalScope = "once" | "task" | "always";

export type ApprovalDecision = "approve" | "deny";

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "used";

export interface ApprovalRecord {
  id: string;
  task_id: string;
  connector_id: string;
  connector_label: string;
  tool: string;
  summary: string;
  args_preview: string;
  status: ApprovalStatus | string;
  scope: ApprovalScope | string | null;
  created_at: string;
  decided_at: string | null;
}

export interface ApprovalCardPayload {
  approval_id: string;
  connector_id: string;
  connector_label: string;
  tool: string;
  summary: string;
  args_preview: string;
}

export type ApprovalResult<T> = { ok: boolean; data?: T; status?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseApprovalMessage(content: string): ApprovalCardPayload | null {
  if (typeof content !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (typeof parsed.approval_id !== "string" || parsed.approval_id.trim() === "") {
    return null;
  }
  for (const key of ["connector_id", "connector_label", "tool", "summary"] as const) {
    if (typeof parsed[key] !== "string") return null;
  }
  if (parsed.args_preview !== undefined && typeof parsed.args_preview !== "string") {
    return null;
  }
  return {
    approval_id: parsed.approval_id,
    connector_id: parsed.connector_id as string,
    connector_label: parsed.connector_label as string,
    tool: parsed.tool as string,
    summary: parsed.summary as string,
    args_preview: typeof parsed.args_preview === "string" ? parsed.args_preview : "",
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<ApprovalResult<T>> {
  const token = await accessToken();
  if (!token) return { ok: false };
  try {
    const response = await fetch(`${GATEWAY_BASE}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      cache: "no-store",
    });
    const status = response.status;
    if (!response.ok) return { ok: false, status };
    return { ok: true, data: (await response.json()) as T, status };
  } catch {
    return { ok: false };
  }
}

function unwrapApproval(
  result: ApprovalResult<{ approval?: ApprovalRecord }>,
): ApprovalResult<ApprovalRecord> {
  if (!result.ok) return { ok: false, status: result.status };
  const approval = result.data?.approval;
  if (!approval || typeof approval.id !== "string") {
    return { ok: false, status: result.status };
  }
  return { ok: true, data: approval, status: result.status };
}

export function getApproval(id: string): Promise<ApprovalResult<ApprovalRecord>> {
  return request<{ approval?: ApprovalRecord }>(
    `/v1/agent/approvals/${encodeURIComponent(id)}`,
  ).then(unwrapApproval);
}

export function decideApproval(
  id: string,
  decision: ApprovalDecision,
  scope?: ApprovalScope,
): Promise<ApprovalResult<ApprovalRecord>> {
  const body: { decision: ApprovalDecision; scope?: ApprovalScope } = { decision };
  if (scope) body.scope = scope;
  return request<{ approval?: ApprovalRecord }>(
    `/v1/agent/approvals/${encodeURIComponent(id)}/decide`,
    { method: "POST", body: JSON.stringify(body) },
  ).then(unwrapApproval);
}

export async function listPendingApprovals(
  taskId: string,
): Promise<ApprovalResult<ApprovalRecord[]>> {
  const result = await request<{ items?: ApprovalRecord[] }>(
    `/v1/agent/approvals?task_id=${encodeURIComponent(taskId)}&status=pending`,
  );
  if (!result.ok) return { ok: false, status: result.status };
  const items = Array.isArray(result.data?.items) ? result.data.items : [];
  return { ok: true, data: items, status: result.status };
}
