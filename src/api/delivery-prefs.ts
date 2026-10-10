"use client";

import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

export type DeliveryPrefs = {
  task_done_inbox: boolean;
  task_done_push: boolean;
  task_done_email: boolean;
};

export type DeliveryPrefsResult<T> = { ok: boolean; data?: T; status?: number };

async function request<T>(path: string, init?: RequestInit): Promise<DeliveryPrefsResult<T>> {
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

export function getDeliveryPrefs(): Promise<DeliveryPrefsResult<{ prefs: DeliveryPrefs }>> {
  return request("/v1/delivery/prefs");
}

export function updateDeliveryPrefs(
  partial: Partial<DeliveryPrefs>,
): Promise<DeliveryPrefsResult<{ prefs: DeliveryPrefs }>> {
  return request("/v1/delivery/prefs", { method: "PUT", body: JSON.stringify(partial) });
}
