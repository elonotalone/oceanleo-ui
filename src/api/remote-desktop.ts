"use client";

/**
 * 网站 → 自己的电脑「远程桌面」固定接口 v1（合同 REMOTE.md §三方固定接口）。
 *
 * 只走网站现有的用户 Bearer；设备密钥、本机令牌永远不到网页。session_id 只是句柄，
 * 每个请求服务端仍会核账号与设备归属。画面只在内存里转发，这里也不缓存、不落盘。
 *
 * `error` 一律是**码**不是句子（同 `devices.ts`）：句子在渲染处用 `tt` 取。
 */

import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

export type RemoteDesktopSessionState = "connecting" | "active" | "closed";

export interface RemoteDesktopStatus {
  supported: boolean;
  enabled: boolean;
  online: boolean;
  session_id: string | null;
}

export interface RemoteDesktopSession {
  session_id: string;
  state: "connecting";
  expires_at: string;
}

export interface RemoteDesktopFrameData {
  /** JPEG data URL（PNG 仅兼容）。 */
  image: string;
  /** 传输尺寸，不是电脑的物理分辨率。 */
  width: number;
  height: number;
  sequence: number;
}

export interface RemoteDesktopFrame {
  state: RemoteDesktopSessionState;
  frame: RemoteDesktopFrameData | null;
  error?: string;
}

export type RemoteDesktopInputKind =
  | "click"
  | "double_click"
  | "move"
  | "scroll"
  | "type"
  | "keypress"
  | "drag";

export type RemoteDesktopButton = "left" | "right" | "middle";

export interface RemoteDesktopAction {
  kind: RemoteDesktopInputKind;
  x?: number;
  y?: number;
  toX?: number;
  toY?: number;
  deltaX?: number;
  deltaY?: number;
  text?: string;
  key?: string;
  modifiers?: string[];
  button?: RemoteDesktopButton;
}

export interface RemoteDesktopApiResult<T> {
  ok: boolean;
  data?: T;
  /** 码，不是句子。 */
  error?: string;
  status?: number;
}

/** 网站侧的每个请求都可以带 AbortSignal，关闭面板即取消在途请求。 */
export interface RemoteDesktopRequestOptions {
  signal?: AbortSignal;
}

export interface RemoteDesktopClient {
  getStatus(
    deviceId: string,
    options?: RemoteDesktopRequestOptions,
  ): Promise<RemoteDesktopApiResult<RemoteDesktopStatus>>;
  createSession(
    deviceId: string,
    options?: RemoteDesktopRequestOptions,
  ): Promise<RemoteDesktopApiResult<RemoteDesktopSession>>;
  getFrame(
    deviceId: string,
    sessionId: string,
    options?: RemoteDesktopRequestOptions,
  ): Promise<RemoteDesktopApiResult<RemoteDesktopFrame>>;
  sendInput(
    deviceId: string,
    sessionId: string,
    seq: number,
    action: RemoteDesktopAction,
    options?: RemoteDesktopRequestOptions,
  ): Promise<RemoteDesktopApiResult<{ accepted: true; seq: number }>>;
  closeSession(
    deviceId: string,
    sessionId: string,
  ): Promise<RemoteDesktopApiResult<{ closed: true }>>;
}

function errorCode(data: unknown, status: number): string {
  if (typeof data === "string" && data) return data;
  if (!data || typeof data !== "object") return `HTTP ${status}`;
  const body = data as { code?: unknown; error?: unknown; detail?: unknown };
  if (body.detail && typeof body.detail === "object") {
    const detailCode = (body.detail as { code?: unknown }).code;
    if (typeof detailCode === "string" && detailCode) return detailCode;
  }
  if (typeof body.detail === "string" && body.detail) return body.detail;
  if (typeof body.code === "string" && body.code) return body.code;
  if (typeof body.error === "string" && body.error) return body.error;
  return `HTTP ${status}`;
}

