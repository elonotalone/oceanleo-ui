"use client";

// 「我发布的 / 我卖出的 / 我买到的 / 我的收藏」里标类别的一套：成品文件、人工服务、作品、课程、其他。
// 标签（每行右边）与顶上的选择条用的是同一份名字，所以两边永远对得上。
import { useUI } from "../../../i18n/ui/useUI";

export type PublishedCategory = "digital" | "service" | "app" | "lesson" | "other";

export const PUBLISHED_CATEGORIES: readonly PublishedCategory[] = ["digital", "service", "app", "lesson", "other"];

export const PUBLISHED_CATEGORY_LABEL: Readonly<Record<PublishedCategory, string>> = {
  digital: "成品文件",
  service: "人工服务",
  app: "作品",
  lesson: "课程",
  other: "其他",
};

export function PublishedCategoryTag({ category }: { category: PublishedCategory }) {
  const tt = useUI();
  return (
    <span data-bay-listing-kind={category} className="shrink-0 rounded-md bg-stone-100 px-2 py-0.5 text-[12px] font-medium text-stone-600">
      {tt(PUBLISHED_CATEGORY_LABEL[category])}
    </span>
  );
}
