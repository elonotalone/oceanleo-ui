"use client";

// 右侧栏里的 LeoBay 浏览：第一行搜索 + 「我的」「发布」；第二行种类切换 + 站点下拉（素材栏不放站点）。
import { useMemo, type ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BayAppShelf } from "../apps/BayAppShelf";
import { BayAssetLibrary } from "../asset/BayAssetLibrary";
import { BayLessonShelf } from "../lessons/BayLessonShelf";
import { BayFeed, BayViewSwitch, openMine, startPublish, useBayCategoryName, useBaySearchText } from "../shell/BayList";
import { BayFilterSelect, type BayFilterOption } from "../shell/BayFilterSelect";
import { BAY_ADVICE_ZONE, canonicalBayFeedKind } from "../shell/bay-links";
import { BayCategoryIcon, BayGlyph } from "../shell/bay-icons";
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
  const tt = useUI();
  const filter = useBayFilter();
  const kind = canonicalBayFeedKind(filter.kind);
  const asset = kind === "asset";
  const app = kind === "app";
  const lesson = kind === "lesson";
  const search = useBaySearchText(filter);
  const { categories } = useBayCategories();
  const name = useBayCategoryName();
  const siteOptions = useMemo<BayFilterOption[]>(() => {
    const rows: BayFilterOption[] = categories.map((category) => ({
      value: category.slug,
      label: name(category),
      icon: <BayCategoryIcon name={category.icon} className="h-3.5 w-3.5 shrink-0" />,
    }));
    if (canonicalBayFeedKind(filter.kind) === "service") {
      rows.push({
        value: BAY_ADVICE_ZONE,
        label: tt("专业咨询"),
        icon: <BayCategoryIcon name="advice" className="h-3.5 w-3.5 shrink-0" />,
      });
    }
    return rows;
  }, [categories, filter.kind, name, tt]);

  return (
    <section data-bay-panel="browse" className="flex h-full min-h-0 flex-col overflow-y-auto p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-neutral-900 bg-white px-3 py-1.5 text-stone-900"
          data-bay-panel-search
        >
          <BayGlyph name="search" className="h-3.5 w-3.5 shrink-0 text-stone-400" />
          <input
            type="search"
            value={search.text}
            maxLength={60}
            placeholder={tt("搜素材、服务、作品、课程、需求…")}
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
        <button
          type="button"
          onClick={() => {
            startPublish(filter.category, filter.kind);
          }}
          data-bay-action="publish"
          className={BTN_PRIMARY}
        >
          {tt("发布")}
        </button>
      </div>
      <div className="mt-3 flex flex-nowrap items-center gap-2 overflow-x-auto" data-bay-panel-toolbar>
        <BayViewSwitch filter={filter} />
        {asset ? null : (
          <BayFilterSelect
            label={tt("站点")}
            name="category"
            value={filter.category ?? ""}
            options={siteOptions}
            onChange={(next) => setBayFilter({ ...filter, category: next || undefined })}
            allLabel={tt("全部")}
            searchable
          />
        )}
      </div>
      <div className="mt-3">
        {asset ? (
          <BayAssetLibrary filter={filter} siteKey={siteKey} />
        ) : app ? (
          <BayAppShelf filter={filter} siteKey={siteKey} accent="#0ea5e9" />
        ) : lesson ? (
          <BayLessonShelf filter={filter} siteKey={siteKey} accent="#0ea5e9" />
        ) : (
          <BayFeed filter={filter} activeKey={null} variant="list" />
        )}
      </div>
    </section>
  );
}
