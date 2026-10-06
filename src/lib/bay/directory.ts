// Bay 的个人主页与目录取数（移植自 talent `lib/talent/directory.ts`）。公开读取一律 anonymous，
// 不登录也能看；举报与拉黑要登录。展示文案的拼装放在调用方（tt），这里只给数据与判断。

import { bayGet, bayPost } from "./http";
import { BAY_REPORT_REASON_TEXT, type BayReportReason, type BayService } from "./services";

export type BayAvailability = "open" | "busy" | "closed";
export type BayTalentLevel = "new" | "rising" | "pro" | "top";

/** 陌生人能看到的一个人。没有邮箱、手机号、联系方式。 */
export interface BayPublicProfile {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  headline?: string;
  availability?: BayAvailability;
  engagement_kinds?: string[];
  hourly_rate_fen?: number | null;
  min_budget_fen?: number | null;
  rating_avg?: number | null;
  rating_count?: number | null;
  completed_contracts?: number | null;
  categories?: string[];
  skills?: string[];
  languages?: string[];
  level?: BayTalentLevel;
  response_minutes?: number | null;
  response_rate?: number | null;
  on_time_rate?: number | null;
  last_active_at?: string | null;
  self_described_role?: string | null;
  practice_vetting?: unknown;
  currency?: string;
}

export interface BayShowcaseItem {
  id: string;
  source_kind: "task" | "artifact" | "manual";
  source_ref?: string | null;
  title: string;
  summary: string;
  cover_url: string | null;
  detail_level: "summary" | "full";
  position?: number;
  published?: boolean;
  created_at?: string;
}

export interface BayReview {
  id: string;
  contract_id: string;
  author_user_id: string;
  target_user_id: string;
  author_role: "buyer" | "seller";
  rating: number;
  body: string;
  revealed: boolean;
  created_at: string;
  author?: Partial<BayPublicProfile> | null;
}

export interface BayProfilePage {
  profile: BayPublicProfile & { bio?: string; published?: boolean };
  services: BayService[];
  showcase: BayShowcaseItem[];
  reviews: BayReview[];
}

/** 类目的「什么叫完成」字段定义（卖家挂牌时填，买家下单前看）。 */
export interface BayFieldSpec {
  key: string;
  label_zh: string;
  type: "text" | "int" | "enum" | "bool" | "list";
  required: boolean;
  machine_checkable: boolean;
  enum: string[] | null;
  max_len?: number | null;
  max?: number | null;
}

export interface BayCategoryFields {
  slug: string;
  name_zh: string;
  name_en: string;
  required_fields?: BayFieldSpec[];
  published?: boolean;
}

export function bayQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function getBayProfile(handle: string): Promise<BayProfilePage> {
  return bayGet<BayProfilePage>(`/v1/talent/profiles/${encodeURIComponent(handle)}`, { anonymous: true });
}

export function profileDisplayName(profile: Partial<BayPublicProfile> | null | undefined): string {
  if (!profile) return "";
  return (profile.display_name || profile.handle || (profile.user_id ? `@${profile.user_id.slice(0, 6)}` : "")).trim();
}

/** 作品集与平台见证的交付记录分开：任务来源的是平台见证，其余是卖家自选作品。 */
export function splitShowcase(items: BayShowcaseItem[]): { portfolio: BayShowcaseItem[]; verified: BayShowcaseItem[] } {
  return {
    portfolio: items.filter((item) => item.source_kind !== "task"),
    verified: items.filter((item) => item.source_kind === "task"),
  };
}

let categoriesRequest: Promise<BayCategoryFields[]> | null = null;

function flatten(items: (BayCategoryFields & { children?: BayCategoryFields[] })[]): BayCategoryFields[] {
  const out: BayCategoryFields[] = [];
  for (const item of items) {
    out.push(item);
    if (item.children?.length) out.push(...flatten(item.children));
  }
  return out;
}

/** 类目清单（含必填字段定义）。一次会话取一次，失败不缓存。 */
export function fetchBayCategoryFields(): Promise<BayCategoryFields[]> {
  if (!categoriesRequest) {
    categoriesRequest = bayGet<{ items?: BayCategoryFields[]; flat_items?: BayCategoryFields[] }>("/v1/talent/categories", {
      anonymous: true,
    })
      .then((data) => (data?.flat_items?.length ? data.flat_items : flatten(data?.items || [])).filter((item) => Boolean(item?.slug)))
      .catch((error: unknown) => {
        categoriesRequest = null;
        throw error;
      });
  }
  return categoriesRequest;
}

export function requiredFieldsOf(category: BayCategoryFields | undefined): BayFieldSpec[] {
  return (category?.required_fields || []).filter((field) => field.required);
}

export function reportBayProfile(userId: string, reason: BayReportReason, detail?: string): Promise<{ duplicate: boolean }> {
  return bayPost<{ duplicate: boolean }>("/v1/talent/reports", {
    target_kind: "profile",
    target_ref: userId,
    reason: BAY_REPORT_REASON_TEXT[reason],
    ...(detail ? { detail } : {}),
  });
}

/** 拉黑走 IM 现有的拉黑接口：拉黑后对方不能再给你发消息。 */
export function blockBayUser(userId: string): Promise<{ ok: boolean }> {
  return bayPost<{ ok: boolean }>("/v1/im/blocks", { user_id: userId });
}
