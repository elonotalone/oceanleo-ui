"use client";

/**
 * 上传归一化：把用户手上的文件变成编辑器认得的那一种。
 *
 * 这里**只有机制**，没有任何解析器：
 *   - 「哪些后缀我原生就认」「哪些后缀能转成什么」由各条编辑器路由自己声明
 *     （`registerEditorImportPlan()`，或调用时直接把 plan 传进来）；
 *   - 真正的转换全部走后端既有端点 `/v1/convert/{office,image,media}`，
 *     前端一行解析代码都不加。
 *
 * 转不了就**原样返回**，并把「为什么打不开」写成一句用户看得懂的中文交给调用方去说。
 * 不猜、不静默替换成别的格式——用户拖进来的是哪个文件，就还是哪个文件。
 */

import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";
import { isHumanReadableMessage } from "./human-error-message";

/** 后端既有的三个转换端点（合同 §1）。前端不新增端点。 */
export type EditorConvertEndpoint = "office" | "image" | "media";

export interface EditorImportRule {
  /** 入口后缀，小写、不带点。 */
  from: readonly string[];
  /** 转成哪个后缀。 */
  to: string;
  endpoint: EditorConvertEndpoint;
  /** 只有 `image` 端点用得上；不给就用后端默认值。 */
  quality?: number;
}

export interface EditorImportPlan {
  /** 与编辑栏适配器 id 逐字相同。 */
  editorId: string;
  /** 编辑器原生就认的后缀，命中直接原样放行，不发请求。 */
  accept: readonly string[];
  rules?: readonly EditorImportRule[];
}

export interface EditorImportResult {
  /** 这份文件现在能不能交给编辑器打开。 */
  ok: boolean;
  /** 能开就是转换后的文件；开不了就是原文件（一个字节都没动）。 */
  file: File;
  /** 是不是真的转过。原生就认的格式为 `false`。 */
  converted: boolean;
  /** 入口后缀（小写）。 */
  from: string;
  /** 结果后缀（小写）。开不了时等于 `from`。 */
  to: string;
  /** 给用户看的一句中文；顺利放行时是空串。 */
  message: string;
}

const PLANS = new Map<string, EditorImportPlan>();

/** 编辑器路由在模块加载时声明自己的映射表。同一个 editorId 后声明的覆盖先声明的。 */
export function registerEditorImportPlan(plan: EditorImportPlan): void {
  const editorId = String(plan?.editorId || "").trim();
  if (!editorId) return;
  PLANS.set(editorId, { ...plan, editorId });
}

export function editorImportPlan(
  editorId: string,
): EditorImportPlan | null {
  return PLANS.get(String(editorId || "").trim()) || null;
}

/** 这个编辑器认得的全部入口后缀（原生的 + 能转过来的），用来写「支持哪些」文案。 */
export function editorImportExtensions(editorId: string): string[] {
  const plan = editorImportPlan(editorId);
  if (!plan) return [];
  return [
    ...new Set([
      ...plan.accept.map(normalizedExtension),
      ...(plan.rules || []).flatMap((rule) =>
        rule.from.map(normalizedExtension),
      ),
    ]),
  ].filter(Boolean);
}

function normalizedExtension(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^\./, "");
}

export function fileExtension(file: { name?: string }): string {
  const name = String(file?.name || "");
  const dot = name.lastIndexOf(".");
  return dot > 0 ? normalizedExtension(name.slice(dot + 1)) : "";
}

function renamed(name: string, extension: string): string {
  const base = String(name || "file");
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return `${stem || "file"}.${extension}`;
}

function unchanged(
  file: File,
  extension: string,
  message = "",
): EditorImportResult {
  return {
    ok: !message,
    file,
    converted: false,
    from: extension,
    to: extension,
    message,
  };
}

function convertFailureMessage(status: number, detail: string): string {
  if (isHumanReadableMessage(detail)) return detail;
  if (status === 401 || status === 403) {
    return "登录后才能自动转换格式，请登录后重试。";
  }
  if (status === 402) {
    return "自动转换格式需要积分，当前额度不够了。";
  }
  if (status === 413) return "这个文件太大了，自动转换没能完成。";
  if (status === 415 || status === 422) {
    return "转换服务打不开这个文件，可能内容已损坏。";
  }
  if (status === 429) return "转换请求太频繁了，缓一下再试。";
  return "转换服务暂时不可用，请稍后重试。";
}

