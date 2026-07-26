"use client";

// ============================================================================
// @oceanleo/ui — 模板素材「下载」的真实执行（合同 §0.3 / §3）
// ----------------------------------------------------------------------------
// 上一轮这条链是错的：前端假设端点是 `/v1/library/templates/<artifactId>/download`
// 且能用 `<a download>` 纯导航。W7 交付后三处同时对不上（父任务 2026-07-26 裁决，
// 契约不动、前端适配），实况见 `backend/app/routers/template_materials_router.py`：
//
//   * 前缀 `/v1/template-materials`（L36）；
//   * 主键是不透明的 `template_id`，**出于安全明确拒收** artifact id；
//   * `/{template_id}/download` 挂 `Depends(current_user_id)`（L81）**强制登录**——
//     0089 的配额需要一个计费主体。目录读仍匿名可用（`optional_user_id`，L59/L70）。
//
// 强制登录是这个文件存在的全部理由：`<a download>` 发不出 `Authorization` 头，只能
// 401。所以下载改成「带 Bearer 取 blob → 本地保存」。
//
// 单独成文件而不是并进 `site-catalog-controller.ts`：那个模块是 framework-free 的纯
// 状态机 + URL 计算，被 `node --test` 直接 import；把 supabase 的 `accessToken()` 拉进去
// 会把整条深链的测试面拖进浏览器依赖。URL 解析仍留在 controller，这里只做取数与落盘。
// ============================================================================

import { accessToken } from "../lib/auth/client";
import type { TemplateMaterial } from "./app-catalog";
import {
  isDirectTemplateDownload,
  templateDownloadHref,
} from "./site-catalog-controller";

/**
 * 下载失败的可区分原因。**401 与 429 必须分开**：前者是「你还没登录」，后者是「今天
 * 的配额用完了」，混成一句文案会让已登录用户被反复劝去登录。
 */
export type TemplateDownloadErrorCode =
  | "unauthorized"
  | "quota-exceeded"
  | "not-found"
  | "integrity-failed"
  | "unavailable"
  | "network-error"
  | "failed";

/** 文案是给用户看的终稿，W2 直接渲染 `error.message` 即可。 */
const MESSAGES: Record<TemplateDownloadErrorCode, string> = {
  unauthorized: "登录后才能下载模板素材。",
  "quota-exceeded": "今天的模板下载次数已用完，明天再试。",
  "not-found": "这份模板素材不存在或已下线。",
  "integrity-failed": "这份模板素材的版本校验没通过，请稍后重试。",
  unavailable: "模板素材服务暂时不可用，请稍后重试。",
  "network-error": "网络异常，模板素材没有下载成功。",
  failed: "模板素材下载失败，请稍后重试。",
};

export class TemplateDownloadError extends Error {
  readonly code: TemplateDownloadErrorCode;
  /** HTTP 状态码；取不到（网络层失败 / 无凭据未发请求）时为 0。 */
  readonly status: number;

  constructor(code: TemplateDownloadErrorCode, status = 0, message?: string) {
    super(message || MESSAGES[code]);
    this.name = "TemplateDownloadError";
    this.code = code;
    this.status = status;
  }
}

/** HTTP 状态 → 可区分原因。未知状态不猜，落 `failed`。 */
export function templateDownloadErrorCodeForStatus(
  status: number,
): TemplateDownloadErrorCode {
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "quota-exceeded";
  if (status === 404) return "not-found";
  if (status === 409) return "integrity-failed";
  if (status === 503) return "unavailable";
  return "failed";
}

/**
 * `Content-Disposition` 里的文件名。W7 会给出稳定名字（website 源码包是
 * `<stem>-<revision 前 8 位>.zip`），拿不到时才回退到素材标题。
 */
export function filenameFromContentDisposition(header: string | null): string {
  const raw = String(header || "");
  if (!raw) return "";
  // RFC 5987 的 `filename*=UTF-8''…` 优先于朴素 `filename="…"`。
  const encoded = /filename\*\s*=\s*[^']*''([^;]+)/i.exec(raw);
  if (encoded?.[1]) {
    try {
      return sanitizeFilename(decodeURIComponent(encoded[1].trim()));
    } catch {
      // 编码坏了就当没有，往下走朴素形式。
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i.exec(raw);
  return sanitizeFilename((plain?.[1] ?? plain?.[2] ?? "").trim());
}

/** 落盘文件名不得带路径分隔符——响应头是服务端给的，但保存是本地动作。 */
function sanitizeFilename(value: string): string {
  return value.replace(/[\\/\u0000-\u001f\u007f]/g, "").trim();
}

function fallbackFilename(template: TemplateMaterial): string {
  return sanitizeFilename(template.title || template.id) || "template-material";
}

/** 4 行浏览器落盘惯例；仓内已有多处同款，不值得为它反向依赖 doc-editors。 */
function saveBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/**
 * 合同 §0.3「下载」：把这份模板素材的真实文件存到本地。
 *
 * 成功即 resolve；失败一律 **throw `TemplateDownloadError`**，`code`/`status` 可区分，
 * `message` 是可直接渲染的终稿文案。W2 在按钮处 catch 并显示即可。
 *
 * 两条路：
 *   * 素材自带 `https:` 直链 → 直接导航保存，不过后端、不带凭据（也就没有配额）；
 *   * 否则 → `GET {gateway}/v1/template-materials/{template.id}/download`，带
 *     `Authorization: Bearer`，拿 blob 落盘。
 */
export async function downloadTemplateMaterial(
  template: TemplateMaterial,
): Promise<void> {
  const href = templateDownloadHref(template);
  if (!href) {
    throw new TemplateDownloadError("not-found");
  }
  // 公开直链：跨域 fetch 会撞 CORS，而这里本来也不需要凭据，直接交给浏览器导航。
  if (isDirectTemplateDownload(template)) {
    saveByNavigation(href, fallbackFilename(template));
    return;
  }

  let token: string | null = null;
  try {
    token = await accessToken();
  } catch {
    // 读不出会话与没有会话，对用户是同一件事：先去登录。
    throw new TemplateDownloadError("unauthorized");
  }
  // 端点强制登录，没有 token 就别发这一趟——省一次必然 401 的往返。
  if (!token) throw new TemplateDownloadError("unauthorized");

  let response: Response;
  try {
    response = await fetch(href, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "omit",
    });
  } catch {
    throw new TemplateDownloadError("network-error");
  }

  if (!response.ok) {
    throw new TemplateDownloadError(
      templateDownloadErrorCodeForStatus(response.status),
      response.status,
    );
  }

  let blob: Blob;
  try {
    blob = await response.blob();
  } catch {
    throw new TemplateDownloadError("network-error", response.status);
  }
  const filename =
    filenameFromContentDisposition(
      response.headers.get("content-disposition"),
    ) || fallbackFilename(template);
  saveBlob(filename, blob);
}

/** 直链保存：不取 blob，直接让浏览器按 URL 下载。 */
function saveByNavigation(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.click();
}
