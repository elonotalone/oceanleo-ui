"use client";

// 侧栏「我的设备」小窗的取数与列表规则。认证方式与
// `lib/oceanleo-ai.ts::notificationRequest` 相同：Supabase access token +
// credentials: "include"。本文件不改 oceanleo-ai。
//
// 「已接入」按任务书写死的字段，不 import 钉子里还没有的 computer-state。

import { GATEWAY_BASE } from "../../lib/auth/config";
import { accessToken } from "../../lib/auth/client";
import { listDevices } from "../../api/devices";

export type PairedDevice = {
  device_id?: string;
  device_name: string;
  platform: string;
  online: boolean;
  last_seen_at: string | null;
};

export type StatusComputer = {
  id?: string;
  name: string;
  status: string;
  confirmed_at: string | null;
  node_online: boolean;
  charge_status?: string;
};

export type ComputerStatusKind = "unpaid" | "stopped" | "online" | "offline";

export type DeviceStatusView = {
  devices: PairedDevice[];
  computers: { name: string; kind: ComputerStatusKind }[];
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

/** 已接入：confirmed，且 active/running；stopped 与欠费也列出来。未 confirmed / pending / enrolled 不列。 */
export function isListedComputer(computer: StatusComputer): boolean {
  if (!computer.confirmed_at) return false;
  if (computer.charge_status === "unpaid") return true;
  if (computer.status === "stopped") return true;
  return computer.status === "active" || computer.status === "running";
}

export function isPendingComputer(computer: StatusComputer): boolean {
  if (isListedComputer(computer)) return false;
  return (
    !computer.confirmed_at ||
    computer.status === "pending" ||
    computer.status === "enrolled" ||
    computer.status === "provisioning"
  );
}

export function computerStatusKind(computer: StatusComputer): ComputerStatusKind {
  if (computer.charge_status === "unpaid") return "unpaid";
  if (computer.status === "stopped") return "stopped";
  return computer.node_online ? "online" : "offline";
}

export function buildDeviceStatusView(
  devices: PairedDevice[],
  computers: StatusComputer[],
): DeviceStatusView {
  const listed = computers.filter(isListedComputer);
  return {
    devices,
    computers: listed.map((computer) => ({
      name: computer.name,
      kind: computerStatusKind(computer),
    })),
    pendingCount: computers.filter(isPendingComputer).length,
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

export async function fetchStatusComputers(): Promise<StatusComputer[]> {
  const result = await deviceStatusRequest<{ items?: StatusComputer[] }>("/v1/computers");
  if (!result.ok || !result.data) return [];
  return Array.isArray(result.data.items) ? result.data.items : [];
}
