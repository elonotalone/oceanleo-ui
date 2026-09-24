"use client";

// ============================================================================
// @oceanleo/ui — 「个性化」的网关客户端（设置窗「个性化」面板，全站同一份）
// ----------------------------------------------------------------------------
// 两组端点：
//   · `/v1/personalization`：生成对话记忆总开关、自定义指令、Leo 偏好（部分更新）；
//     `/v1/personalization/import-prompt?lang=`：「从其他 AI 导入」那段固定提示词。
//   · `/v1/memories`：记忆 CRUD；`POST /v1/memories/import`：把别的 AI 的回答拆成记忆。
//
// 纪律与 `./org-api.ts` 同口径：
//   1. 失败只给码不给句子，句子由渲染处按当前语言取。
//   2. 「整条路由不在这台网关上」≠「这一条记忆不在了」。个性化端点比记忆 CRUD 晚上线，
//      旧网关对它们回 404；`POST /v1/memories/import` 在旧网关上会撞到
//      `PATCH|DELETE /v1/memories/{id}` 那条路径而回 405。两种都是 `not_available`，
//      面板据此说「还没启用」而不是报错。具体某条记忆的 404 才是 `not_found`。
//   3. 每个字段都归一化，网关回什么形状都不许把面板打白。
// ============================================================================

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";

/** 自定义指令上限，与网关 `profiles.custom_instructions` 的 check 同值（按字符数，不按 UTF-16 码元）。 */
export const CUSTOM_INSTRUCTIONS_MAX_CHARS = 1500;
/** 单条记忆上限，与 `/v1/memories` 的校验同值。 */
export const MEMORY_CONTENT_MAX_CHARS = 500;
/** 导入时一次粘贴的上限，与 `POST /v1/memories/import` 的校验同值。 */
export const MEMORY_IMPORT_MAX_CHARS = 20000;

/**
 * 网关（Postgres `char_length` / Python `len`）数的是 Unicode 字符，
 * `String.length` 数的是 UTF-16 码元：一个表情在前端算 2、在网关算 1。
 * 上限判定一律用这个，否则前端会把网关收得下的内容挡在门外。
 */
export function countChars(text: string): number {
  return Array.from(text).length;
}

export type MemoryKind = "preference" | "fact" | "recipe";

export const MEMORY_KINDS: readonly MemoryKind[] = ["fact", "preference", "recipe"];

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  content: string;
  site_id: string | null;
  enabled: boolean;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
}

export interface PersonalizationPrefs {
  memory_enabled: boolean;
  custom_instructions: string;
  leo_enabled: boolean;
  /** 结构归 Leo 面板定，这里只原样存取。 */
  leo_panel: Record<string, unknown>;
}

export type PersonalizationPatch = Partial<PersonalizationPrefs>;

export interface MemoryImportSkip {
  content: string;
  reason: string;
}

export interface MemoryImportResult {
  imported: number;
  skipped: MemoryImportSkip[];
}

export type PersonalizationApiCode =
  | "signed_out"
  | "not_available"
  | "not_found"
  | "invalid"
  | "offline"
  | "rate_limited"
  | "server_error"
  | "malformed"
  | "unknown";

export type PersonalizationResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: PersonalizationApiCode; status: number };

function codeForStatus(status: number, missingMeans: PersonalizationApiCode): PersonalizationApiCode {
  if (status === 401) return "signed_out";
  if (status === 404 || status === 405 || status === 501) return missingMeans;
  if (status === 400 || status === 413 || status === 422) return "invalid";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "unknown";
}

type RawResult =
  | { ok: true; body: unknown; status: number }
  | { ok: false; error: PersonalizationApiCode; status: number };

async function call(
  path: string,
  init: RequestInit | undefined,
  missingMeans: PersonalizationApiCode,
): Promise<RawResult> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "signed_out", status: 401 };

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
      credentials: "include",
    });
  } catch {
    return { ok: false, error: "offline", status: 0 };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // DELETE 与部分写接口可能回空 body。
  }
  if (!response.ok) {
    return { ok: false, error: codeForStatus(response.status, missingMeans), status: response.status };
  }
  return { ok: true, body, status: response.status };
}

