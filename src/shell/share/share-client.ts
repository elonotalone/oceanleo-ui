"use client";

// ============================================================================
// @oceanleo/ui — 分享链接客户端（Copy Link）
// ----------------------------------------------------------------------------
// 接口形状由合同 §4 I-2 定死，任何一方不得单方面改：
//   POST /v1/share/task   { task_id, message_ids?: number[] }  → { share_id }
//   GET  /v1/share/<id>                                        → { title, messages[] }
// 后端（W04）还没上线时前端不许崩：一律翻译成一句能给用户看的话，由调用方提示。
//
// 为什么不复用 lib/agent.ts 的 agentApi：那是别人的文件，且它把 404 也折叠成通用
// 文案，分不出「接口还没上线」和「这段对话不存在」——这两句话对用户完全不同。
// ============================================================================

import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";

export const SHARE_TASK_PATH = "/v1/share/task";
/** 分享页留在 `oceanleo.com`（合同 R7）：它渲染的是我方页面里的用户**文字**。 */
export const SHARE_PATH_PREFIX = "/share/";

export class ShareLinkError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ShareLinkError";
    this.status = status;
  }
}

/** 后端返回的 share_id 会直接进 URL，只放行 URL 安全字符。 */
export function isValidShareId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(value);
}

/** `https://<当前站点域>/share/<share_id>`。origin 只在测试里显式传。 */
export function shareUrlFor(shareId: string, origin?: string): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/\/+$/, "")}${SHARE_PATH_PREFIX}${shareId}`;
}

/** HTTP 状态 → 一句可以直接显示给用户的话（中文原文，调用方过 tt()）。 */
export function shareFailureMessage(status: number, detail: string): string {
  const because = String(detail || "").trim();
  if (status === 0) return "网络不通，没能创建分享链接。";
  if (status === 401) return "请先登录 OceanLeo 账号，再创建分享链接。";
  if (status === 403) return "这段对话不是你的，不能分享。";
  if (status === 404 || status === 405) {
    return "分享链接功能还在上线中，暂时只能复制文本或导出长图。";
  }
  if (status === 429) return because || "分享得太频繁了，缓一分钟再试。";
  if (status >= 500) return "分享服务暂时不可用，请过一会儿再试。";
  return because || `分享服务返回了 HTTP ${status}。`;
}

async function failureDetail(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return "";
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // 非 JSON 分支：原样带出去就是最有用的原因。
    }
    return text.slice(0, 300);
  } catch {
    return "";
  }
}

export interface CreateShareLinkInput {
  taskId: string;
  /** 只分享选中的这几条；不传 = 整段对话。 */
  messageIds?: readonly number[];
  /** 注入点，只给测试用。 */
  fetchImpl?: typeof fetch;
  /** 注入点，只给测试用。 */
  tokenImpl?: () => Promise<string | null>;
  origin?: string;
}

export interface ShareLink {
  shareId: string;
  url: string;
}

/** 建分享链接。失败一律抛 `ShareLinkError`，`message` 可直接显示。 */
export async function createShareLink(
  input: CreateShareLinkInput,
): Promise<ShareLink> {
  const taskId = String(input.taskId || "").trim();
  if (!taskId) {
    throw new ShareLinkError("这段对话还没保存，稍后再分享。", 0);
  }
  const token = await (input.tokenImpl || accessToken)();
  if (!token) {
    throw new ShareLinkError(shareFailureMessage(401, ""), 401);
  }
  const body: Record<string, unknown> = { task_id: taskId };
  if (input.messageIds && input.messageIds.length) {
    body.message_ids = [...input.messageIds];
  }
  const doFetch = input.fetchImpl || fetch;
  let response: Response;
  try {
    response = await doFetch(`${GATEWAY_BASE}${SHARE_TASK_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ShareLinkError(shareFailureMessage(0, ""), 0);
  }
  if (!response.ok) {
    throw new ShareLinkError(
      shareFailureMessage(response.status, await failureDetail(response)),
      response.status,
    );
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const shareId = (payload as { share_id?: unknown } | null)?.share_id;
  if (!isValidShareId(shareId)) {
    throw new ShareLinkError("分享服务没有返回可用的链接。", 200);
  }
  return { shareId, url: shareUrlFor(shareId, input.origin) };
}
