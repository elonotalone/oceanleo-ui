import { useEffect, useState } from "react";
import type { UITranslate } from "../../../i18n/ui/useUI";
import { bayGet } from "../../../lib/bay/http";
import type { BayCategoriesResponse, BayCategory } from "../../../lib/bay/types";

let cached: BayCategoriesResponse | null = null;
let inflight: Promise<BayCategoriesResponse | null> | null = null;
const listeners = new Set<() => void>();

export function loadNeedCategories(): Promise<BayCategoriesResponse | null> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = bayGet<BayCategoriesResponse>("/v1/talent/categories", { anonymous: true })
      .then((response) => {
        cached = response;
        for (const listener of listeners) listener();
        return response;
      })
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function resetNeedCategoriesForTests(next: BayCategoriesResponse | null = null): void {
  cached = next;
  inflight = null;
}

function rowsOf(response: BayCategoriesResponse | null | undefined): BayCategory[] {
  if (!response) return [];
  if (Array.isArray(response.flat_items) && response.flat_items.length) return response.flat_items;
  const rows: BayCategory[] = [];
  for (const item of response.items || []) {
    rows.push(item);
    for (const child of item.children || []) rows.push(child);
  }
  return rows;
}

/** 需求与求助只列交付类目；答疑类目（含医疗、法律、宠物医疗）一律不出现。 */
export function deliveryCategories(response: BayCategoriesResponse | null | undefined): BayCategory[] {
  return rowsOf(response)
    .filter(
      (row) =>
        Boolean(row?.slug) &&
        row.catalog_kind === "delivery" &&
        row.published !== false &&
        (!row.regulated_domain || row.regulated_domain === "none"),
    )
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

/** 这个站的默认类目，读接口的 `site_defaults`；门户为 null（用户必须自己选）。 */
export function defaultNeedCategory(
  siteKey: string,
  response: BayCategoriesResponse | null | undefined,
): string | null {
  const slug = response?.site_defaults?.[siteKey] ?? null;
  if (!slug) return null;
  return deliveryCategories(response).some((row) => row.slug === slug) ? slug : null;
}

export function categoryName(tt: UITranslate, row: Pick<BayCategory, "slug" | "name_zh"> | null | undefined): string {
  if (!row) return "";
  return row.name_zh ? tt(row.name_zh) : row.slug;
}

export function categoryNameBySlug(
  tt: UITranslate,
  slug: string | null | undefined,
  response: BayCategoriesResponse | null | undefined,
): string {
  if (!slug) return "";
  const row = rowsOf(response).find((item) => item.slug === slug);
  return row ? categoryName(tt, row) : slug;
}

export function useNeedCategories(): {
  response: BayCategoriesResponse | null;
  categories: BayCategory[];
  loading: boolean;
} {
  const [response, setResponse] = useState<BayCategoriesResponse | null>(cached);
  const [loading, setLoading] = useState(!cached);
  useEffect(() => {
    let alive = true;
    const sync = () => {
      if (alive && cached) setResponse(cached);
    };
    listeners.add(sync);
    void loadNeedCategories().then((next) => {
      if (!alive) return;
      setResponse(next);
      setLoading(false);
    });
    return () => {
      alive = false;
      listeners.delete(sync);
    };
  }, []);
  return { response, categories: deliveryCategories(response), loading };
}
