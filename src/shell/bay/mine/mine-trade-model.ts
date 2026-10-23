import type { PublishedCategory } from "./PublishedCategoryTag";

export type SearchableMineRow = {
  id: string;
  title: string;
  subtitle?: string;
  category: PublishedCategory;
  amount?: string;
  searchText?: string;
};

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim();
}

/** 所有清单都用同一条搜索规则；多词查询需逐词命中标题、状态、类别或订单号。 */
export function filterMineTradeRows<T extends SearchableMineRow>(
  rows: readonly T[],
  query: string,
  categoryLabel: (category: PublishedCategory) => string,
): T[] {
  const terms = normalized(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [...rows];
  return rows.filter((row) => {
    const text = normalized([row.title, row.subtitle, categoryLabel(row.category), row.amount, row.searchText, row.id].filter(Boolean).join(" "));
    return terms.every((term) => text.includes(term));
  });
}

/** 图片仅使用接口已有地址；无图时清单画相应类别图标。 */
export function mineCoverUrl(record: unknown): string | undefined {
  if (!record || typeof record !== "object") return undefined;
  const row = record as Record<string, unknown>;
  for (const key of ["cover_url", "thumbnail_url", "image_url", "avatar_url"]) {
    const value = row[key];
    if (typeof value === "string" && (/^https?:\/\//i.test(value) || /^\/(?!\/)/.test(value))) return value;
  }
  return undefined;
}
