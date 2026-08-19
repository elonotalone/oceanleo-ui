"use client";

/**
 * 办公格式转换客户端 —— 只是把已有的后端端点接上，前端不做任何解析。
 *
 * 端点：`POST {网关}/v1/convert/office`，multipart 字段 `file` + `target`，
 * 回来的是**二进制流**（`oceanleo/backend/app/routers/convert_router.py:139-149`
 * 里 `_forward_file` 直接 `StreamingResponse`），所以按 blob 读，不能 `res.json()`。
 *
 * 合同 §3.3/§3.4：要转换一律走这里，`docs/.../00-dispatch-contract.md`。
 */

import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";

export const OFFICE_CONVERT_PATH = "/v1/convert/office";

/** 后端 LibreOffice 支持的落地格式（`target` 的取值域）。 */
export const OFFICE_CONVERT_TARGETS = [
  "docx",
  "xlsx",
  "pptx",
  "pdf",
  "md",
  "html",
  "txt",
] as const;

export type OfficeConvertTarget = (typeof OFFICE_CONVERT_TARGETS)[number];

export class OfficeConvertError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "OfficeConvertError";
    this.status = status;
  }
}

function readableFailure(status: number, detail: string): string {
  const because = String(detail || "").trim();
  if (status === 401) return "请先登录 OceanLeo 账号，再做格式转换。";
  if (status === 402) return because || "转换要用的额度不够了；明天会重置，也可以先充值。";
  if (status === 413) return because || "文件太大，转换服务没有接收。";
  if (status === 502) return "转换服务暂时连不上，请过一会儿再试。";
  if (because) return because;
  return `转换服务返回了 HTTP ${status}。`;
}

async function failureDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return "";
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // 后端在非 JSON 分支上直接回文本，原样带出去就是最有用的原因。
    }
    return text.slice(0, 300);
  } catch {
    return "";
  }
}

/**
 * 一次格式转换：进去一个文件，出来一个 blob。
 * 失败一律抛 `OfficeConvertError`，`message` 是能直接显示给用户的中文。
 */
export async function convertOfficeBlob(
  input: Blob,
  fileName: string,
  target: OfficeConvertTarget,
): Promise<Blob> {
  const token = await accessToken();
  if (!token) {
    throw new OfficeConvertError("请先登录 OceanLeo 账号，再做格式转换。", 401);
  }
  const form = new FormData();
  form.append("file", input, fileName);
  form.append("target", target);
  let response: Response;
  try {
    response = await fetch(`${GATEWAY_BASE}${OFFICE_CONVERT_PATH}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new OfficeConvertError("网络不通，没能把文件送到转换服务。", 0);
  }
  if (!response.ok) {
    throw new OfficeConvertError(
      readableFailure(response.status, await failureDetail(response)),
      response.status,
    );
  }
  const blob = await response.blob();
  if (blob.size === 0) {
    throw new OfficeConvertError("转换服务回了一个空文件，已停下没有覆盖原件。", 200);
  }
  return blob;
}

/** 把一个 blob 转成 `File`，好让编辑器的载入路径按后缀判型。 */
export function convertedFile(
  blob: Blob,
  baseName: string,
  target: string,
  mediaType?: string,
): File {
  const stem = String(baseName || "document").replace(/\.[^.]+$/, "") || "document";
  return new File([blob], `${stem}.${target}`, {
    type: mediaType || blob.type || "application/octet-stream",
  });
}
