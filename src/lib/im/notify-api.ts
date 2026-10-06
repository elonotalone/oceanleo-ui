"use client";

// 消息提醒的网关调用（work-chat W03，契约 §4.3）：提醒设置、推送配置、推送订阅。
// W08 的 `imFetch` 落地前先用自己的 fetch；只依赖 `accessToken` / `GATEWAY_BASE` 已提交的导出。

import { accessToken } from "../auth/client";
import { GATEWAY_BASE } from "../auth/config";
import type { ImSettings } from "./types";

export const DEFAULT_IM_SETTINGS: ImSettings = {
  presence_invisible: false,
  email_reminders: true,
  push_enabled: false,
  desktop_notifications: true,
  sound: true,
  show_exact_times_in_replays: false,
};

export interface ImPushConfig {
  enabled: boolean;
  vapid_public_key: string | null;
  portal_origin: string;
}

export interface ImPushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  user_agent?: string;
}

export type NotifyResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string };

async function request<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<NotifyResult<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, status: 401, code: "unauthenticated" };
  const { json, ...rest } = init ?? {};
  try {
    const response = await fetch(`${GATEWAY_BASE}${path}`, {
      credentials: "include",
      cache: "no-store",
      ...rest,
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(json === undefined ? {} : { "Content-Type": "application/json" }),
      },
    });
    if (!response.ok) {
      let code = "error";
      try {
        const body = (await response.json()) as { detail?: { code?: string } };
        if (typeof body?.detail?.code === "string") code = body.detail.code;
      } catch {
        /* 非 JSON 错误体 */
      }
      return { ok: false, status: response.status, code };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, status: 0, code: "network" };
  }
}

// 设置缓存：桌面通知是同步判断，不能每条消息都等一次网络。
const SETTINGS_TTL_MS = 60_000;
let cached: { value: ImSettings; at: number } | null = null;
let inflight: Promise<unknown> | null = null;
const listeners = new Set<(settings: ImSettings) => void>();

function normalizeSettings(raw: Partial<ImSettings> | null | undefined): ImSettings {
  const out: ImSettings = { ...DEFAULT_IM_SETTINGS };
  for (const key of Object.keys(DEFAULT_IM_SETTINGS) as (keyof ImSettings)[]) {
    const value = raw?.[key];
    if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

function remember(value: ImSettings): void {
  cached = { value, at: Date.now() };
  for (const listener of listeners) listener(value);
}

/** 缓存里的设置（可能是旧的）；没取过返回 null。 */
export function cachedImSettings(): ImSettings | null {
  return cached ? cached.value : null;
}

/** 缓存过期或没有时，后台刷新一次；不抛、不等。 */
export function refreshImSettingsInBackground(): void {
  if (cached && Date.now() - cached.at < SETTINGS_TTL_MS) return;
  if (inflight) return;
  inflight = fetchImSettings().finally(() => {
    inflight = null;
  });
}

export function onImSettingsChange(listener: (settings: ImSettings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function fetchImSettings(): Promise<NotifyResult<ImSettings>> {
  const result = await request<Partial<ImSettings>>("/v1/im/settings");
  if (!result.ok) return result;
  const value = normalizeSettings(result.data);
  remember(value);
  return { ok: true, data: value };
}

export async function saveImSettings(patch: Partial<ImSettings>): Promise<NotifyResult<ImSettings>> {
  const result = await request<Partial<ImSettings>>("/v1/im/settings", { method: "PUT", json: patch });
  if (!result.ok) return result;
  const value = normalizeSettings(result.data);
  remember(value);
  return { ok: true, data: value };
}

export function fetchPushConfig(): Promise<NotifyResult<ImPushConfig>> {
  return request<ImPushConfig>("/v1/im/push/config");
}

export function registerPushSubscription(input: ImPushSubscriptionInput): Promise<NotifyResult<{ ok: true }>> {
  return request<{ ok: true }>("/v1/im/push/subscriptions", { method: "POST", json: input });
}

export function removePushSubscription(endpoint: string): Promise<NotifyResult<{ ok: true }>> {
  return request<{ ok: true }>("/v1/im/push/subscriptions", { method: "DELETE", json: { endpoint } });
}

/** 测试用：清缓存。 */
export function resetImSettingsCacheForTests(): void {
  cached = null;
  inflight = null;
  listeners.clear();
}
