/**
 * 协同相关的网关调用（契约 §4.4）：拿票、按会话授权。
 * 只连 `GATEWAY_BASE`（网关域）；带 Supabase access token。
 */
import { GATEWAY_BASE } from "../../lib/auth/config";
import { accessToken } from "../../lib/auth/client";
import { CollabTicketError, type CollabTicket } from "./provider";
import { normalizeSelf } from "./awareness";
import type { CollabRole } from "./index";

export class CollabApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "CollabApiError";
    this.status = status;
    this.code = code;
  }
}

function gatewayBase(): string {
  return (GATEWAY_BASE || "").replace(/\/+$/, "");
}

/** 网关 http(s) 地址 + 路径 → ws(s) 地址；地址不合格返回 null。 */
export function collabWsUrl(base: string, path: string): string | null {
  const b = (base || "").trim().replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (/^https:\/\//i.test(b)) return `${b.replace(/^https:/i, "wss:")}${p}`;
  if (/^http:\/\//i.test(b)) return `${b.replace(/^http:/i, "ws:")}${p}`;
  return null;
}

export function currentCollabWsUrl(path: string): string {
  const url = collabWsUrl(gatewayBase(), path);
  if (!url) throw new Error("collab gateway address is not configured");
  return url;
}

export async function collabFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const token = await accessToken();
  if (!token) throw new CollabApiError(401, "unauthorized", "请先登录");
  const merged = new Headers(headers);
  merged.set("Authorization", `Bearer ${token}`);
  let body = rest.body;
  if (json !== undefined) {
    merged.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }
  let response: Response;
  try {
    response = await fetch(`${gatewayBase()}${path}`, { ...rest, headers: merged, body });
  } catch {
    throw new CollabApiError(0, "network", "网络不通");
  }
  if (!response.ok) {
    let code = `http_${response.status}`;
    let message = "";
    try {
      const detail = ((await response.json()) as { detail?: unknown })?.detail;
      if (detail && typeof detail === "object") {
        const d = detail as { code?: unknown; message?: unknown };
        if (typeof d.code === "string" && d.code) code = d.code;
        if (typeof d.message === "string") message = d.message;
      } else if (typeof detail === "string") {
        message = detail;
      }
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new CollabApiError(response.status, code, message);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** `POST /v1/collab/tickets`；错误统一成 `CollabTicketError`（provider 据 status 决定重试还是放弃）。 */
export async function fetchCollabTicket(
  resource: { kind: "artifact" | "task"; id: string },
  editorKind: string,
): Promise<CollabTicket> {
  try {
    const raw = await collabFetch<Record<string, unknown>>("/v1/collab/tickets", {
      method: "POST",
      json: { resource, editor_kind: editorKind },
    });
    return {
      ticket: String(raw.ticket ?? ""),
      room_key: String(raw.room_key ?? `${resource.kind}:${resource.id}`),
      role: raw.role === "viewer" ? "viewer" : "editor",
      ws_path: typeof raw.ws_path === "string" && raw.ws_path ? raw.ws_path : "/v1/collab/ws",
      needs_seed: Boolean(raw.needs_seed),
      self: normalizeSelf(raw.self),
    };
  } catch (error) {
    if (error instanceof CollabApiError) throw new CollabTicketError(error.status, error.code, error.message);
    throw error;
  }
}

/** 把作品的同改权限授给一个会话的全部成员（授权当时的成员，之后新加入的不自动获得）。 */
export async function grantCoeditToConversation(
  roomKey: string,
  conversationId: string,
  role: CollabRole = "editor",
): Promise<void> {
  await collabFetch<unknown>(`/v1/collab/rooms/${encodeURIComponent(roomKey)}/grants`, {
    method: "POST",
    json: { conversation_id: conversationId, role },
  });
}
