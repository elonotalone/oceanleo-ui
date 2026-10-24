"use client";

// ============================================================================
// Skills overhaul 2026-10-24 — W09A：文件夹 / 官方技能的网关客户端（合同 §3.2 / §3.4）
// ----------------------------------------------------------------------------
// 所有调用都返回 `{ok:true,data} | {ok:false,error,code?,status}`，从不抛异常。
// `error` 是能直接给人看的一句话：网关已给 `{detail:{code,message}}` 就用它的
// message（网关按 Accept-Language 本地化）；否则按 code / HTTP 状态回退到中文原文，
// 调用方用 `tt(error)` 显示（回退句都登记在 sko-w09a-copy.ts）。
// 下载 / 封面地址一律是网关绝对地址（拼 GATEWAY_BASE）。
// ============================================================================

import { currentDomainProfile } from "../../../contracts/domain-family";
import { accessToken } from "../../../lib/auth/client";
import { GATEWAY_BASE } from "../../../lib/auth/config";
import type {
  FileContent,
  Folder,
  FolderApiResult,
  OfficialSkill,
  OfficialSkillCategory,
  TreeEntry,
} from "./types";

/** 回退文案（中文原文 = i18n key）。网关没给 message 时才用。 */
export const FOLDER_ERROR_FALLBACKS: Record<string, string> = {
  not_found: "找不到这个文件夹或技能",
  forbidden: "你没有权限执行此操作",
  invalid_zip: "压缩包无法读取，请确认是有效的 .zip 或 .skill 文件",
  zip_too_large: "压缩包太大：上限 20 MB，解压后不超过 50 MB、500 个文件",
  unsafe_path: "压缩包里有不安全的路径，已拒绝导入",
  not_a_skill: "没有找到 SKILL.md，这不是一个技能",
  github_unsupported: "只支持公开 GitHub 仓库的地址",
  github_fetch_failed: "从 GitHub 拉取失败，请稍后重试",
  quota_exceeded: "已达到文件夹数量上限",
  rate_limited: "操作太频繁，请稍后再试",
  invalid_skill: "技能格式不正确，请检查 SKILL.md 开头的信息",
  already_exists: "已经添加过了",
  unauthorized: "请先登录",
  network: "网络连接失败，请重试",
  bad_response: "服务器返回的数据无法识别",
  request_failed: "请求失败，请稍后重试",
};

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** 网关相对路径 → 绝对地址；已经是 http(s) 绝对地址就原样返回。 */
export function gatewayAbsoluteUrl(path: string, base: string = GATEWAY_BASE): string {
  const raw = (path || "").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const rel = raw.startsWith("/") ? raw : `/${raw}`;
  return `${trimSlash(base)}${rel}`;
}

const enc = encodeURIComponent;

export function officialSkillDownloadUrl(name: string): string {
  return gatewayAbsoluteUrl(`/v1/skills/official/${enc(name)}/download`);
}

export function officialSkillCoverUrl(name: string): string {
  return gatewayAbsoluteUrl(`/v1/skills/official/${enc(name)}/cover.svg`);
}

/** 门户公开页：`<portalOrigin>/skills/<name>`。 */
export function officialSkillShareUrl(name: string, portalOrigin?: string): string {
  let origin = portalOrigin;
  if (origin == null) {
    try {
      origin = currentDomainProfile().portalOrigin;
    } catch {
      origin = "";
    }
  }
  return `${trimSlash(origin || "")}/skills/${enc(name)}`;
}

export function folderDownloadUrl(id: string): string {
  return gatewayAbsoluteUrl(`/v1/folders/${enc(id)}/download`);
}

// ---------------------------------------------------------------------------
// 错误映射
// ---------------------------------------------------------------------------

