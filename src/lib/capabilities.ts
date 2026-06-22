"use client";

// ============================================================================
// @oceanleo/ui — 能力 SDK（前后端中间层，单一事实源）
// ----------------------------------------------------------------------------
// 宗旨 v4：docs/architecture/oceanleo-agent-manifest-and-portable-console.md §4
//   把 console.json 里的 capability 字符串映射到网关 api.oceanleo.com 的原子接口，
//   统一处理 token、计费、异步轮询、错误。后端接口变了只改这里，几百个 manifest
//   零改动。AgentConsole 渲染器 + manifest 都只认这层抽象。
//
// 同步能力（chat/search）：一次请求拿结果。
// 异步能力（threed/video/music）：提交拿 task_id → 内部轮询 status → 出结果。
// ============================================================================

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";
import type { Capability, ResultRender } from "./manifest";

export interface CapabilityResult {
  ok: boolean;
  /** 文本结果（chat/search/convert 文本产物）。 */
  text?: string;
  /** 媒体结果 url 列表（image-grid / video / audio / 3d）。 */
  urls?: string[];
  error?: string;
  status?: number;
}

/** 该能力的产物默认用什么控件渲染（manifest 没指定时的回退）。 */
export function defaultRenderFor(cap: Capability): ResultRender {
  switch (cap) {
    case "image":
      return "image-grid";
    case "threed":
      return "3d-preview";
    case "video":
      return "video-player";
    case "audio":
    case "tts":
    case "music":
      return "audio-player";
    default:
      return "editable-text";
  }
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  const token = await accessToken();
  if (!token) return { ok: false, status: 401, data: { detail: "请先登录 OceanLeo 账号再使用 AI 功能。" } };
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, data: { detail: "网络错误：无法连接 AI 网关。" } };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function get(path: string): Promise<{ ok: boolean; status: number; data: any }> {
  const token = await accessToken();
  if (!token) return { ok: false, status: 401, data: {} };
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return { ok: false, status: 0, data: {} };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 轮询一个 status 端点直到 done/failed（异步能力共用）。 */
async function pollStatus(
  statusPath: (taskId: string) => string,
  taskId: string,
  pick: (d: any) => { done: boolean; failed?: boolean; urls?: string[]; error?: string },
  { intervalMs = 2500, timeoutMs = 300_000 } = {},
): Promise<CapabilityResult> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(intervalMs);
    const r = await get(statusPath(taskId));
    if (!r.ok) continue;
    const s = pick(r.data);
    if (s.failed) return { ok: false, error: s.error || "生成失败" };
    if (s.done) return { ok: true, urls: s.urls || [] };
  }
  return { ok: false, error: "生成超时，请稍后在历史记录查看。" };
}

/**
 * 统一入口：吃 capability + 已渲染好的输入，返回标准结果。
 * input 约定：
 *   - chat:    { system, user, max_tokens? }
 *   - search:  { query }
 *   - image:   { prompt, ...params }
 *   - threed:  { prompt?, image_url?, ...params }
 *   - video/audio/tts/music: { prompt/text, ...params }
 */
