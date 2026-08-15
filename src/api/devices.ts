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

export type DeviceGrantKind = "read" | "write" | "python" | "shell";

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
}

function errorCode(data: unknown, status: number): string {
  if (typeof data === "string" && data) return data;
  if (!data || typeof data !== "object") return `HTTP ${status}`;
  const body = data as {
    code?: unknown;
    error?: unknown;
    detail?: unknown;
  };
  if (typeof body.detail === "string" && body.detail) return body.detail;
  if (body.detail && typeof body.detail === "object") {
    const detailCode = (body.detail as { code?: unknown }).code;
    if (typeof detailCode === "string" && detailCode) return detailCode;
  }
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
    return {
      ok: false,
      error: errorCode(data, response.status),
      status: response.status,
    };
  }
  return { ok: true, data: data as T };
}

export function listDevices(): Promise<DeviceApiResult<Device[]>> {
  return authed<Device[]>("/v1/devices");
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
