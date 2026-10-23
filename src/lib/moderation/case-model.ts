// 内容处置（针对本人内容的案件）的数据模型与纯逻辑：不碰网络、不碰界面。
// 2026-10-23 leobay-projects 波 W09：从门户 `app/settings/content-cases/content-cases-panel.tsx`
// 与 `lib/moderation/client.ts` 搬来，随「内容处置」一起进 LeoChat（`shell/messages/cases/`）。
//
// 后端口径（`backend/app/moderation/store.py` 的 `public_view`）：
//   GET  /v1/moderation/my-cases                      → { cases: [...] }，只含「目标归本人」的案件
//   POST /v1/moderation/cases/{id}/counter-notice     → 更新后的案件（status 变 awaiting_counter，restore_at = +15 日）
//   POST /v1/moderation/cases/{id}/appeal             → 更新后的案件（appeal_at 落时间）
// 通知人的邮箱 / 电话 / 地址永远不在返回里，AI 分诊意见也不在。

export const MODERATION_PATH = "/v1/moderation";

/** 案件来源；`staydown`（指纹拦截）对用户和「机器检测」是一回事。 */
export const CASE_SOURCES = ["user_report", "rights_notice", "machine", "staydown", "authority", "operator"] as const;

export interface OwnerCaseNotice {
  claimant_name: string;
  work_description: string;
  location_urls: string[];
}

