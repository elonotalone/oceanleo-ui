"use client";

import { getBayService } from "../../../lib/bay/services";
import { categoryOfListingKind } from "./mine-category";
import type { PublishedCategory } from "./PublishedCategoryTag";

export { categoryOfListingKind };
export { useMineBundle, type MinePaneProps } from "./mine-bundle";

export async function loadServiceCategories(ids: string[]): Promise<Record<string, PublishedCategory>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return {};
  const pairs = await Promise.all(
    unique.slice(0, 60).map((id) =>
      getBayService(id).then(
        (row) => [id, categoryOfListingKind(row.service?.listing_kind)] as const,
        () => [id, "service" as PublishedCategory] as const,
      ),
    ),
  );
  return Object.fromEntries(pairs);
}