async function failureDetail(response: Response): Promise<string> {
  try {
    const payload = await response.clone().json();
    const detail =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? (payload as Record<string, unknown>).detail
        : null;
    if (typeof detail === "string") return detail.trim();
    if (
      detail &&
      typeof detail === "object" &&
      typeof (detail as Record<string, unknown>).message === "string"
    ) {
      return String((detail as Record<string, unknown>).message).trim();
    }
  } catch {
    // 响应体不是 JSON 就按状态码说我们自己的中文。
  }
  return "";
}

/**
 * 把一份文件转成 `rule.to` 那个格式。
 *
 * 后端把转换结果**原样流回来**（`convert_router._forward_file`），所以这里拿到的是
 * 字节，不是一个 URL——不经过素材库、不落对象存储，与后端那条隐私不变量一致。
 */
async function convertViaBackend(
  file: File,
  rule: EditorImportRule,
  extension: string,
  signal?: AbortSignal,
): Promise<EditorImportResult> {
  let token: string | null = null;
  try {
    token = await accessToken();
  } catch {
    token = null;
  }
  if (!token) {
    return unchanged(
      file,
      extension,
      `${extension.toUpperCase()} 需要先转换成编辑器认得的格式，登录后才能转，请登录后重试。`,
    );
  }
  const form = new FormData();
  form.append("file", file, file.name || `file.${extension}`);
  form.append("target", rule.to);
  if (rule.endpoint === "image" && typeof rule.quality === "number") {
    form.append("quality", String(Math.round(rule.quality)));
  }
  let response: Response;
  try {
    response = await fetch(`${GATEWAY_BASE}/v1/convert/${rule.endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal,
    });
  } catch {
    return unchanged(
      file,
      extension,
      "连不上转换服务，请检查网络后重试。",
    );
  }
  if (!response.ok) {
    return unchanged(
      file,
      extension,
      convertFailureMessage(response.status, await failureDetail(response)),
    );
  }
  let blob: Blob;
  try {
    blob = await response.blob();
  } catch {
    return unchanged(file, extension, "转换结果没能读取完整，请重试。");
  }
  if (!blob.size) {
    return unchanged(
      file,
      extension,
      "转换服务返回了空文件，这个文件没能转成功。",
    );
  }
  return {
    ok: true,
    file: new File([blob], renamed(file.name, rule.to), {
      type: blob.type || "application/octet-stream",
      lastModified: Date.now(),
    }),
    converted: true,
    from: extension,
    to: rule.to,
    message: "",
  };
}

/**
 * 合同 §3.3 的归一化入口。
 *
 * `plan` 不传就用路由自己注册过的那份（合同里的两参调用形态照旧可用）；
 * 调用方手上已经有 plan 时直接传进来，省掉注册时序。
 */
export async function normalizeForEditor(
  file: File,
  editorId: string,
  plan?: EditorImportPlan,
  options: { signal?: AbortSignal } = {},
): Promise<EditorImportResult> {
  const extension = fileExtension(file);
  const active = plan || editorImportPlan(editorId);
  if (!active) {
    return unchanged(
      file,
      extension,
      "这个编辑器还没声明能吃下哪些格式，暂时打不开这个文件。",
    );
  }
  if (!extension) {
    return unchanged(
      file,
      extension,
      `这个文件没有扩展名，认不出是什么格式。${supportHint(active)}`,
    );
  }
  if (active.accept.map(normalizedExtension).includes(extension)) {
    return unchanged(file, extension);
  }
  const rule = (active.rules || []).find((entry) =>
    entry.from.map(normalizedExtension).includes(extension),
  );
  if (!rule) {
    return unchanged(
      file,
      extension,
      `这里打不开 ${extension.toUpperCase()} 文件。${supportHint(active)}`,
    );
  }
  return convertViaBackend(file, rule, extension, options.signal);
}

function supportHint(plan: EditorImportPlan): string {
  const extensions = [
    ...new Set([
      ...plan.accept.map(normalizedExtension),
      ...(plan.rules || []).flatMap((rule) =>
        rule.from.map(normalizedExtension),
      ),
    ]),
  ].filter(Boolean);
  return extensions.length
    ? `这里支持：${extensions.map((entry) => entry.toUpperCase()).join("、")}。`
    : "";
}
