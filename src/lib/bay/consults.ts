// Bay 答疑取数（移植自 talent `lib/talent/consults.ts` 与 `reputation.ts` 的答疑段）。
// 医疗、法律、宠物医疗三个领域第一版不上架：列表里过滤掉，详情里判为不可用（契约 §0 第 10 条）。
// 领域的合规文案只认后端下发的那一份，这里一个字都不兜底。

import { bayGet, bayPost } from "./http";
import { bayQuery } from "./directory";
import { isRestrictedDomain, withoutRestricted } from "./services";

export type BayConsultPriceUnit = "session" | "hour";

export interface BayConsultSeller {
  user_id: string;
  handle: string;
  display_name: string;
  avatar_url?: string | null;
  headline?: string;
  self_described_role?: string | null;
  practice_vetting?: unknown;
}

export interface BayConsult {
  id: string;
  user_id: string;
  category_slug: string;
  regulated_domain: string;
  title: string;
  summary: string;
  scope_note?: string;
  price_fen: number;
  price_unit: BayConsultPriceUnit;
  rounds: number | null;
  minutes: number | null;
  response_window?: string | null;
  status: "draft" | "published" | "paused";
  currency?: string;
  created_at?: string;
  updated_at?: string;
  seller?: BayConsultSeller | null;
}

export interface BayConsultPage {
  items: BayConsult[];
  next_cursor: string | null;
}

export interface BayConsultBookResult {
  contract?: { id: string } | null;
  thread_id?: string | null;
}

export interface BayDomain {
  key: string;
  name_zh: string;
  name_en: string;
  summary: string;
  gated: boolean;
  ask_placeholder?: string;
  forbidden_hint?: string;
  answer_disclaimer?: string;
}

export interface BayDomainPrompts {
  ask_placeholder: string;
  forbidden_hint: string;
  answer_disclaimer: string;
}

export async function listBayConsults(
  params: { domain?: string; category?: string; cursor?: string | null; limit?: number } = {},
): Promise<BayConsultPage> {
  if (params.domain && isRestrictedDomain(params.domain)) return { items: [], next_cursor: null };
  const page = await bayGet<BayConsultPage>(
    `/v1/talent/consults${bayQuery({
      domain: params.domain,
      category_slug: params.category,
      cursor: params.cursor || undefined,
      limit: params.limit,
    })}`,
    { anonymous: true },
  );
  return { items: withoutRestricted(page?.items || []), next_cursor: page?.next_cursor || null };
}

export function getBayConsult(id: string): Promise<{ consult: BayConsult }> {
  return bayGet<{ consult: BayConsult }>(`/v1/talent/consults/${encodeURIComponent(id)}`, { anonymous: true });
}

/** 受限领域的答疑：界面只显示「不可用」，不显示价格、不给预约。 */
export function consultUnavailable(consult: Pick<BayConsult, "regulated_domain"> | null | undefined): boolean {
  return Boolean(consult) && isRestrictedDomain(consult?.regulated_domain);
}

export function bookBayConsult(id: string, note?: string): Promise<BayConsultBookResult> {
  return bayPost<BayConsultBookResult>(`/v1/talent/consults/${encodeURIComponent(id)}/book`, note ? { note } : {});
}

export async function listBayDomains(): Promise<BayDomain[]> {
  const data = await bayGet<{ domains?: BayDomain[] }>("/v1/talent/domains", { anonymous: true });
  return (data?.domains || []).filter((item) => Boolean(item?.key) && !isRestrictedDomain(item.key));
}

export function getBayDomainPrompts(key: string): Promise<BayDomainPrompts> {
  return bayGet<BayDomainPrompts>(`/v1/talent/domains/${encodeURIComponent(key)}/prompts`, { anonymous: true });
}

/** 域对象上带全了三段文案就直接用；否则返回 null，由调用方去 prompts 端点取。 */
export function inlineDomainPrompts(domain: BayDomain | null | undefined): BayDomainPrompts | null {
  if (!domain) return null;
  const { ask_placeholder, forbidden_hint, answer_disclaimer } = domain;
  if (!ask_placeholder || !forbidden_hint || !answer_disclaimer) return null;
  return { ask_placeholder, forbidden_hint, answer_disclaimer };
}