async function authed<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<RemoteDesktopApiResult<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "unauthorized", status: 401 };

  let response: Response;
  try {
    response = await fetch(`${GATEWAY_BASE}${path}`, {
      ...init,
      ...(signal ? { signal } : {}),
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
      credentials: "include",
    });
  } catch {
    if (signal?.aborted) return { ok: false, error: "aborted", status: 0 };
    return { ok: false, error: "network_error", status: 0 };
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // 空体或非 JSON：成功时按空处理，失败时落到 HTTP 码。
  }
  if (!response.ok) {
    return { ok: false, error: errorCode(data, response.status), status: response.status };
  }
  return { ok: true, data: data as T, status: response.status };
}

function base(deviceId: string): string {
  return `/v1/devices/${encodeURIComponent(deviceId)}/remote-desktop`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

/** 读不懂的形状宁可当「响应异常」，也不把脏数据喂给 <img>。 */
function parseStatus(data: unknown): RemoteDesktopStatus | null {
  if (!isRecord(data)) return null;
  if (
    typeof data.supported !== "boolean" ||
    typeof data.enabled !== "boolean" ||
    typeof data.online !== "boolean"
  ) {
    return null;
  }
  const sessionId = typeof data.session_id === "string" ? data.session_id : null;
  return {
    supported: data.supported,
    enabled: data.enabled,
    online: data.online,
    session_id: sessionId,
  };
}

const IMAGE_PREFIX = /^data:image\/(jpeg|png);base64,/i;

export function parseFrame(data: unknown): RemoteDesktopFrame | null {
  if (!isRecord(data)) return null;
  const state = data.state;
  if (state !== "connecting" && state !== "active" && state !== "closed") return null;
  const out: RemoteDesktopFrame = { state, frame: null };
  if (typeof data.error === "string" && data.error) out.error = data.error;
  const raw = data.frame;
  if (raw === null || raw === undefined) return out;
  if (!isRecord(raw)) return null;
  const { image, width, height, sequence } = raw;
  if (
    typeof image !== "string" ||
    !IMAGE_PREFIX.test(image) ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    typeof sequence !== "number" ||
    !(width > 0) ||
    !(height > 0) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }
  out.frame = { image, width, height, sequence };
  return out;
}

export const remoteDesktopClient: RemoteDesktopClient = {
  async getStatus(deviceId, options) {
    const result = await authed<unknown>(`${base(deviceId)}/status`, {}, options?.signal);
    if (!result.ok) return { ok: false, error: result.error, status: result.status };
    const status = parseStatus(result.data);
    if (!status) return { ok: false, error: "response_malformed", status: result.status };
    return { ok: true, data: status, status: result.status };
  },

  async createSession(deviceId, options) {
    const result = await authed<unknown>(
      `${base(deviceId)}/sessions`,
      { method: "POST", body: "{}" },
      options?.signal,
    );
    if (!result.ok) return { ok: false, error: result.error, status: result.status };
    const data = result.data;
    if (!isRecord(data) || typeof data.session_id !== "string" || !data.session_id) {
      return { ok: false, error: "response_malformed", status: result.status };
    }
    return {
      ok: true,
      data: {
        session_id: data.session_id,
        state: "connecting",
        expires_at: typeof data.expires_at === "string" ? data.expires_at : "",
      },
      status: result.status,
    };
  },

  async getFrame(deviceId, sessionId, options) {
    const result = await authed<unknown>(
      `${base(deviceId)}/sessions/${encodeURIComponent(sessionId)}/frame`,
      {},
      options?.signal,
    );
    if (!result.ok) return { ok: false, error: result.error, status: result.status };
    const frame = parseFrame(result.data);
    if (!frame) return { ok: false, error: "response_malformed", status: result.status };
    return { ok: true, data: frame, status: result.status };
  },

  async sendInput(deviceId, sessionId, seq, action, options) {
    const result = await authed<{ accepted: true; seq: number }>(
      `${base(deviceId)}/sessions/${encodeURIComponent(sessionId)}/input`,
      { method: "POST", body: JSON.stringify({ seq, action }) },
      options?.signal,
    );
    return result;
  },

  closeSession(deviceId, sessionId) {
    return authed<{ closed: true }>(
      `${base(deviceId)}/sessions/${encodeURIComponent(sessionId)}`,
      { method: "DELETE", keepalive: true },
    );
  },
};