function nonEmpty(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/**
 * 把网关错误体映射成 `{error, code}`。`detail` 可能是 `{code,message}`（本波约定）、
 * 字符串，或 FastAPI 校验错误列表。
 */
export function folderApiError(
  status: number,
  body: unknown,
): { ok: false; error: string; code?: string; status: number } {
  let code: string | undefined;
  let message = "";
  const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const detail = rec ? rec.detail : undefined;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>;
    code = nonEmpty(d.code) || undefined;
    message = nonEmpty(d.message);
  } else if (typeof detail === "string") {
    message = detail.trim();
  } else if (Array.isArray(detail)) {
    message = detail
      .map((item) =>
        item && typeof item === "object"
          ? nonEmpty((item as Record<string, unknown>).msg) ||
            nonEmpty((item as Record<string, unknown>).message)
          : nonEmpty(item),
      )
      .filter(Boolean)
      .join("; ");
  }
  if (!code && rec) code = nonEmpty(rec.code) || undefined;
  if (!message && rec) message = nonEmpty(rec.message) || nonEmpty(rec.error);
  if (status === 401) {
    // 网关 401 只会说 "invalid or expired token"——对人没有意义。
    return { ok: false, error: FOLDER_ERROR_FALLBACKS.unauthorized, code: code || "unauthorized", status };
  }
  if (!code && status === 404) code = "not_found";
  if (!code && status === 403) code = "forbidden";
  if (!code && status === 429) code = "rate_limited";
  if (!code && status === 413) code = "zip_too_large";
  const error =
    message ||
    (code && FOLDER_ERROR_FALLBACKS[code]) ||
    FOLDER_ERROR_FALLBACKS.request_failed;
  return code ? { ok: false, error, code, status } : { ok: false, error, status };
}

// ---------------------------------------------------------------------------
// 请求
// ---------------------------------------------------------------------------

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const token = await accessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function uiLanguage(): string {
  if (typeof document !== "undefined") {
    const lang = document.documentElement?.lang?.trim();
    if (lang) return lang;
  }
  if (typeof navigator !== "undefined" && navigator.language) return navigator.language;
  return "zh";
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  json?: unknown;
  form?: FormData;
  auth: "required" | "optional";
}

async function request<T>(path: string, opts: RequestOptions): Promise<FolderApiResult<T>> {
  const headers: Record<string, string> = { "Accept-Language": uiLanguage() };
  const auth = await authHeaders();
  if (opts.auth === "required" && !auth.Authorization) {
    return { ok: false, error: FOLDER_ERROR_FALLBACKS.unauthorized, code: "unauthorized", status: 401 };
  }
  Object.assign(headers, auth);
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form; // 浏览器自己写 multipart boundary，不要手动设 Content-Type
  } else if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  }
  let res: Response;
  try {
    res = await fetch(gatewayAbsoluteUrl(path), {
      method: opts.method ?? "GET",
      headers,
      body,
      credentials: "include",
    });
  } catch {
    return { ok: false, error: FOLDER_ERROR_FALLBACKS.network, code: "network", status: 0 };
  }
  const data: unknown = await res.json().catch(() => undefined);
  if (!res.ok) return folderApiError(res.status, data);
  if (data === undefined) {
    return { ok: false, error: FOLDER_ERROR_FALLBACKS.bad_response, code: "bad_response", status: res.status };
  }
  return { ok: true, data: data as T };
}

function pick<T, K extends keyof T>(
  result: FolderApiResult<T>,
  key: K,
): FolderApiResult<NonNullable<T[K]>> {
  if (!result.ok) return result;
  const value = result.data?.[key];
  if (value == null) {
    return { ok: false, error: FOLDER_ERROR_FALLBACKS.bad_response, code: "bad_response", status: 200 };
  }
  return { ok: true, data: value as NonNullable<T[K]> };
}

function withProject<T extends Record<string, unknown>>(body: T, projectId?: string | null) {
  return projectId ? { ...body, project_id: projectId } : body;
}

// ---------------------------------------------------------------------------
// 公开：官方技能
// ---------------------------------------------------------------------------

export function listOfficialSkills(): Promise<
  FolderApiResult<{ items: OfficialSkill[]; categories: OfficialSkillCategory[] }>
