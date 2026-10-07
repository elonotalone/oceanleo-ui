import { useEffect, useState } from "react";
import type { UITranslate } from "../../../i18n/ui/useUI";
import {
  deliveryCategories as bayDeliveryCategories,
  fetchBayCategories,
  siteDefaultCategory,
} from "../../../lib/bay/categories";
import type { BayCategoriesResponse, BayCategory } from "../../../lib/bay/types";

let latest: BayCategoriesResponse | null = null;

export function primeNeedCategoriesForTests(next: BayCategoriesResponse | null): void {
  latest = next;
}

/** 需求与求助只列交付类目；答疑类目（含医疗、法律、宠物医疗）一律不出现。 */
export function needCategories(response: BayCategoriesResponse | null | undefined): BayCategory[] {
  return bayDeliveryCategories(response).filter(
    (row) => !row.regulated_domain || row.regulated_domain === "none",
  );
}

export function isNeedCategory(slug: string | null | undefined, response: BayCategoriesResponse | null | undefined): boolean {
  return Boolean(slug) && needCategories(response).some((row) => row.slug === slug);
}

/** 这个站的默认类目（接口的 `site_defaults`）；门户为 null，用户必须自己选。 */
export function defaultNeedCategory(
  siteKey: string,
  response: BayCategoriesResponse | null | undefined,
): string | null {
  const slug = siteDefaultCategory(response, siteKey);
  return slug && isNeedCategory(slug, response) ? slug : null;
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
  const rows = response ? (response.flat_items.length ? response.flat_items : response.items) : [];
  const row = rows.find((item) => item.slug === slug);
  return row ? categoryName(tt, row) : slug;
}

export function useNeedCategories(): {
  response: BayCategoriesResponse | null;
  categories: BayCategory[];
  loading: boolean;
} {
  const [response, setResponse] = useState<BayCategoriesResponse | null>(latest);
  const [loading, setLoading] = useState(!latest);
  useEffect(() => {
    let alive = true;
    fetchBayCategories()
      .then((next) => {
        latest = next;
        if (alive) setResponse(next);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  return { response, categories: needCategories(response), loading };
}
