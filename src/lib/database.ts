"use client";

// ============================================================================
// @oceanleo/ui — 「我的数据库」统一客户端（单一事实源）
// ----------------------------------------------------------------------------
// 全 OceanLeo 系列共享同一个「我的数据库」：跨站可见，含三类——
//   works     用户在各站产出的全部 AI 作品（image/video/model3d/avatar/audio/
//             logo/ppt/doc …）。底层 user_creations，与 /v1/creations 同表。
//   assets    用户上传 / 收藏进来的输入素材（user_assets）。
//   knowledge 用户写下 / 上传、供各站 AI 生成参考的知识条目（user_knowledge）。
//
// 后端：网关 /v1/database/*（见 oceanleo/backend/app/routers/database_router.py）。
// 旧的「我的图片（image 站私有作品库）」概念被本统一数据库替代。
// ============================================================================

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";

export type MediaType =
  | "image"
  | "video"
  | "model3d"
  | "avatar"
  | "audio"
  | "logo"
  | "ppt"
  | "sheet"
  | "doc"
  | "website"
  | "canvas"
  | "video_canvas"
  | "xhs"
  | "other";

export interface WorkItem {
  id: string;
  url: string;
  thumb_url?: string;
  title?: string;
  kind?: string;
  media_type?: MediaType;
  prompt?: string;
  model?: string;
  ratio?: string;
  site_id?: string;
  meta?: Record<string, unknown>;
  favorite?: boolean;
  created_at?: string;
}

export interface AssetItem {
  id: string;
  url: string;
  thumb_url?: string;
  title?: string;
  media_type?: MediaType;
  mime?: string;
  bytes?: number;
  site_id?: string;
  meta?: Record<string, unknown>;
  created_at?: string;
}

export interface KnowledgeItem {
  id: string;
  title?: string;
  content?: string;
  url?: string;
  kind?: string;
  site_id?: string;
  meta?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface DatabaseOverview {
  works: WorkItem[];
  assets: AssetItem[];
  knowledge: KnowledgeItem[];
  files?: FileItem[];
  counts: { works: number; assets: number; knowledge: number; files?: number };
}

type Result<T> = { ok: boolean; data?: T; error?: string; status?: number };

async function authed<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "未登录", status: 401 };
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "网络错误：无法连接到 AI 网关。", status: 0 };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: (data as { detail?: string } | null)?.detail || `HTTP ${res.status}`,
      status: res.status,
    };
  }
  return { ok: true, data: data as T };
}

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ---------- overview ----------
export function getDatabaseOverview(opts: { mediaType?: MediaType; limit?: number } = {}) {
  return authed<DatabaseOverview>(
    `/v1/database/overview${qs({ media_type: opts.mediaType, limit: opts.limit })}`,
  );
}

// ---------- works (= user_creations) ----------
export function listWorks(
  opts: { siteId?: string; mediaType?: MediaType; limit?: number } = {},
) {
  return authed<{ items: WorkItem[] }>(
    `/v1/database/works${qs({ site_id: opts.siteId, media_type: opts.mediaType, limit: opts.limit })}`,
  );
}

