"use client";

import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

export type HostedSite = {
  id: string;
  slug: string;
  url: string;
  title: string;
  status: string;
  file_count: number;
  bytes: number;
  published_at: string | null;
  updated_at: string;
};

export type HostedSiteResult<T> = { ok: boolean; data?: T; status?: number };

async function request<T>(path: string, init?: RequestInit): Promise<HostedSiteResult<T>> {
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

export function listHostedSites(): Promise<HostedSiteResult<{ items: HostedSite[] }>> {
  return request("/v1/hosted-sites");
}

export function unpublishHostedSite(id: string): Promise<HostedSiteResult<{ ok: boolean }>> {
  return request(`/v1/hosted-sites/${encodeURIComponent(id)}`, { method: "DELETE" });
}