> {
  return request<{ items?: OfficialSkill[]; categories?: OfficialSkillCategory[] }>(
    "/v1/skills/official",
    { auth: "optional" },
  ).then((r) =>
    r.ok
      ? {
          ok: true as const,
          data: {
            items: Array.isArray(r.data.items) ? r.data.items : [],
            categories: Array.isArray(r.data.categories) ? r.data.categories : [],
          },
        }
      : r,
  );
}

export function getOfficialSkill(
  name: string,
): Promise<FolderApiResult<{ skill: OfficialSkill; tree: TreeEntry[] }>> {
  return request<{ skill: OfficialSkill; tree?: TreeEntry[] }>(`/v1/skills/official/${enc(name)}`, {
    auth: "optional",
  }).then((r) => {
    if (!r.ok) return r;
    if (!r.data?.skill) {
      return { ok: false, error: FOLDER_ERROR_FALLBACKS.bad_response, code: "bad_response", status: 200 };
    }
    return { ok: true, data: { skill: r.data.skill, tree: Array.isArray(r.data.tree) ? r.data.tree : [] } };
  });
}

export function getOfficialSkillFile(name: string, path: string): Promise<FolderApiResult<FileContent>> {
  return request<FileContent>(`/v1/skills/official/${enc(name)}/file?path=${enc(path)}`, {
    auth: "optional",
  });
}

// ---------------------------------------------------------------------------
// 登录：文件夹
// ---------------------------------------------------------------------------

export function listFolders(opts: {
  scope: "mine" | "project";
  projectId?: string;
  skillsOnly?: boolean;
}): Promise<FolderApiResult<Folder[]>> {
  const qs = new URLSearchParams({ scope: opts.scope });
  if (opts.projectId) qs.set("project_id", opts.projectId);
  if (opts.skillsOnly != null) qs.set("skills_only", opts.skillsOnly ? "1" : "0");
  return request<{ items?: Folder[] }>(`/v1/folders?${qs.toString()}`, { auth: "required" }).then((r) =>
    r.ok ? { ok: true as const, data: Array.isArray(r.data.items) ? r.data.items : [] } : r,
  );
}

export function getFolder(id: string): Promise<FolderApiResult<{ folder: Folder; tree: TreeEntry[] }>> {
  return request<{ folder: Folder; tree?: TreeEntry[] }>(`/v1/folders/${enc(id)}`, { auth: "required" }).then(
    (r) => {
      if (!r.ok) return r;
      if (!r.data?.folder) {
        return { ok: false, error: FOLDER_ERROR_FALLBACKS.bad_response, code: "bad_response", status: 200 };
      }
      return { ok: true, data: { folder: r.data.folder, tree: Array.isArray(r.data.tree) ? r.data.tree : [] } };
    },
  );
}

export function getFolderFile(id: string, path: string): Promise<FolderApiResult<FileContent>> {
  return request<FileContent>(`/v1/folders/${enc(id)}/file?path=${enc(path)}`, { auth: "required" });
}

export async function addOfficialSkill(name: string, projectId?: string): Promise<FolderApiResult<Folder>> {
  return pick(
    await request<{ folder: Folder }>("/v1/folders/from-official", {
      method: "POST",
      json: withProject({ name }, projectId),
      auth: "required",
    }),
    "folder",
  );
}

export async function importFolderZip(file: Blob, projectId?: string): Promise<FolderApiResult<Folder>> {
  const form = new FormData();
  const fileName = typeof (file as File).name === "string" ? (file as File).name : "upload.zip";
  form.append("file", file, fileName);
  if (projectId) form.append("project_id", projectId);
  return pick(
    await request<{ folder: Folder }>("/v1/folders/import", { method: "POST", form, auth: "required" }),
    "folder",
  );
}

export async function importFolderFromGithub(url: string, projectId?: string): Promise<FolderApiResult<Folder>> {
  return pick(
    await request<{ folder: Folder }>("/v1/folders/import-github", {
      method: "POST",
      json: withProject({ url: url.trim() }, projectId),
      auth: "required",
    }),
    "folder",
  );
}

