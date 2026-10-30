"use client";

// ============================================================================
// @oceanleo/ui — 用户附件的显示地址（单一事实源，W6 2026-10-31）
// ----------------------------------------------------------------------------
// 输入框上传的文件进私有桶 `project-assets`（`uploadFile(..., {privateUpload:true})`），
// 消息里只带 `{artifact_id, revision_id}`。界面上任何地方（缩略块、气泡、历史）
// 都不能出现 `*.supabase.co` 的原始存储地址：
//   - 缩略块：本地 `blob:` 预览；
//   - 私有引用：向网关要一个短期 rendition 访问地址（网关域名，
//     `/v1/artifact-renditions/access/<token>`，网关做 owner 校验）；
//   - 旧的公开对象（历史消息）：经网关 `/v1/media/proxy` 读，不直接露存储域名。
// 组件（AttachmentStrip / AgentTranscriptBubble / 右侧工作区）只调这里，不自己拼 URL。
// ============================================================================

import { useEffect, useState } from "react";
import type { AgentAttachment } from "./agent";
import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";
import type { FileItem, MediaType } from "./database";

/** 私有上传的单文件上限（网关 `/v1/database/private-upload` 同值）。 */
export const PRIVATE_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
/** 超过上限时给用户的那句话；绝不转去公开桶。 */
export const PRIVATE_ATTACHMENT_TOO_LARGE = "文件超过 20MB，暂不支持";

/** 附件可能带的几种字段（composer 驼峰 / 消息 snake_case 都认）。 */
export interface AttachmentLike {
  url?: string;
  previewUrl?: string;
  mime?: string;
  artifactId?: string;
  revisionId?: string;
  artifact_id?: string;
  revision_id?: string;
}

export interface AttachmentRef {
  artifactId: string;
  revisionId: string;
}

export type AttachmentRenditionPurpose = "thumbnail" | "preview" | "full" | "source";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCESS_PREFIX = "/v1/artifact-renditions/access/";
const MEDIA_PROXY_PATH = "/v1/media/proxy";

/** 是否是原始存储地址（Supabase storage 域名或 `/storage/v1/object/` 路径）。 */
export function isRawStorageUrl(url: string | undefined | null): boolean {
  const value = String(url || "").trim();
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    return (
      host.endsWith(".supabase.co") ||
      host.endsWith(".supabase.in") ||
      parsed.pathname.includes("/storage/v1/object/")
    );
  } catch {
    return false;
  }
}

/** 私有 Library 引用（两项都是 UUID 才算）。 */
export function attachmentRef(att: AttachmentLike | null | undefined): AttachmentRef | null {
  if (!att) return null;
  const artifactId = String(att.artifactId || att.artifact_id || "").trim();
  const revisionId = String(att.revisionId || att.revision_id || "").trim();
  return UUID_RE.test(artifactId) && UUID_RE.test(revisionId)
    ? { artifactId, revisionId }
    : null;
}

function isLocalUrl(url: string): boolean {
  return url.startsWith("blob:") || url.startsWith("data:");
}

/** 旧公开对象经网关同源代理读；不是原始存储地址时原样返回。 */
export function gatewayProxiedUrl(url: string): string {
  if (!isRawStorageUrl(url)) return url;
  return `${GATEWAY_BASE}${MEDIA_PROXY_PATH}?url=${encodeURIComponent(url)}`;
}

/**
 * 同步可得的显示地址：本地 blob/data 预览优先；私有引用不用任何远端 URL
 * （交给 `resolveAttachmentDisplayUrl`）；旧公开对象走网关代理。
 * 返回值永远不是原始存储地址。
 */
