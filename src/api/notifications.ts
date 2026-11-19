"use client";

import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

export interface NotificationItem {
  id: string;
  section?: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  meta: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export type NotificationResult<T> = { ok: boolean; data?: T; status?: number };

async function request<T>(path: string, init?: RequestInit): Promise<NotificationResult<T>> {
  try {
    const token = await accessToken();
    if (!token) return { ok: false };
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
    if (response.status === 204) return { ok: true };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false };
  }
}

export function listNotifications(limit = 20, section?: string): Promise<NotificationResult<{ items: NotificationItem[]; unread_count: number }>> {
  return request(`/v1/notifications?limit=${limit}${section ? `&section=${encodeURIComponent(section)}` : ""}`);
}

export function notificationUnreadCount(): Promise<NotificationResult<{ unread_count: number }>> {
  return request("/v1/notifications/unread-count");
}

export function markNotificationsRead(ids?: string[], section?: string): Promise<NotificationResult<{ updated: number; unread_count: number }>> {
  return request("/v1/notifications/read", { method: "POST", body: JSON.stringify({ ...(ids?.length ? { ids } : {}), ...(section ? { section } : {}) }) });
}

export interface ComputerNoticeSource {
  computer_id: string;
  machine_name: string;
  source: string;
  enabled: boolean;
  min_level: "normal" | "urgent";
  first_seen_at: string;
  last_seen_at: string;
  sent_count: number;
}

export function listComputerNoticeSources(): Promise<NotificationResult<{ items: ComputerNoticeSource[] }>> {
  return request("/v1/computers/notice-sources");
}

function computerNoticeSourcePath(computerId: string, source: string): string {
  return `/v1/computers/${encodeURIComponent(computerId)}/notice-sources/${encodeURIComponent(source)}`;
}

export function updateComputerNoticeSource(
  computerId: string,
  source: string,
  patch: Partial<Pick<ComputerNoticeSource, "enabled" | "min_level">>,
): Promise<NotificationResult<unknown>> {
  return request(computerNoticeSourcePath(computerId, source), { method: "PATCH", body: JSON.stringify(patch) });
}

export function forgetComputerNoticeSource(computerId: string, source: string): Promise<NotificationResult<unknown>> {
  return request(computerNoticeSourcePath(computerId, source), { method: "DELETE" });
}

export interface NotificationSection {
  key: string;
  title: string;
  builtin: boolean;
  unread: number;
}

export function listNotificationSections(): Promise<NotificationResult<{ sections: NotificationSection[] }>> {
  return request("/v1/notifications/sections");
}

export function officialNotificationPermission(): Promise<NotificationResult<{ can_send: boolean }>> {
  return request("/v1/notifications/official/can-send");
}

export function sendOfficialNotification(value: { title: string; body: string; link?: string }): Promise<NotificationResult<unknown>> {
  return request("/v1/notifications/official", { method: "POST", body: JSON.stringify(value) });
}

export function notificationBadges(): Promise<NotificationResult<{ sections: { chat: number; notices: number } }>> {
  return request("/v1/badges");
}