export async function createSkill(input: {
  name: string;
  title?: string;
  description: string;
  body: string;
  projectId?: string;
}): Promise<FolderApiResult<Folder>> {
  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    description: input.description,
    body: input.body,
  };
  if (input.title && input.title.trim()) payload.title = input.title.trim();
  return pick(
    await request<{ folder: Folder }>("/v1/folders/create-skill", {
      method: "POST",
      json: withProject(payload, input.projectId),
      auth: "required",
    }),
    "folder",
  );
}

export async function copyFolderToProject(id: string, projectId: string): Promise<FolderApiResult<Folder>> {
  return pick(
    await request<{ folder: Folder }>(`/v1/folders/${enc(id)}/copy`, {
      method: "POST",
      json: { project_id: projectId },
      auth: "required",
    }),
    "folder",
  );
}

export async function updateFolder(
  id: string,
  patch: { enabled?: boolean; title?: string },
): Promise<FolderApiResult<Folder>> {
  const body: Record<string, unknown> = {};
  if (patch.enabled !== undefined) body.enabled = patch.enabled;
  if (patch.title !== undefined) body.title = patch.title;
  return pick(
    await request<{ folder: Folder }>(`/v1/folders/${enc(id)}`, { method: "PATCH", json: body, auth: "required" }),
    "folder",
  );
}

export async function deleteFolder(id: string): Promise<FolderApiResult<{ ok: true }>> {
  const r = await request<{ ok?: boolean }>(`/v1/folders/${enc(id)}`, { method: "DELETE", auth: "required" });
  return r.ok ? { ok: true, data: { ok: true } } : r;
}

// ---------------------------------------------------------------------------
// 下载：带登录取 zip → 本地 blob 链接触发保存（文件夹下载要 Bearer，普通 <a> 带不上）
// ---------------------------------------------------------------------------

function filenameFromDisposition(header: string | null): string {
  if (!header) return "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ""));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : "";
}

/** 只接受本网关的地址，防止把 Bearer 发给别处。 */
export function isGatewayUrl(url: string, base: string = GATEWAY_BASE): boolean {
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

export async function downloadFromGateway(url: string, fallbackName = "download.zip"): Promise<FolderApiResult<{ filename: string }>> {
  if (!isGatewayUrl(url)) {
    return { ok: false, error: FOLDER_ERROR_FALLBACKS.request_failed, code: "bad_url", status: 0 };
  }
  const headers: Record<string, string> = { "Accept-Language": uiLanguage(), ...(await authHeaders()) };
  let res: Response;
  try {
    res = await fetch(url, { headers, credentials: "include" });
  } catch {
    return { ok: false, error: FOLDER_ERROR_FALLBACKS.network, code: "network", status: 0 };
  }
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => undefined);
    return folderApiError(res.status, data);
  }
  const blob = await res.blob();
  const filename = filenameFromDisposition(res.headers.get("Content-Disposition")) || fallbackName;
  if (typeof document !== "undefined" && typeof URL.createObjectURL === "function") {
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 30_000);
  }
  return { ok: true, data: { filename } };
}

// ---------------------------------------------------------------------------
// 聚合对象（合同 §3.4 的名字）
// ---------------------------------------------------------------------------

export const folderApi = {
  listOfficialSkills,
  getOfficialSkill,
  getOfficialSkillFile,
  officialSkillDownloadUrl,
  officialSkillCoverUrl,
  officialSkillShareUrl,
  listFolders,
  getFolder,
  getFolderFile,
  folderDownloadUrl,
  addOfficialSkill,
  importFolderZip,
  importFolderFromGithub,
  createSkill,
  copyFolderToProject,
  updateFolder,
  deleteFolder,
  downloadFromGateway,
  gatewayAbsoluteUrl,
} as const;

export type FolderApi = typeof folderApi;
