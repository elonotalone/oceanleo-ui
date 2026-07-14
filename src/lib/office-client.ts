"use client";

// ============================================================================
// @oceanleo/ui — OnlyOffice 客户端（单一事实源）
// ----------------------------------------------------------------------------
// 高级内容工作台的 pptx/docx/xlsx 真编辑走自托管 OnlyOffice Document Server
// （office.oceanleo.com）。浏览器不接触 JWT secret：向网关要一份签好名的
// editor config，再加载 DS 的 api.js 实例化编辑器。保存由 DS 回调网关完成
// （新版本进「我的库」，不覆盖原文件）。
// ============================================================================

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";

export interface OfficeConfigResult {
  ok: boolean;
  error?: string;
  documentServerUrl?: string;
  config?: Record<string, unknown>;
}

/** 向网关要一份 JWT 签名的 OnlyOffice editor config。 */
export async function fetchOfficeConfig(input: {
  url: string;
  title: string;
  kind: string;
  siteId?: string;
  itemId?: string;
}): Promise<OfficeConfigResult> {
  const token = await accessToken();
  if (!token) return { ok: false, error: "未登录" };
  let response: Response;
  try {
    response = await fetch(`${GATEWAY_BASE}/v1/office/config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        url: input.url,
        title: input.title,
        kind: input.kind,
        site_id: input.siteId || "",
        item_id: input.itemId || "",
      }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "网络错误：无法连接网关" };
  }
  let data: Record<string, unknown> | null = null;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    /* non-JSON */
  }
  if (!response.ok) {
    return {
      ok: false,
      error: String((data as { detail?: string } | null)?.detail || `HTTP ${response.status}`),
    };
  }
  return {
    ok: true,
    documentServerUrl: String(data?.documentServerUrl || ""),
    config: (data?.config as Record<string, unknown>) || {},
  };
}

let scriptPromise: Promise<void> | null = null;

/** 加载 Document Server 的 api.js（幂等）。 */
export function loadOfficeScript(documentServerUrl: string): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("SSR"));
  const w = window as unknown as { DocsAPI?: unknown };
  if (w.DocsAPI) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${documentServerUrl.replace(/\/$/, "")}/web-apps/apps/api/documents/api.js`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("OnlyOffice 脚本加载失败"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** OnlyOffice 支持的扩展名（编辑模式）。 */
const OFFICE_EXTENSIONS = new Set([
  "docx", "doc", "odt", "rtf", "txt", "docm", "dotx", "epub",
  "xlsx", "xls", "ods", "csv", "xlsm", "xltx",
  "pptx", "ppt", "odp", "pptm", "pot", "potx", "potm",
  "pdf",
]);

const OFFICE_CELL_EXTENSIONS = new Set([
  "xlsx", "xls", "ods", "csv", "xlsm", "xltx",
]);
const OFFICE_SLIDE_EXTENSIONS = new Set([
  "pptx", "ppt", "odp", "pptm", "pot", "potx", "potm",
]);

/** Normalize generic library files to the material family persisted by Office. */
export function officeKindForExtension(
  extension: string,
): "document" | "sheet" | "ppt" {
  if (OFFICE_CELL_EXTENSIONS.has(extension.toLowerCase())) return "sheet";
  if (OFFICE_SLIDE_EXTENSIONS.has(extension.toLowerCase())) return "ppt";
  return "document";
}

/** 一个素材 URL 是否应走 OnlyOffice 编辑。 */
export function officeExtensionOf(url: string): string {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (!path.includes(".")) return "";
    const ext = path.split(".").pop() || "";
    return OFFICE_EXTENSIONS.has(ext) ? ext : "";
  } catch {
    return "";
  }
}
