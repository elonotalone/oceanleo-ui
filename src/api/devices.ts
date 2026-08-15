"use client";

import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

export type DevicePlatform =
  | "windows"
  | "macos"
  | "linux"
  | "android"
  | "ios"
  | "harmony";

/**
 * `shell` is deliberately absent: it is not, and never will be, a grantable
 * category (contract §3). Every `shell.run` is authorised by its own
 * confirmation on the device itself.
 */
export type DeviceGrantKind = "read" | "write" | "python";

export interface Device {
  device_id: string;
  platform: DevicePlatform;
  device_name: string;
  online: boolean;
  local_exec_enabled: boolean;
  granted_kinds: DeviceGrantKind[];
  last_seen_at: string | null;
}

export interface DeviceApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
  /** Quota ceiling named by the server, when it names one. */
  limit?: number;
}

function errorLimit(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;
  const body = data as { limit?: unknown; detail?: unknown };
  const detail = body.detail && typeof body.detail === "object"
    ? (body.detail as { limit?: unknown }).limit
    : undefined;
  // Contract §1.2b puts the ceiling on `detail`; a top-level `limit` is only
  // tolerated so an older or proxied shape still reaches the same sentence.
  for (const candidate of [detail, body.limit]) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
  }
  return undefined;
}

function errorCode(data: unknown, status: number): string {
  if (typeof data === "string" && data) return data;
  if (!data || typeof data !== "object") return `HTTP ${status}`;
  const body = data as {
    code?: unknown;
    error?: unknown;
    detail?: unknown;
  };
  // Contract §1.2b makes `detail` an object; a plain string is the older shape
  // and still has to resolve, or a stale gateway turns every refusal unknown.
  if (body.detail && typeof body.detail === "object") {
    const detailCode = (body.detail as { code?: unknown }).code;
    if (typeof detailCode === "string" && detailCode) return detailCode;
  }
  if (typeof body.detail === "string" && body.detail) return body.detail;
  if (typeof body.code === "string" && body.code) return body.code;
  if (typeof body.error === "string" && body.error) return body.error;
  return `HTTP ${status}`;
}

async function authed<T>(path: string, init?: RequestInit): Promise<DeviceApiResult<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "未登录", status: 401 };

  let response: Response;
  try {
    response = await fetch(`${GATEWAY_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "网络错误：无法连接到设备服务。", status: 0 };
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // Some successful mutation endpoints may return an empty body.
  }
  if (!response.ok) {
    const limit = errorLimit(data);
    return {
      ok: false,
      error: errorCode(data, response.status),
      status: response.status,
      ...(limit === undefined ? {} : { limit }),
    };
  }
  return { ok: true, data: data as T };
}

export async function listDevices(): Promise<DeviceApiResult<Device[]>> {
  const response = await authed<{ devices: Device[] }>("/v1/devices");
  if (!response.ok) {
    return {
      ok: false,
      error: response.error,
      status: response.status,
      ...(response.limit === undefined ? {} : { limit: response.limit }),
    };
  }
  if (!response.data || !Array.isArray(response.data.devices)) {
    return {
      ok: false,
      error: "设备列表响应格式错误",
      status: response.status,
    };
  }
  return {
    ok: true,
    data: response.data.devices,
    status: response.status,
  };
}

export function pairDevice(code: string): Promise<DeviceApiResult<unknown>> {
  return authed<unknown>("/v1/devices/pair", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function renameDevice(
  deviceId: string,
  deviceName: string,
): Promise<DeviceApiResult<unknown>> {
  return authed<unknown>(`/v1/devices/${encodeURIComponent(deviceId)}`, {
    method: "PATCH",
    body: JSON.stringify({ device_name: deviceName }),
  });
}

export function revokeDevice(deviceId: string): Promise<DeviceApiResult<unknown>> {
  return authed<unknown>(`/v1/devices/${encodeURIComponent(deviceId)}/revoke`, {
    method: "POST",
  });
}