function malformed<T>(status: number): PersonalizationResult<T> {
  return { ok: false, error: "malformed", status };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePrefs(body: unknown): PersonalizationPrefs | null {
  if (!isRecord(body) || typeof body.memory_enabled !== "boolean") return null;
  return {
    memory_enabled: body.memory_enabled,
    custom_instructions: typeof body.custom_instructions === "string" ? body.custom_instructions : "",
    leo_enabled: body.leo_enabled !== false,
    leo_panel: isRecord(body.leo_panel) ? body.leo_panel : {},
  };
}

function isMemoryKind(value: unknown): value is MemoryKind {
  return MEMORY_KINDS.some((kind) => kind === value);
}

function normalizeMemory(row: unknown): MemoryItem | null {
  if (!isRecord(row) || typeof row.id !== "string" || typeof row.content !== "string") return null;
  return {
    id: row.id,
    kind: isMemoryKind(row.kind) ? row.kind : "fact",
    content: row.content,
    site_id: typeof row.site_id === "string" ? row.site_id : null,
    enabled: row.enabled !== false,
    use_count: typeof row.use_count === "number" && Number.isFinite(row.use_count) ? row.use_count : 0,
    last_used_at: typeof row.last_used_at === "string" ? row.last_used_at : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

export async function getPersonalization(): Promise<PersonalizationResult<PersonalizationPrefs>> {
  const raw = await call("/v1/personalization", undefined, "not_available");
  if (!raw.ok) return raw;
  const prefs = normalizePrefs(raw.body);
  return prefs ? { ok: true, data: prefs, status: raw.status } : malformed(raw.status);
}

/**
 * 部分更新。网关回了整份偏好就给整份；只回了确认（空 body 之类）时给 `null`，
 * 由调用方把自己的 `patch` 合进现值 —— 写已经成功了，不能因为回执瘦就报失败。
 */
export async function updatePersonalization(
  patch: PersonalizationPatch,
): Promise<PersonalizationResult<PersonalizationPrefs | null>> {
  const raw = await call(
    "/v1/personalization",
    { method: "PATCH", body: JSON.stringify(patch) },
    "not_available",
  );
  if (!raw.ok) return raw;
  return { ok: true, data: normalizePrefs(raw.body), status: raw.status };
}

export async function getMemoryImportPrompt(lang: string): Promise<PersonalizationResult<string>> {
  const raw = await call(
    `/v1/personalization/import-prompt?lang=${encodeURIComponent(lang)}`,
    undefined,
    "not_available",
  );
  if (!raw.ok) return raw;
  const body = raw.body;
  const prompt =
    typeof body === "string"
      ? body
      : isRecord(body) && typeof body.prompt === "string"
        ? body.prompt
        : isRecord(body) && typeof body.text === "string"
          ? body.text
          : "";
  return prompt.trim() ? { ok: true, data: prompt, status: raw.status } : malformed(raw.status);
}

export async function listMemories(): Promise<PersonalizationResult<MemoryItem[]>> {
  const raw = await call("/v1/memories", undefined, "not_available");
  if (!raw.ok) return raw;
  if (!isRecord(raw.body) || !Array.isArray(raw.body.items)) return malformed(raw.status);
  const items = raw.body.items
    .map(normalizeMemory)
    .filter((item): item is MemoryItem => item !== null);
  return { ok: true, data: items, status: raw.status };
}

export async function addMemory(input: {
  content: string;
  kind?: MemoryKind;
  site_id?: string;
}): Promise<PersonalizationResult<MemoryItem>> {
  const raw = await call(
    "/v1/memories",
    { method: "POST", body: JSON.stringify(input) },
    "not_available",
  );
  if (!raw.ok) return raw;
  const item = normalizeMemory(raw.body);
  return item ? { ok: true, data: item, status: raw.status } : malformed(raw.status);
}

export async function updateMemory(
  id: string,
  patch: { enabled?: boolean; content?: string },
): Promise<PersonalizationResult<MemoryItem>> {
  const raw = await call(
    `/v1/memories/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
    "not_found",
  );
  if (!raw.ok) return raw;
  const item = normalizeMemory(raw.body);
  return item ? { ok: true, data: item, status: raw.status } : malformed(raw.status);
}

export async function deleteMemory(id: string): Promise<PersonalizationResult<null>> {
  const raw = await call(`/v1/memories/${encodeURIComponent(id)}`, { method: "DELETE" }, "not_found");
  if (!raw.ok) return raw;
  return { ok: true, data: null, status: raw.status };
}

export async function importMemories(text: string): Promise<PersonalizationResult<MemoryImportResult>> {
  const raw = await call(
    "/v1/memories/import",
    { method: "POST", body: JSON.stringify({ text }) },
    "not_available",
  );
  if (!raw.ok) return raw;
  const body = raw.body;
  if (!isRecord(body) || typeof body.imported !== "number") return malformed(raw.status);
  const skipped = Array.isArray(body.skipped)
    ? body.skipped
        .filter(isRecord)
        .map((row) => ({
          content: typeof row.content === "string" ? row.content : "",
          reason: typeof row.reason === "string" ? row.reason : "",
        }))
    : [];
  return { ok: true, data: { imported: body.imported, skipped }, status: raw.status };
}
