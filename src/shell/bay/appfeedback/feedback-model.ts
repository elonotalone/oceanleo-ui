// 留言与反馈的纯逻辑：筛选参数、表单校验、状态 → 标签与按钮。组件只调用这里，测试直接 import。
import type {
  BayAppFeedbackSummary,
  BayAppThreadInput,
  BayAppThreadKind,
  BayAppThreadPost,
  BayAppThreadStatus,
} from "../../../lib/bay/app-feedback";

export const STATUS_FILTERS = ["all", "open", "answered", "resolved"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const KIND_FILTERS = ["bug", "idea", "question"] as const;
export type KindFilter = BayAppThreadKind | "";

export const TITLE_MIN = 2;
export const TITLE_MAX = 120;
export const BODY_MIN = 5;
export const BODY_MAX = 4000;
export const REPLY_MIN = 1;
export const REPLY_MAX = 4000;

export const EMPTY_SUMMARY: BayAppFeedbackSummary = {
  total: 0,
  open: 0,
  answered: 0,
  resolved: 0,
  bug: 0,
  idea: 0,
  question: 0,
};

export function statusFilterLabel(filter: StatusFilter): string {
  if (filter === "open") return "待回复";
  if (filter === "answered") return "已回复";
  if (filter === "resolved") return "已解决";
  return "全部";
}

export function kindLabel(kind: BayAppThreadKind): string {
  if (kind === "bug") return "报错";
  if (kind === "idea") return "建议";
  return "提问";
}

export function statusLabel(status: BayAppThreadStatus): string {
  if (status === "answered") return "已回复";
  if (status === "resolved") return "已解决";
  return "待回复";
}

export function statusFilterCount(summary: BayAppFeedbackSummary, filter: StatusFilter): number {
  if (filter === "all") return summary.total ?? 0;
  return summary[filter] ?? 0;
}

export function kindFilterCount(summary: BayAppFeedbackSummary, kind: BayAppThreadKind): number {
  return summary[kind] ?? 0;
}

export function toggleKind(current: KindFilter, next: BayAppThreadKind): KindFilter {
  return current === next ? "" : next;
}

export function listThreadParams(input: {
  status: StatusFilter;
  kind: KindFilter;
  offset?: number;
  limit?: number;
}): { kind?: BayAppThreadKind; status?: BayAppThreadStatus; offset?: number; limit?: number } {
  const params: { kind?: BayAppThreadKind; status?: BayAppThreadStatus; offset?: number; limit?: number } = {};
  if (input.status !== "all") params.status = input.status;
  if (input.kind) params.kind = input.kind;
  if (typeof input.offset === "number") params.offset = input.offset;
  if (typeof input.limit === "number") params.limit = input.limit;
  return params;
}

export function inboxParams(input: {
  appId: string;
  status: StatusFilter;
  offset?: number;
  limit?: number;
}): { app_id: string; status?: BayAppThreadStatus; offset?: number; limit?: number } {
  const params: { app_id: string; status?: BayAppThreadStatus; offset?: number; limit?: number } = {
    app_id: input.appId,
  };
  if (input.status !== "all") params.status = input.status;
  if (typeof input.offset === "number") params.offset = input.offset;
  if (typeof input.limit === "number") params.limit = input.limit;
  return params;
}

export function titleProblem(title: string): string | null {
  const trimmed = (title ?? "").trim();
  if (trimmed.length < TITLE_MIN || trimmed.length > TITLE_MAX) return "标题需要 2–120 个字";
  return null;
}

export function bodyProblem(body: string): string | null {
  const trimmed = (body ?? "").trim();
  if (trimmed.length < BODY_MIN || trimmed.length > BODY_MAX) return "正文需要 5–4000 个字";
  return null;
}

export function replyProblem(body: string): string | null {
  const trimmed = (body ?? "").trim();
  if (trimmed.length < REPLY_MIN || trimmed.length > REPLY_MAX) return "回复需要 1–4000 个字";
  return null;
}

export function composerProblem(input: Pick<BayAppThreadInput, "title" | "body">): { title: string | null; body: string | null } {
  return { title: titleProblem(input.title), body: bodyProblem(input.body) };
}

export function previewBody(body: string, maxLines = 2): string {
  return (body || "").replace(/\r\n/g, "\n").split("\n").slice(0, maxLines).join("\n");
}

export function formatThreadTime(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function formatDigestWeek(value: string | null | undefined): string {
  if (!value) return "";
  const matched = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (matched) return matched[1];
  return formatThreadTime(value);
}

export function sortPostsOldToNew(posts: BayAppThreadPost[]): BayAppThreadPost[] {
  return [...posts].sort((a, b) => {
    const left = Date.parse(a.created_at || "") || 0;
    const right = Date.parse(b.created_at || "") || 0;
    return left - right;
  });
}

export function canWriteFeedback(isOwner: boolean, feedbackMode: "open" | "off"): boolean {
  return !isOwner && feedbackMode === "open";
}

export function canReplyOrResolve(thread: { viewer_is_author: boolean; viewer_is_owner: boolean }): boolean {
  return Boolean(thread.viewer_is_author || thread.viewer_is_owner);
}

export function canReportThread(thread: { viewer_is_author: boolean; viewer_is_owner: boolean }): boolean {
  return !thread.viewer_is_author && !thread.viewer_is_owner;
}

export function nextStatusAction(status: BayAppThreadStatus): { next: "resolved" | "open"; label: string } {
  if (status === "resolved") return { next: "open", label: "重新打开" };
  return { next: "resolved", label: "标为已解决" };
}

export function emptyListMessage(filtered: boolean): string {
  return filtered ? "没有符合筛选的留言" : "还没有留言";
}

export function authorDisplayName(name: string | null | undefined): string {
  const trimmed = (name || "").trim();
  return trimmed || "OceanLeo 用户";
}

export function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { status?: unknown }).status === 404);
}

export function actionErrorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function isAbort(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError");
}
