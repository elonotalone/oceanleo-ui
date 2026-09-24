"use client";

// 侧栏「我的设备」小窗的取数与分组。认证方式与
// `lib/oceanleo-ai.ts::notificationRequest` 相同：Supabase access token +
// credentials: "include"。
//
// 云电脑的状态只认 `computer-state`，这里不另写判定。

import { GATEWAY_BASE } from "../../lib/auth/config";
import { accessToken } from "../../lib/auth/client";
import { listDevices } from "../../api/devices";
import type { Computer } from "../../lib/cloud-computer-api";
import {
  computerDisplayState,
  type ComputerDisplayState,
} from "../cloud-computer/computer-state";

export type PairedDevice = {
  device_id?: string;
  device_name: string;
  platform: string;
  online: boolean;
  last_seen_at: string | null;
};

export type DeviceStatusComputer = {
  id: string;
  name: string;
  state: ComputerDisplayState;
};

export type DeviceStatusView = {
  devices: PairedDevice[];
  computers: DeviceStatusComputer[];
  pendingCount: number;
  empty: boolean;
  downloadHref: "/download";
  manageHref: "/devices";
  pendingHref: "/devices?tab=cloud";
};

type GatewayResult<T> = { ok: boolean; data?: T };

async function deviceStatusRequest<T>(path: string): Promise<GatewayResult<T>> {
  const token = await accessToken();
  if (!token) return { ok: false };
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  try {
    const response = await fetch(`${GATEWAY_BASE}${path}`, {
      credentials: "include",
      headers,
      cache: "no-store",
    });
    if (!response.ok) return { ok: false };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false };
  }
}

/** 与 `isPendingComputer` 不同：开通失败（error）不算接入中，作为一行单独列出。 */
const CONNECTING: ReadonlySet<ComputerDisplayState> = new Set([
  "provisioning",
  "pending_install",
  "pending_confirm",
]);

export function buildDeviceStatusView(
  devices: PairedDevice[],
  computers: Computer[],
): DeviceStatusView {
  const listed: DeviceStatusComputer[] = [];
  let pendingCount = 0;
  for (const computer of computers) {
    const state = computerDisplayState(computer);
    if (state === "gone") continue;
    if (CONNECTING.has(state)) pendingCount += 1;
    else listed.push({ id: computer.id, name: computer.name, state });
  }
  return {
    devices,
    computers: listed,
    pendingCount,
    empty: devices.length === 0 && listed.length === 0,
    downloadHref: "/download",
    manageHref: "/devices",
    pendingHref: "/devices?tab=cloud",
  };
}

export async function fetchPairedDevices(): Promise<PairedDevice[]> {
  const result = await listDevices();
  return result.ok && result.data ? result.data : [];
}

export async function fetchStatusComputers(): Promise<Computer[]> {
  const result = await deviceStatusRequest<{ items?: Computer[] }>("/v1/computers");
  if (!result.ok || !result.data) return [];
  return Array.isArray(result.data.items) ? result.data.items : [];
}
