"use client";

// 右侧栏里的 LeoBay 浏览：搜索、供给/需求、类目下拉、一行一条信息流。
import type { ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BayFeed, BayViewSwitch, openMine, startPublish, useBayCategoryName, useBaySearchText } from "../shell/BayList";
import { BAY_ADVICE_ZONE } from "../shell/bay-links";
import { BayGlyph } from "../shell/bay-icons";
import { setBayFilter, useBayFilter } from "../shell/bay-state";
import { useBayCategories } from "../shell/use-bay-data";

export interface PanelBrowseProps {
  siteKey: string;
}

const BTN =
  "inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-1.5 text-[13px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)]";
const BTN_QUIET = `${BTN} text-stone-600 hover:bg-stone-100 hover:text-stone-900`;
const BTN_PRIMARY = `${BTN} bg-stone-900 text-white hover:bg-stone-800`;

export function PanelBrowse({ siteKey }: PanelBrowseProps): ReactElement {
  void siteKey;
  const tt = useUI();
  const filter = useBayFilter();
  const search = useBaySearchText(filter);
  const { categories } = useBayCategories();
  const name = useBayCategoryName();

  return (
    <section data-bay-panel="browse" className="flex h-full min-h-0 flex-col overflow-y-auto p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-stone-900"
          data-bay-panel-search
        >
          <BayGlyph name="search" className="h-3.5 w-3.5 shrink-0 text-stone-400" />
          <input
            type="search"
            value={search.text}
            maxLength={60}
            placeholder={tt("搜素材、服务、需求…")}
            aria-label={tt("搜索")}
            onChange={(event) => search.change(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) search.commit(event.currentTarget.value);
            }}
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] outline-none placeholder:text-stone-400 focus-visible:ring-2 focus-visible:ring-stone-300"
          />
        </label>
        <button type="button" onClick={openMine} data-bay-action="mine" className={BTN_QUIET}>
          {tt("我的")}
        </button>
        <button type="button" onClick={() => startPublish(filter.category)} data-bay-action="publish" className={BTN_PRIMARY}>
          {tt("发布")}
        </button>
      </div>
      <div className="mt-3">
        <BayViewSwitch filter={filter} />
      </div>
      <label className="mt-3 flex items-center gap-2 text-[12px] text-stone-500">
        <span>{tt("类目")}</span>
        <select
          data-bay-panel-category
          value={filter.category ?? ""}
          onChange={(event) => setBayFilter({ ...filter, category: event.target.value || undefined })}
          className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[13px] text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-300"
        >
          <option value="">{tt("全部类目")}</option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {name(category)}
            </option>
          ))}
          {filter.kind !== "demand" ? <option value={BAY_ADVICE_ZONE}>{tt("专业咨询")}</option> : null}
        </select>
      </label>
      <div className="mt-3">
        <BayFeed filter={filter} activeKey={null} variant="list" />
      </div>
    </section>
  );
}