export function deleteWork(id: string) {
  return authed<{ ok: boolean }>(`/v1/database/works/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/**
 * 归档一批刚生成的作品到「我的数据库」。各站生成成功后调用即可（best-effort，
 * 失败不应阻塞出图/出视频）。media_type 决定它在数据库里被归为哪类。
 */
export function saveWorks(
  siteId: string,
  items: Array<{
    url: string;
    media_type?: MediaType;
    thumb_url?: string;
    title?: string;
    kind?: string;
    prompt?: string;
    model?: string;
    ratio?: string;
    meta?: Record<string, unknown>;
  }>,
) {
  return authed<{ ok: boolean; saved: number }>(`/v1/creations`, {
    method: "POST",
    body: JSON.stringify({ site_id: siteId, items }),
  });
}

// ---------- assets (user uploads) ----------
export function listAssets(
  opts: { siteId?: string; mediaType?: MediaType; limit?: number } = {},
) {
  return authed<{ items: AssetItem[] }>(
    `/v1/database/assets${qs({ site_id: opts.siteId, media_type: opts.mediaType, limit: opts.limit })}`,
  );
}

export function saveAssets(
  items: Array<{
    url: string;
    media_type?: MediaType;
    thumb_url?: string;
    title?: string;
    mime?: string;
    bytes?: number;
    site_id?: string;
  }>,
) {
  return authed<{ ok: boolean; saved: number }>(`/v1/database/assets`, {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export function deleteAsset(id: string) {
  return authed<{ ok: boolean }>(`/v1/database/assets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ---------- files (用户上传的文件，文件库) ----------
export interface FileItem {
  id: string;
  url: string;
  thumb_url?: string;
  title?: string;
  media_type?: MediaType;
  mime?: string;
  bytes?: number;
  site_id?: string;
  meta?: Record<string, unknown>;
  created_at?: string;
}

/** 文件库列表。scope="site"（默认当前站）| "all"（跨站全系列）。 */
export function listFiles(
  opts: { siteId?: string; scope?: "site" | "all"; limit?: number } = {},
) {
  return authed<{ items: FileItem[]; scope: string }>(
    `/v1/database/files${qs({ site_id: opts.siteId, scope: opts.scope, limit: opts.limit })}`,
  );
}

/** 上传一个文件到文件库（multipart）。归当前 siteId 分区，跨站可见。 */
export async function uploadFile(
  file: File,
  opts: { siteId?: string; title?: string } = {},
): Promise<Result<{ ok: boolean; file: FileItem }>> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "未登录", status: 401 };
  const fd = new FormData();
  fd.append("file", file);
  if (opts.siteId) fd.append("site_id", opts.siteId);
  if (opts.title) fd.append("title", opts.title);
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}/v1/database/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "网络错误：无法连接到 AI 网关。", status: 0 };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    return {
      ok: false,
      error: (data as { detail?: string } | null)?.detail || `HTTP ${res.status}`,
      status: res.status,
    };
  }
  return { ok: true, data: data as { ok: boolean; file: FileItem } };
}

/** 删除一个上传的文件（底层即 user_assets 删除）。 */
export function deleteFile(id: string) {
  return deleteAsset(id);
}

// ---------- knowledge ----------
export function listKnowledge(opts: { siteId?: string; limit?: number } = {}) {
  return authed<{ items: KnowledgeItem[] }>(
    `/v1/database/knowledge${qs({ site_id: opts.siteId, limit: opts.limit })}`,
  );
}

export function addKnowledge(item: {
  title?: string;
  content?: string;
  url?: string;
  kind?: string;
  site_id?: string;
}) {
  return authed<{ ok: boolean; item: KnowledgeItem }>(`/v1/database/knowledge`, {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export function deleteKnowledge(id: string) {
  return authed<{ ok: boolean }>(
    `/v1/database/knowledge/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}

// ---------- 插件与连接器（MCP 市场目录，公开只读） ----------
export interface McpItem {
  code?: string;
  name?: string;
  vendor?: string;
  score?: number;
  price?: number | string;
  unit?: string;
  currency?: string;
  free?: boolean;
  detail_url?: string;
  description?: string;
}

export async function getMcpCatalog(): Promise<Result<{ items: McpItem[] }>> {
  try {
    const res = await fetch(`${GATEWAY_BASE}/v1/mcp/catalog`);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, status: res.status };
    const data = await res.json();
    return { ok: true, data: data as { items: McpItem[] } };
  } catch {
    return { ok: false, error: "网络错误：无法连接到 AI 网关。", status: 0 };
  }
}

export const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  image: "图片",
  video: "视频",
  model3d: "3D 模型",
  avatar: "数字人",
  audio: "音频",
  logo: "Logo",
  ppt: "演示文稿",
  sheet: "表格",
  doc: "文档",
  website: "网站",
  canvas: "画布",
  video_canvas: "视频工作流",
  xhs: "小红书",
  other: "其他",
};
