// Bay 的使用条款（逻辑照 talent 的 lib/talent/terms.ts）。
// 条款正文与分节一律由网关下发（`GET /v1/talent/terms/current`），前端不硬编码任何一句；
// 条款只有一份，买家、卖家签的是同一个版本。
import { BayApiError, bayGet, bayPost } from "./http";

export interface BayTermsSection {
  key: string;
  title_zh: string;
  body_md: string;
}

export interface BayTermsDocument {
  version: number;
  effective_at: string | null;
  sections: BayTermsSection[];
}

export interface BayTermsAcceptance {
  version: number;
  accepted_at: string | null;
}

export interface BayTermsStatus {
  /** 当前生效的版本；取不到为 null。 */
  current: BayTermsDocument | null;
  /** 本人最近一次同意的版本；从没同意过为 null。 */
  acceptance: BayTermsAcceptance | null;
  /** 已同意当前版本。 */
  accepted: boolean;
  /** 失败时的 HTTP 状态（401 = 没登录）；成功为 null。 */
  status: number | null;
  error: string | null;
}

// 与网关当前版本的分节标题一致（界面按标题查译文）。
const FALLBACK_TITLES: Readonly<Record<string, string>> = {
  knowledge_only: "平台提供的是知识答疑",
  how_it_works: "市场怎么运转",
  fees: "费用",
  off_platform: "站外交易",
  dispute: "纠纷处理",
  verification: "身份核验",
  data_residency: "数据存放",
  privacy: "隐私",
  dispute_forum: "第三方争议解决",
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** 每一节的锚点只留安全字符。 */
export function bayTermsAnchor(key: string): string {
  return `bay-terms-${String(key).replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function sectionsOf(value: unknown, legacyBody: string): BayTermsSection[] {
  const out: BayTermsSection[] = [];
  const seen = new Set<string>();
  if (Array.isArray(value)) {
    for (const item of value) {
      const row = record(item);
      const key = typeof row?.key === "string" ? row.key.trim() : "";
      const body = typeof row?.body_md === "string" ? row.body_md.trim() : "";
      if (!key || !body || seen.has(key)) continue;
      seen.add(key);
      const title = typeof row?.title_zh === "string" && row.title_zh.trim() ? row.title_zh.trim() : FALLBACK_TITLES[key] || key;
      out.push({ key, title_zh: title, body_md: body });
    }
  }
  if (!out.length && legacyBody) out.push({ key: "full", title_zh: "使用条款全文", body_md: legacyBody });
  return out;
}

export function bayTermsDocumentFrom(value: unknown): BayTermsDocument | null {
  const row = record(value);
  if (!row) return null;
  const version = positiveInt(row.version);
  if (!version) return null;
  const sections = sectionsOf(row.sections, typeof row.body === "string" ? row.body.trim() : "");
  if (!sections.length) return null;
  return {
    version,
    effective_at: typeof row.effective_at === "string" && row.effective_at ? row.effective_at : null,
    sections,
  };
}

function acceptanceFrom(value: unknown): BayTermsAcceptance | null {
  const row = record(value);
  const version = positiveInt(row?.version);
  if (!version) return null;
  return { version, accepted_at: typeof row?.accepted_at === "string" && row.accepted_at ? row.accepted_at : null };
}

function statusFrom(value: unknown): BayTermsStatus {
  const row = record(value);
  const current = bayTermsDocumentFrom(row?.current);
  const acceptance = acceptanceFrom(row?.acceptance);
  return {
    current,
    acceptance,
    accepted: Boolean(row?.accepted === true && current && acceptance && acceptance.version === current.version),
    status: null,
    error: null,
  };
}

function failed(error: unknown, fallback: string): BayTermsStatus {
  const status = error instanceof BayApiError ? error.status : 0;
  const message = error instanceof Error && error.message ? error.message : fallback;
  return { current: null, acceptance: null, accepted: false, status, error: message };
}

/** 当前生效的条款（不登录也能读）。 */
export async function fetchBayTermsCurrent(): Promise<{ current: BayTermsDocument | null; error: string | null }> {
  try {
    const data = record(await bayGet<unknown>("/v1/talent/terms/current", { anonymous: true }));
    return { current: bayTermsDocumentFrom(data?.current) ?? bayTermsDocumentFrom(data), error: null };
  } catch (error) {
    return { current: null, error: error instanceof Error && error.message ? error.message : "条款加载失败，请稍后重试" };
  }
}

/** 本人对当前条款的同意状态。没登录时 `status === 401`。 */
export async function fetchBayTermsStatus(): Promise<BayTermsStatus> {
  try {
    return statusFrom(await bayGet<unknown>("/v1/talent/terms/status"));
  } catch (error) {
    return failed(error, "条款加载失败，请稍后重试");
  }
}

/** 同意当前版本；网关对同一版本重复同意返回第一次的记录。 */
export async function acceptBayTerms(version?: number | null): Promise<BayTermsStatus> {
  const v = positiveInt(version);
  try {
    const data = record(await bayPost<unknown>("/v1/talent/terms/accept", v ? { version: v } : undefined));
    const status = statusFrom(data);
    if (!status.acceptance && data) {
      const flat = acceptanceFrom({ version: data.version, accepted_at: data.accepted_at });
      if (flat) status.acceptance = flat;
    }
    const acceptance = status.acceptance;
    status.accepted =
      data?.accepted === true && Boolean(acceptance) && (!status.current || acceptance?.version === status.current.version);
    return status;
  } catch (error) {
    return failed(error, "没能记下你的同意，请稍后重试");
  }
}

/** 同意过的就是当前版本。 */
export function bayTermsUpToDate(status: BayTermsStatus | null | undefined): boolean {
  return Boolean(status?.accepted && status.current && status.acceptance?.version === status.current.version);
}
