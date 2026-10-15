"use client";

// 「我发布的 / 我卖出的 / 我买到的 / 我的收藏」最上方的类别选择条：全部、成品文件、人工服务、作品、课程、其他。
// 选中哪一类，下面的列表只留这一类。状态在 BayMine 里，四个页面共用。
import { useUI } from "../../../i18n/ui/useUI";
import { PUBLISHED_CATEGORIES, PUBLISHED_CATEGORY_LABEL } from "./PublishedCategoryTag";
import type { BayPaneProps } from "../shell/bay-state";

import { type MineCategory } from "./mine-category";

export { type MineCategory };

/** 窗格拿到的类别：默认「全部」。 */
export type MinePaneProps = BayPaneProps & { category?: MineCategory };

export function MineCategoryBar({ value, onChange }: { value: MineCategory; onChange: (next: MineCategory) => void }) {
  const tt = useUI();
  const options: MineCategory[] = ["all", ...PUBLISHED_CATEGORIES];
  return (
    <div role="radiogroup" aria-label={tt("类别")} data-bay-mine-category-bar className="flex flex-wrap gap-1.5 px-4 pt-4">
      {options.map((id) => {
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            data-bay-mine-category={id}
            onClick={() => onChange(id)}
            className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
              active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 text-stone-600 hover:bg-stone-50"
            }`}
          >
            {tt(id === "all" ? "全部" : PUBLISHED_CATEGORY_LABEL[id])}
          </button>
        );
      })}
    </div>
  );
}
