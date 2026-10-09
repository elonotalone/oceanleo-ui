// 「与我的问题相关的服务」（第四波合同 §3.5）：agent 的「找真人」工具让右侧栏里的 LeoBay 显示它。
// 不登录也能调；境内没有这个接口（404）。条目的形状与信息流接口完全相同，只会有服务和答疑两种。
import { bayGet } from "./http";
import type { BayFeedItem } from "./types";

export interface BayRelatedInput {
  /** 关键词，空格分隔；可以是空串。 */
  q: string;
  /** 站 key：这个站类目里的服务排在前面；一个关键词都没中时列这个类目里的服务。 */
  site?: string;
  /** 1–20，缺省 12。 */
  limit?: number;
}

export interface BayRelatedPage {
  items: BayFeedItem[];
  /** `keyword` = 有条目的标题或简介含关键词；`site` = 一个都没中，列的是这个站类目里的服务；`none` = 什么都没有。 */
  match: "keyword" | "site" | "none";
  /** 网关实际用来找的关键词（清洗、截断之后）。 */
  q: string;
  /** 网关认下来的站 key；没给或不认识是 null。 */
  site: string | null;
}

const MATCHES: readonly BayRelatedPage["match"][] = ["keyword", "site", "none"];

export function normalizeBayRelated(raw: unknown): BayRelatedPage {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const items = Array.isArray(body.items)
    ? (body.items.filter(
        (item) =>
          item &&
          typeof item === "object" &&
          typeof (item as { id?: unknown }).id === "string" &&
          ((item as { kind?: unknown }).kind === "service" || (item as { kind?: unknown }).kind === "consult"),
      ) as BayFeedItem[])
    : [];
  const match = MATCHES.find((value) => value === body.match) ?? (items.length ? "keyword" : "none");
  return {
    items,
    match: items.length ? match : "none",
    q: typeof body.q === "string" ? body.q : "",
    site: typeof body.site === "string" && body.site ? body.site : null,
  };
}

export function fetchBayRelated(input: BayRelatedInput, opts?: { signal?: AbortSignal }): Promise<BayRelatedPage> {
  const params = new URLSearchParams();
  const q = typeof input.q === "string" ? input.q.trim().slice(0, 120) : "";
  if (q) params.set("q", q);
  if (input.site) params.set("site", input.site);
  if (typeof input.limit === "number" && Number.isFinite(input.limit)) {
    params.set("limit", String(Math.max(1, Math.min(20, Math.trunc(input.limit)))));
  }
  const text = params.toString();
  return bayGet<unknown>(`/v1/talent/bay/related${text ? `?${text}` : ""}`, { anonymous: true, signal: opts?.signal }).then(
    normalizeBayRelated,
  );
}
