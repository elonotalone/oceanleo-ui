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
  /**
   * 那台电脑上报的「已授权目录根」，**只有 `listDevices({ folders: true })` 才有**。
   * 手机上的落点列表只认这份数据：界面上没有手敲路径的口子，因为范围外的路径那台
   * 电脑一定会拒成 `path_outside_grant`，让用户敲就是先请他瞄准再当面拒绝他。
   *
   * 形状故意留成 `unknown`：网关有脏行时（不是列表、少这一栏）判定归读取方，
   * 读不懂就照实说「还没上报」，**绝不能回退成「随便哪个目录都行」**。
   */
  granted_roots?: unknown;
  /** `heartbeat` / `history` / `none`，同上只在 `folders: true` 时出现。 */
  granted_roots_source?: unknown;
}

export interface ListDevicesOptions {
  /**
   * 顺带取回每台电脑已授权的目录根（网关 `GET /v1/devices?folders=true`）。
   * 默认不带：网站设备页 30 秒一次的轮询不该替手机付这份钱。
   */
  folders?: boolean;
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

/**
 * `error` 一律是**码**，从不是句子。
 *
 * 这三种失败原来写的是中文句子（`未登录` / `网络错误：无法连接到设备服务。` /
 * `设备列表响应格式错误`），而三个读取方没有一个把它当句子用：设备页把它喂给
 * `deviceErrorCopy()`（不在协议码表里 ⇒ 收成「这一步没有完成，请稍后重试。」），
 * 本地库那两处 `.catch()` 直接丢掉。也就是说那三句**从来没有一个用户看见过**，
 * 却让这一层看起来像在出文案 —— 日语用户真要是哪天看见了，看见的就是中文。
 *
 * 句子留在渲染处取（`mobile-native-actions.tsx:266` 已经把这条写成规矩）：取数发生在
 * `useEffect` 里、依赖不含 `tt`，译文一旦在取数时定死，用户切了语言这条错误还是旧语言。
 * 码用的是这条链上已有的词汇（`unauthorized` / `network_error`，见 `launcherErrorMessage`
 * 与 `handoffFailureMessage`），网关来的拒绝与客户端自己的失败因此说同一种话。
 */
async function authed<T>(path: string, init?: RequestInit): Promise<DeviceApiResult<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "unauthorized", status: 401 };

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
    return { ok: false, error: "network_error", status: 0 };
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

/**
 * 「我的哪几台电脑」。
 *
 * 手机送达那条链要的是同一份数据外加「每台电脑授权了哪些文件夹」，靠 `folders` 打开 ——
 * 令牌、取数、错误解析因此只有这一份实现。手抄第二份的代价是实测过的：抄的那一份
 * 401 与网络失败分不开、脏行判定各写一遍，两边迟早对不上。
 */
export async function listDevices(
  options: ListDevicesOptions = {},
): Promise<DeviceApiResult<Device[]>> {
  const response = await authed<{ devices: Device[] }>(
    options.folders ? "/v1/devices?folders=true" : "/v1/devices",
  );
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
      error: "response_malformed",
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
