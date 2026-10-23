"use client";

import { getBayService } from "../../../lib/bay/services";
import { categoryOfListingKind } from "./mine-category";
import type { PublishedCategory } from "./PublishedCategoryTag";
import { mineCoverUrl } from "./mine-trade-model";

export { categoryOfListingKind };
export { useMineBundle, type MinePaneProps } from "./mine-bundle";

export async function loadServiceCategories(ids: string[]): Promise<Record<string, PublishedCategory>> {
  const cards = await loadServiceCards(ids);
  return Object.fromEntries(Object.entries(cards).map(([id, card]) => [id, card.category]));
}

/** 订单本身不带图片；复用原有服务读取，一次取回类别与可用封面。 */
export async function loadServiceCards(ids: string[]): Promise<Record<string, { category: PublishedCategory; coverUrl?: string }>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return {};
  const pairs = await Promise.all(
    unique.slice(0, 60).map((id) =>
      getBayService(id).then(
        (row) => [id, { category: categoryOfListingKind(row.service?.listing_kind), coverUrl: mineCoverUrl(row.service) }] as const,
        () => [id, { category: "service" as PublishedCategory }] as const,
      ),
    ),
  );
  return Object.fromEntries(pairs);
}