export function attachmentDisplayUrl(att: AttachmentLike | null | undefined): string | undefined {
  if (!att) return undefined;
  const candidates = [att.previewUrl, att.url]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const local = candidates.find(isLocalUrl);
  if (local) return local;
  if (attachmentRef(att)) return undefined;
  const remote = candidates.find((value) => /^https?:\/\//i.test(value) || value.startsWith("/v1/"));
  if (!remote) return undefined;
  if (remote.startsWith("/v1/")) return `${GATEWAY_BASE}${remote}`;
  return gatewayProxiedUrl(remote);
}

type CacheEntry = { url: string; expiresAt: number };
const grantCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | undefined>>();

/** 测试用：清掉 rendition 访问地址缓存。 */
export function clearAttachmentUrlCache(): void {
  grantCache.clear();
  inflight.clear();
}

async function issueRenditionUrl(
  ref: AttachmentRef,
  purpose: AttachmentRenditionPurpose,
): Promise<string | undefined> {
  const mode = purpose === "source" ? "source" : "preview";
  const token = await accessToken();
  if (!token) return undefined;
  const res = await fetch(
    `${GATEWAY_BASE}/v1/artifacts/${encodeURIComponent(ref.artifactId)}/revisions/${encodeURIComponent(
      ref.revisionId,
    )}/renditions/${purpose}?mode=${mode}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", credentials: "include" },
  );
  if (!res.ok) return undefined;
  const raw = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return undefined;
  const access = String(raw.accessUrl || raw.access_url || "").trim();
  // Only a gateway-relative opaque grant is accepted; never a storage URL.
  if (!access.startsWith(ACCESS_PREFIX)) return undefined;
  const expires = Date.parse(String(raw.expiresAt || raw.expires_at || ""));
  const url = `${GATEWAY_BASE}${access}`;
  grantCache.set(`${ref.artifactId}:${ref.revisionId}:${purpose}`, {
    url,
    // Refresh 30 s early; an unparsable expiry is treated as a 2-minute grant.
    expiresAt: (Number.isFinite(expires) ? expires : Date.now() + 120_000) - 30_000,
  });
  return url;
}

/**
 * 显示地址（异步）：先用同步可得的；私有引用向网关要一个短期 rendition 地址
 * （带缓存，过期前 30 s 重新要）。要不到时返回 `undefined`，调用方画图标占位。
 */
export async function resolveAttachmentDisplayUrl(
  att: AttachmentLike | null | undefined,
  purpose: AttachmentRenditionPurpose = "thumbnail",
): Promise<string | undefined> {
  const direct = attachmentDisplayUrl(att);
  if (direct) return direct;
  const ref = attachmentRef(att);
  if (!ref) return undefined;
  const key = `${ref.artifactId}:${ref.revisionId}:${purpose}`;
  const cached = grantCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const pending = inflight.get(key);
  if (pending) return pending;
  const request = issueRenditionUrl(ref, purpose)
    .catch(() => undefined)
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

/** React 版：先给同步地址，私有引用解析完成后再更新。 */
export function useAttachmentDisplayUrl(
  att: AttachmentLike | null | undefined,
  purpose: AttachmentRenditionPurpose = "thumbnail",
): string | undefined {
  const direct = attachmentDisplayUrl(att);
  const ref = attachmentRef(att);
  const refKey = ref ? `${ref.artifactId}:${ref.revisionId}` : "";
  const [resolved, setResolved] = useState<{ key: string; url?: string }>({ key: "" });
  useEffect(() => {
    if (direct || !refKey) return;
    let alive = true;
    void resolveAttachmentDisplayUrl(att, purpose).then((url) => {
      if (alive) setResolved({ key: `${refKey}:${purpose}`, url });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the reference, not object identity
  }, [direct, refKey, purpose]);
  if (direct) return direct;
  return resolved.key === `${refKey}:${purpose}` ? resolved.url : undefined;
}

/** mime → 媒体大类（私有上传响应只带 mime）。 */
export function mediaTypeFromMime(mime: string | undefined, name = ""): MediaType | undefined {
  const value = String(mime || "").toLowerCase();
  if (value.startsWith("image/")) return "image";
  if (value.startsWith("video/")) return "video";
  if (value.startsWith("audio/")) return "audio";
  if (value.startsWith("model/")) return "model3d";
  if (value || name) return "doc";
  return undefined;
}

/**
 * 私有上传响应 → 发给 agent 的附件：只带引用，`url` 为空串。
 * 缺 `artifact_id`/`revision_id` 时返回 `null`（调用方按失败处理，绝不降级到公开地址）。
 */
export function agentAttachmentFromPrivateUpload(
  uploaded: FileItem,
  fallback: { name: string; mime?: string },
): AgentAttachment | null {
  const ref = attachmentRef(uploaded);
  if (!ref) return null;
  const mime = uploaded.mime || fallback.mime || undefined;
  const name = uploaded.title || fallback.name;
  return {
    url: "",
    artifact_id: ref.artifactId,
    revision_id: ref.revisionId,
    name,
    ...(mime ? { mime } : {}),
    ...(mediaTypeFromMime(mime, name) ? { media_type: mediaTypeFromMime(mime, name) } : {}),
  };
}
