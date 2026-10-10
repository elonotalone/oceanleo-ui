"use client";

import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

export type ActionGrant = {
  connector_id: string;
  connector_label: string;
  tool: string;
  created_at: string;
};

export type ActionGrantResult<T> = { ok: boolean; data?: T; status?: number };

async function request<T>(path: string, init?: RequestInit): Promise<ActionGrantResult<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, status: 401 };
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
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, data: (await response.json()) as T, status: response.status };
  } catch {
    return { ok: false };
  }
}

export function listActionGrants(): Promise<ActionGrantResult<{ items: ActionGrant[] }>> {
  return request("/v1/agent/approvals/grants");
}

export function revokeActionGrant(
  connectorId: string,
  tool: string,
): Promise<ActionGrantResult<{ ok: boolean }>> {
  const query = `connector_id=${encodeURIComponent(connectorId)}&tool=${encodeURIComponent(tool)}`;
  return request(`/v1/agent/approvals/grants?${query}`, { method: "DELETE" });
}