export async function runCapability(
  capability: Capability,
  input: Record<string, unknown>,
  ctx: { siteId: string },
): Promise<CapabilityResult> {
  const siteId = ctx.siteId || "";
  switch (capability) {
    case "chat": {
      const r = await post("/v1/chat", {
        site_id: siteId,
        provider: "bailian",
        key_mode: "platform",
        system: input.system || "",
        messages: [{ role: "user", content: String(input.user || "") }],
        max_tokens: typeof input.max_tokens === "number" ? input.max_tokens : 2000,
      });
      if (!r.ok) return { ok: false, error: r.data?.detail || `HTTP ${r.status}`, status: r.status };
      return { ok: true, text: (r.data?.text || "").trim() };
    }
    case "search": {
      const r = await post("/v1/search", { site_id: siteId, query: input.query || input.user || "" });
      if (!r.ok) return { ok: false, error: r.data?.detail || `HTTP ${r.status}`, status: r.status };
      return { ok: true, text: (r.data?.text || r.data?.answer || "").trim() };
    }
    case "image": {
      const r = await post("/v1/images/generate", {
        site_id: siteId,
        key_mode: "platform",
        prompt: input.prompt || input.user || "",
        ...rest(input, ["prompt", "user"]),
      });
      if (!r.ok) return { ok: false, error: r.data?.detail || `HTTP ${r.status}`, status: r.status };
      return { ok: true, urls: imagesOf(r.data) };
    }
    case "threed": {
      const r = await post("/v1/threed/generate", {
        site_id: siteId,
        prompt: input.prompt || input.user || "",
        image_url: input.image_url || null,
        params: input.params || {},
      });
      if (!r.ok) return { ok: false, error: r.data?.detail || `HTTP ${r.status}`, status: r.status };
      const taskId = r.data?.task_id;
      if (!taskId) return { ok: false, error: "提交失败" };
      return pollStatus(
        (id) => `/v1/threed/status/${encodeURIComponent(id)}`,
        taskId,
        (d) => ({
          done: d?.status === "success" || Boolean(d?.model_url),
          failed: d?.status === "failed",
          urls: [d?.model_url].filter(Boolean),
          error: d?.error,
        }),
      );
    }
    case "video": {
      const r = await post("/v1/videos/generate", {
        site_id: siteId,
        prompt: input.prompt || input.user || "",
        ...rest(input, ["prompt", "user"]),
      });
      if (!r.ok) return { ok: false, error: r.data?.detail || `HTTP ${r.status}`, status: r.status };
      const taskId = r.data?.task_id;
      if (!taskId) return { ok: false, error: "提交失败" };
      return pollStatus(
        (id) => `/v1/videos/status/${encodeURIComponent(id)}`,
        taskId,
        (d) => ({
          done: d?.status === "success" || Boolean(d?.video_url),
          failed: d?.status === "failed",
          urls: [d?.video_url].filter(Boolean),
          error: d?.error,
        }),
      );
    }
    case "tts":
    case "audio": {
      const r = await post(capability === "tts" ? "/v1/tts" : "/v1/audio", {
        site_id: siteId,
        text: input.text || input.user || "",
        ...rest(input, ["text", "user"]),
      });
      if (!r.ok) return { ok: false, error: r.data?.detail || `HTTP ${r.status}`, status: r.status };
      return { ok: true, urls: [r.data?.audio_url || r.data?.url].filter(Boolean) };
    }
    case "music": {
      const r = await post("/v1/music/generate", {
        site_id: siteId,
        prompt: input.prompt || input.user || "",
        ...rest(input, ["prompt", "user"]),
      });
      if (!r.ok) return { ok: false, error: r.data?.detail || `HTTP ${r.status}`, status: r.status };
      const taskId = r.data?.task_id;
      if (!taskId) return { ok: false, error: r.data?.audio_url ? "" : "提交失败", urls: [r.data?.audio_url].filter(Boolean) };
      return pollStatus(
        (id) => `/v1/music/status/${encodeURIComponent(id)}`,
        taskId,
        (d) => ({
          done: d?.status === "success" || Boolean(d?.audio_url),
          failed: d?.status === "failed",
          urls: [d?.audio_url].filter(Boolean),
          error: d?.error,
        }),
      );
    }
    case "convert": {
      const r = await post("/v1/convert", { site_id: siteId, ...input });
      if (!r.ok) return { ok: false, error: r.data?.detail || `HTTP ${r.status}`, status: r.status };
      return { ok: true, text: r.data?.text || "", urls: [r.data?.url].filter(Boolean) };
    }
    default:
      return { ok: false, error: `未知能力：${capability}` };
  }
}

function rest(obj: Record<string, unknown>, omit: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!omit.includes(k) && k !== "system" && v !== "" && v != null) out[k] = v;
  }
  return out;
}

function imagesOf(data: any): string[] {
  if (Array.isArray(data?.images)) return data.images.map((x: any) => (typeof x === "string" ? x : x?.url)).filter(Boolean);
  if (Array.isArray(data?.urls)) return data.urls.filter(Boolean);
  if (data?.image_url) return [data.image_url];
  return [];
}
