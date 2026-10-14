"use client";

// 「我发布的」每一行右边的类别标签。四类：成品文件（数字素材）、人工服务（服务与答疑）、网站与软件服务（作品）、课程。没有套餐。
import { useUI } from "../../../i18n/ui/useUI";

export type PublishedCategory = "digital" | "service" | "app" | "lesson";

const LABEL: Readonly<Record<PublishedCategory, string>> = {
  digital: "成品文件",
  service: "人工服务",
  app: "网站与软件服务",
  lesson: "课程",
};

export function PublishedCategoryTag({ category }: { category: PublishedCategory }) {
  const tt = useUI();
  return (
    <span data-bay-listing-kind={category} className="shrink-0 rounded-md bg-stone-100 px-2 py-0.5 text-[12px] font-medium text-stone-600">
      {tt(LABEL[category])}
    </span>
  );
}
