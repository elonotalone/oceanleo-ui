// 举报接口（契约 §4.7）：`POST /v1/im/reports`。W07 持有；只做请求拼装与错误归类，不放界面。
// `submitReport(input, fetcher)` 让测试注入假的 fetcher；默认走 W08 的 `imFetch`（带 token、网关地址）。

import { imFetch, ImApiError } from "./client";

export type ReportTargetKind = "message" | "user" | "conversation";
export type ReportReason = "spam" | "harassment" | "fraud" | "illegal" | "other";

export const REPORT_REASONS: readonly ReportReason[] = ["spam", "harassment", "fraud", "illegal", "other"];
export const REPORT_NOTE_LIMIT = 1000;

export interface ReportInput {
  target: { kind: ReportTargetKind; id: string };
  reason: ReportReason;
  note?: string;
  alsoBlock?: boolean;
  /** 举报「人」时在哪个会话里遇到的；工单上下文取该会话里举报人看得到的消息。 */
  conversationId?: string | null;
}

export interface ReportResult {
  case_id: string;
  blocked?: boolean;
}

export type ReportFetcher = <T>(path: string, init?: RequestInit & { json?: unknown }) => Promise<T>;

export const REPORT_PATH = "/v1/im/reports";

/** 请求体：只带服务端认的字段；空说明不带；拉黑只在举报消息 / 人时才有意义。 */
export function buildReportBody(input: ReportInput): Record<string, unknown> {
  const note = (input.note ?? "").trim().slice(0, REPORT_NOTE_LIMIT);
  const body: Record<string, unknown> = {
    target: { kind: input.target.kind, id: input.target.id },
    reason: input.reason,
  };
  if (note) body.note = note;
  if (input.alsoBlock && input.target.kind !== "conversation") body.also_block = true;
  if (input.conversationId) body.conversation_id = input.conversationId;
  return body;
}

export async function submitReport(
  input: ReportInput,
  fetcher: ReportFetcher = imFetch,
): Promise<ReportResult> {
  return fetcher<ReportResult>(REPORT_PATH, { method: "POST", json: buildReportBody(input) });
}

export type ReportFailure = "quota" | "not_found" | "invalid" | "too_long" | "network" | "unauthorized" | "other";

/** 错误归类；界面按类别选文案。 */
export function classifyReportError(error: unknown): ReportFailure {
  if (!(error instanceof ImApiError)) return "other";
  if (error.code === "quota_exceeded" || error.code === "rate_limited") return "quota";
  if (error.code === "not_member" || error.code === "not_found") return "not_found";
  if (error.code === "too_long") return "too_long";
  if (error.code === "invalid" || error.status === 422) return "invalid";
  if (error.code === "network") return "network";
  if (error.status === 401 || error.code === "unauthorized") return "unauthorized";
  return "other";
}
