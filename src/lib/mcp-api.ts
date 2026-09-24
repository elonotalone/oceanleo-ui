"use client";

// ============================================================================
// @oceanleo/ui — 个人 MCP 连接器的网关调用（「插件与连接器」页）
// ----------------------------------------------------------------------------
// 目录 `/v1/mcp/registry` 公开只读；连接、列表、断开、启停、探活、一键授权都要登录。
// 凭证只在网关里加密保存，页面永远只拿得到指纹。门户与所有子站只走这一份。
// ============================================================================

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";

export interface McpConnectorMeta {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: string;
  transport: string;
  auth: "token" | "bearer" | "header" | "url" | "url+token" | "none" | "oauth";
  auth_header: string;
  needs_endpoint: boolean;
  endpoint: string;
  help_url: string;
  docs: string;
  /** 固定端点是标准 MCP OAuth 受保护资源 → 显示「一键授权」，不要求贴凭证。 */
  supports_oauth?: boolean;
}

export interface McpConnection {
  id: string;
  connector_id: string;
  label: string;
  endpoint: string | null;
  auth_header: string;
  fingerprint: string;
  tools_count: number;
  enabled: boolean;
  auth_kind?: string; // 'token'|'bearer'|'url'|'url+token'|'oauth'
}

/**
 * 把 FastAPI 的 `{detail}`（字符串或校验错误列表）摊平，页面照原样显示网关给的原因，
 * 而不是 `[object Object]` 或一句笼统的「失败」。
 */
export function mcpGatewayDetail(data: unknown): string {
  if (typeof data === "string") return data.trim();
  if (!data || typeof data !== "object") return "";
  const rec = data as Record<string, unknown>;
  const detail = rec.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const row = item as Record<string, unknown>;
          if (typeof row.msg === "string") return row.msg;
          if (typeof row.message === "string") return row.message;
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join("; ");
  }
  if (typeof rec.error === "string" && rec.error.trim()) return rec.error;
  if (typeof rec.message === "string" && rec.message.trim()) return rec.message;
  return "";
}

/**
 * 一键授权回执的来源：网关回调页 `/v1/mcp/oauth/callback` 所在的 origin，精确到
 * scheme + host + port。解析不出来给空串，调用方必须把空串当「一条都不收」。
 *
 * 回调页只向网关配置里写死的**主站** origin 投递回执，前端不传、也不能传回跳地址
 * （`startMcpOauth` 的请求体只有 connector_id 与 endpoint）。所以子站与 LeoDev 槽位
 * 收不到这条回执，只能在授权期间轮询 `getMcpConnections()` 看结果。
 */
export function mcpOauthMessageOrigin(gatewayBase: string = GATEWAY_BASE): string {
  try {
    return new URL(gatewayBase).origin;
  } catch {
    return "";
  }
}

/**
 * 当前站点的精确 origin。给页面判定「是不是在主站」和测试核对回跳来源用。
 * 通配、缺 scheme、解析失败一律空串——调用方必须把空串当「不要用」。
 */
export function mcpOauthReturnOrigin(siteOrigin?: string): string {
  const raw = (siteOrigin ?? (typeof window !== "undefined" ? window.location.origin : "")).trim();
  if (!raw || raw.includes("*")) return "";
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.hostname.includes("*")) return "";
    return url.origin;
  } catch {
    return "";
  }
}

/** 当前站点不是主站时，一键授权改开主站插件页，本页只轮询连接列表。 */
export function mcpOauthOpensPortalPage(siteOrigin: string, portalOrigin: string): boolean {
  const site = mcpOauthReturnOrigin(siteOrigin);
  const portal = mcpOauthReturnOrigin(portalOrigin);
  return Boolean(site && portal && site !== portal);
}

export function mcpOauthPortalPageHref(portalOrigin: string, connectorId?: string): string {
  const origin = mcpOauthReturnOrigin(portalOrigin);
  if (!origin) return "";
  const id = (connectorId || "").trim();
  return id ? `${origin}/plugins#connect=${encodeURIComponent(id)}` : `${origin}/plugins`;
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await accessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function getMcpRegistry(): Promise<{ items: McpConnectorMeta[]; error?: string }> {
  try {
    const res = await fetch(`${GATEWAY_BASE}/v1/mcp/registry`, { cache: "default", credentials: "include" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { items: [], error: mcpGatewayDetail(data) || `HTTP ${res.status}` };
    }
    const items = Array.isArray(data?.items) ? (data.items as McpConnectorMeta[]) : [];
    return { items };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { items: [], error: message || "连接器目录加载失败" };
  }
}

export async function getMcpConnections(): Promise<McpConnection[]> {
  const headers = await authHeader();
  if (!headers.Authorization) return [];
  const res = await fetch(`${GATEWAY_BASE}/v1/mcp/connections`, { headers, credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return (data?.connections || []) as McpConnection[];
}

export async function connectMcp(input: {
  connector_id: string;
  token?: string;
  endpoint?: string;
  label?: string;
  auth_header?: string;
}): Promise<{ ok: boolean; error?: string; tools_count?: number }> {
  const headers = await authHeader();
  if (!headers.Authorization) return { ok: false, error: "请先登录" };
  const res = await fetch(`${GATEWAY_BASE}/v1/mcp/connect`, {
    credentials: "include",
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: mcpGatewayDetail(data) || `HTTP ${res.status}` };
  return { ok: true, tools_count: data?.tools_count };
}

/**
 * 一键授权：网关发现授权服务器、拼好 PKCE 授权地址返回；调用方在弹窗里打开它。
 * 回跳地址是网关自己的回调（在各家授权服务器登记过的那一条），不由前端决定。
 */
export async function startMcpOauth(input: {
  connector_id: string;
  endpoint?: string;
}): Promise<{ ok: boolean; authorize_url?: string; error?: string }> {
  const headers = await authHeader();
  if (!headers.Authorization) return { ok: false, error: "请先登录" };
  const res = await fetch(`${GATEWAY_BASE}/v1/mcp/oauth/start`, {
    credentials: "include",
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: mcpGatewayDetail(data) || `HTTP ${res.status}` };
  return { ok: true, authorize_url: data?.authorize_url };
}

export async function disconnectMcp(connectorId: string): Promise<{ ok: boolean; error?: string }> {
  const headers = await authHeader();
  if (!headers.Authorization) return { ok: false, error: "请先登录" };
  const res = await fetch(`${GATEWAY_BASE}/v1/mcp/disconnect`, {
    credentials: "include",
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ connector_id: connectorId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: mcpGatewayDetail(data) || `HTTP ${res.status}` };
  return { ok: true };
}

export async function toggleMcp(
  connectorId: string,
  enabled: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const headers = await authHeader();
  if (!headers.Authorization) return { ok: false, error: "请先登录" };
  const res = await fetch(`${GATEWAY_BASE}/v1/mcp/toggle`, {
    credentials: "include",
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ connector_id: connectorId, enabled }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: mcpGatewayDetail(data) || `HTTP ${res.status}` };
  return { ok: true };
}

export async function probeMcp(
  connectorId: string,
): Promise<{ ok: boolean; error?: string; tools_count?: number }> {
  const headers = await authHeader();
  if (!headers.Authorization) return { ok: false, error: "请先登录" };
  const res = await fetch(`${GATEWAY_BASE}/v1/mcp/probe`, {
    credentials: "include",
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ connector_id: connectorId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: mcpGatewayDetail(data) || `HTTP ${res.status}` };
  if (data?.ok === false) {
    return { ok: false, error: mcpGatewayDetail(data) || "探活失败" };
  }
  return { ok: true, tools_count: data?.tools_count };
}
