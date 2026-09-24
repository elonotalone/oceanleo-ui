"use client";

import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  meta: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

type NotificationResult<T> = { ok: boolean; data?: T };

async function request<T>(path: string, init?: RequestInit): Promise<NotificationResult<T>> {
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
    if (!response.ok) return { ok: false };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false };
  }
}

export function listNotifications(limit = 20): Promise<NotificationResult<{ items: NotificationItem[]; unread_count: number }>> {
  return request(`/v1/notifications?limit=${limit}`);
}

export function notificationUnreadCount(): Promise<NotificationResult<{ unread_count: number }>> {
  return request("/v1/notifications/unread-count");
}

export function markNotificationsRead(ids?: string[]): Promise<NotificationResult<{ updated: number; unread_count: number }>> {
  return request("/v1/notifications/read", { method: "POST", body: JSON.stringify(ids?.length ? { ids } : {}) });
}