export interface OwnerCase {
  id: string;
  source: string;
  /** infringement 版权/商标/肖像（走反通知）· illegal 违法 · policy 平台规则（这两种走申诉）· authority 主管部门 */
  tier: string | null;
  /** open · awaiting_counter · taken_down · dismissed · restored · executed */
  status: string;
  target_kind: string;
  target_ref: string;
  /** 内容快照里的标题；没有就是空串（界面写「未命名内容」）。 */
  title: string;
  /** 各来源自己的原因代码（见 `reasonCodeOf`）；可能是空串、中文原文或 `machine:<标签>`。 */
  reason: string;
  hidden: boolean;
  due_at: string | null;
  restore_at: string | null;
  decision_note: string;
  notice: OwnerCaseNotice;
  /** 服务端给的可做动作（counter_notice / appeal）；只在 tier 缺失时当兜底，见 `canCounterNotice`。 */
  actions: string[];
  counter_notice_at: string | null;
  appeal_at: string | null;
  created_at: string | null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stamp(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** 服务端一行 → `OwnerCase`；没有 id 的当作没有。字段一律宽进：缺什么补什么，不抛。 */
export function normalizeCase(raw: unknown): OwnerCase | null {
  const row = record(raw);
  if (!row) return null;
  const id = text(row.id).trim();
  if (!id) return null;
  const snapshot = record(row.target_snapshot);
  const notice = record(row.notice);
  const urls = Array.isArray(notice?.location_urls)
    ? (notice?.location_urls as unknown[]).filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
  return {
    id,
    source: text(row.source),
    tier: typeof row.tier === "string" && row.tier ? row.tier : null,
    status: text(row.status),
    target_kind: text(row.target_kind),
    target_ref: text(row.target_ref),
    title: text(snapshot?.title).trim(),
    reason: text(row.reason).trim(),
    hidden: row.hidden === true,
    due_at: stamp(row.due_at),
    restore_at: stamp(row.restore_at),
    decision_note: text(row.decision_note).trim(),
    notice: {
      claimant_name: text(notice?.claimant_name).trim(),
      work_description: text(notice?.work_description).trim(),
      location_urls: urls,
    },
    actions: Array.isArray(row.actions) ? row.actions.filter((item): item is string => typeof item === "string") : [],
    counter_notice_at: stamp(row.counter_notice_at),
    appeal_at: stamp(row.appeal_at),
    created_at: stamp(row.created_at),
  };
}

/** `my-cases` 的响应体 → 案件列表（保持服务端顺序：新的在前）。 */
export function normalizeCases(body: unknown): OwnerCase[] {
  const list = record(body)?.cases;
  if (!Array.isArray(list)) return [];
  const out: OwnerCase[] = [];
  for (const item of list) {
    const row = normalizeCase(item);
    if (row) out.push(row);
  }
  return out;
}

/**
 * 能不能提交反通知（版权、商标、肖像类；15 日内平台没有进一步维持下架，内容自动恢复）。
 * 旧面板的规则：tier 为 infringement 且状态是待处理或已下架；这里再加一条——提交过就不再给表单。
 * tier 还没分出来（用户举报没过分诊）时，才采信服务端的 `actions`。
 */
export function canCounterNotice(row: OwnerCase): boolean {
  if (row.counter_notice_at) return false;
  if (row.status !== "open" && row.status !== "taken_down") return false;
  if (row.tier === "infringement") return true;
  return row.tier === null && row.actions.includes("counter_notice");
}

/**
 * 能不能申诉（违法、平台规则类）。旧面板对 illegal / policy 一律给表单；这里收紧到「内容真的被动过」：
 * 已被隐藏或已下架才给，且提交过、已恢复、已驳回、已执行、反通知处理中都不再给。
 * tier 缺失时才采信服务端的 `actions`。
 */
export function canAppeal(row: OwnerCase): boolean {
  if (row.appeal_at) return false;
  if (row.status !== "open" && row.status !== "taken_down") return false;
  if (row.tier === "illegal" || row.tier === "policy") return row.hidden || row.status === "taken_down";
  return row.tier === null && row.actions.includes("appeal");
}

/** 列表上「需要你处理」：现在能做的动作。 */
export function needsAction(row: OwnerCase): boolean {
  return canCounterNotice(row) || canAppeal(row);
}

/** 距某个时刻还有几个整日（向上取整，最少 0）；解析不了给 null。 */
export function daysUntil(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso) - now;
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** 这个时刻还没到？（用来决定要不要写「平台会在 … 前判断」。） */
export function isFuture(iso: string | null | undefined, now: number = Date.now()): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  return !Number.isNaN(at) && at > now;
}

/** 本地化的日期（可带时间）；解析不了给空串。`locale` 缺省走浏览器语言。 */
export function formatCaseTime(iso: string | null | undefined, locale?: string, withTime = false): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(locale, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(at);
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

// ---- 原因代码 ---------------------------------------------------------------------------

/**
 * 各来源写进 `reason` 的值不统一：游戏举报是英文代码（sexual…），Bay 应用 / 课程举报是另一组代码，
 * LeoChat 举报又是一组，talent 举报存的是选项的中文原文，机器检测是 `staydown` 或 `machine:<标签>`。
 * 这里只认已知的；认不出的（运营手填、权利人自由文本）返回 null，界面就不显示这一行，
 * 不把举报人的原话或内部代码原样亮给被举报的人。
 */
export type ReasonCode =
  | "spam"
  | "harassment"
  | "fraud"
  | "illegal"
  | "other"
  | "fake"
  | "offsite"
  | "plagiarism"
  | "sexual"
  | "violence"
  | "hate"
  | "ip_infringement"
  | "malware"
  | "staydown"
  | "machine";

const REASON_CODES: readonly string[] = [
  "spam",
  "harassment",
  "fraud",
  "illegal",
  "other",
  "fake",
  "offsite",
  "plagiarism",
  "sexual",
  "violence",
  "hate",
  "ip_infringement",
  "malware",
  "staydown",
];

/** talent 举报存的中文选项原文 → 代码（与 `lib/bay/services.ts` 的 BAY_REPORT_REASON_TEXT 同源）。 */
const REASON_TEXT_CODES: Record<string, ReasonCode> = {
  "虚假信息或夸大宣传": "fake",
  "骚扰、辱骂或歧视": "harassment",
  "要求站外交易或预付款": "offsite",
  "抄袭、盗用他人作品": "plagiarism",
  "涉嫌欺诈": "fraud",
  "其他": "other",
};

export function reasonCodeOf(reason: string | null | undefined): ReasonCode | null {
  const raw = (reason || "").trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.startsWith("machine:") || lower === "machine") return "machine";
  if (REASON_CODES.includes(lower)) return lower as ReasonCode;
  return REASON_TEXT_CODES[raw] ?? null;
}

// ---- 反通知 / 申诉的表单数据 ------------------------------------------------------------

export interface CounterNoticeBody {
  statement: string;
  contact_email: string;
  good_faith: boolean;
  consent_jurisdiction: boolean;
  signature: string;
}

export interface AppealBody {
  statement: string;
}

export type CounterNoticeField = "statement" | "contact_email" | "good_faith" | "consent_jurisdiction" | "signature";

export const EMPTY_COUNTER_DRAFT: CounterNoticeBody = {
  statement: "",
  contact_email: "",
  good_faith: false,
  consent_jurisdiction: false,
  signature: "",
};

/** 输入框的字数上限（后端不限；这里防的是整本书贴进来）。 */
export const STATEMENT_LIMIT = 4000;
export const SIGNATURE_LIMIT = 200;
export const EMAIL_LIMIT = 254;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

export function isEmailShape(value: string): boolean {
  return EMAIL_SHAPE.test(value.trim());
}

/** 反通知里还缺哪些（陈述、联系邮箱、两条声明、签名都必填）。空数组 = 可以提交。 */
export function counterNoticeMissing(draft: CounterNoticeBody): CounterNoticeField[] {
  const missing: CounterNoticeField[] = [];
  if (!draft.statement.trim()) missing.push("statement");
  if (!isEmailShape(draft.contact_email)) missing.push("contact_email");
  if (draft.good_faith !== true) missing.push("good_faith");
  if (draft.consent_jurisdiction !== true) missing.push("consent_jurisdiction");
  if (!draft.signature.trim()) missing.push("signature");
  return missing;
}

/** 发给后端的反通知：去首尾空白；两条声明走到这里必然已勾选。 */
export function counterNoticeBody(draft: CounterNoticeBody): CounterNoticeBody {
  return {
    statement: draft.statement.trim().slice(0, STATEMENT_LIMIT),
    contact_email: draft.contact_email.trim().slice(0, EMAIL_LIMIT),
    good_faith: true,
    consent_jurisdiction: true,
    signature: draft.signature.trim().slice(0, SIGNATURE_LIMIT),
  };
}

export function appealMissing(draft: AppealBody): "statement"[] {
  return draft.statement.trim() ? [] : ["statement"];
}

export function appealBody(draft: AppealBody): AppealBody {
  return { statement: draft.statement.trim().slice(0, STATEMENT_LIMIT) };
}
