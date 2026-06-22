"use client";

// ============================================================================
// @oceanleo/ui — manifest 拉取 + 内存缓存（三级缓存的「运行时」那级）
// ----------------------------------------------------------------------------
// 宗旨 v4 §3.1：
//   1. 构建期预取（各站 SSR 直出 live manifest）—— 各站自己用 fetchManifestServer。
//   2. 运行时拉 + 内存缓存（本文件）—— 主站工作台 / playground / oceanbizs 预览。
//   3. CDN/HTTP 缓存 —— 由网关响应头 + 边缘负责，前端透明。
// ============================================================================

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";
import type { AgentManifest } from "./manifest";

type Channel = "draft" | "live";

const _cache = new Map<string, { at: number; manifest: AgentManifest }>();
const TTL_MS = 60_000; // live manifest 内存缓存 60s（上架后最迟 60s 全网生效）

function cacheKey(agentId: string, channel: Channel): string {
  return `${channel}:${agentId}`;
}

/**
 * 拉取一个 agent 的完整 manifest（运行时，带内存缓存）。
 * - channel=live：公开只读（无 token 也能拉，用于未登录 playground 浏览）。
 * - channel=draft：需登录 + 授权（oceanbizs 员工编辑预览）。
 */
export async function fetchManifest(
  agentId: string,
  channel: Channel = "live",
  opts: { force?: boolean } = {},
): Promise<AgentManifest | null> {
  const key = cacheKey(agentId, channel);
  const hit = _cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < TTL_MS) return hit.manifest;

  const token = await accessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(
      `${GATEWAY_BASE}/v1/agents/${encodeURIComponent(agentId)}/manifest?channel=${channel}`,
      { headers, cache: "no-store" },
    );
  } catch {
    return hit?.manifest ?? null; // 网络挂了回退旧缓存
  }
  if (!res.ok) return hit?.manifest ?? null;
  const data = (await res.json().catch(() => null)) as { manifest?: AgentManifest } | null;
  const manifest = data?.manifest ?? null;
  if (manifest) _cache.set(key, { at: Date.now(), manifest });
  return manifest;
}

/** 保存一份草稿 manifest（oceanbizs 员工编辑器；需授权）。 */
export async function saveDraftManifest(
  agentId: string,
  patch: { prompt?: string; console?: unknown; name?: string; tagline?: string; icon?: string },
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "未登录", status: 401 };
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}/v1/agents/${encodeURIComponent(agentId)}/manifest`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    });
  } catch {
    return { ok: false, error: "网络错误", status: 0 };
  }
  _cache.delete(cacheKey(agentId, "draft"));
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    return { ok: false, error: (d as any)?.detail || `HTTP ${res.status}`, status: res.status };
  }
  return { ok: true };
}

/** 上架：把 draft 复制成 live（操作员动作；后端校验权限）。 */
export async function publishManifest(
  agentId: string,
): Promise<{ ok: boolean; error?: string; status?: number }> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "未登录", status: 401 };
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}/v1/agents/${encodeURIComponent(agentId)}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return { ok: false, error: "网络错误", status: 0 };
  }
  _cache.delete(cacheKey(agentId, "live"));
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    return { ok: false, error: (d as any)?.detail || `HTTP ${res.status}`, status: res.status };
  }
  return { ok: true };
}
