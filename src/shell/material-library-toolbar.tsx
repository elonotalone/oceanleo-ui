"use client";

/**
 * 素材货架工具条：层级标签、分区轴、`?app=` 锚点、次级类型筛选、继续加载与重试。
 *
 * 纯展示 —— 所有状态都由 `material-library-view.tsx` 传进来。拆出来的唯一原因是
 * 那个文件贴着 800 行硬顶（`material-library-scope.test.mjs` 在管），而分区轴换掉
 * 原来那排 appId chips 之后它又长了一截。DOM 契约（`data-material-library-section`、
 * `data-material-scene-chip`、`data-material-type-chip`、`data-material-shelf-state`）
 * 与拆出来之前逐字相同。
 */

import type { ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { ArtifactType } from "./artifact-contract";
import type { ExploreClassAxis } from "./explore-artifact-class";
import type { MaterialLibraryLevel } from "./material-library-controller";
import { materialLevelLabel } from "./material-library-presentation";
import {
  ExploreClassFilter,
  MaterialAppAnchorChip,
  MaterialSceneFilter,
  MaterialTypeFilter,
} from "./material-library-type-filter";
import type {
  MaterialSceneChip,
  SceneSelection,
} from "./material-scene-axis";

const TOOLBAR_BUTTON =
  "min-h-8 whitespace-nowrap rounded-lg border px-2.5 text-[11px] font-medium";
const TOOLBAR_BUTTON_ON =
  "border-transparent bg-[var(--fg,#292524)] text-white";
const TOOLBAR_BUTTON_OFF =
  "border-[var(--border,#e7e5e4)] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]";

/**
 * 宿主自备的「完整素材库」外链。`onSeeAll` 给了就拦下导航交给宿主，没给就照 href 走——
 * 从货架搬到这里只为让 `material-library-view.tsx` 守住 800 行硬顶，DOM 与行为不变。
 */
export function MaterialCompleteLibraryLink({
  href,
  label,
  onSeeAll,
}: {
  href: string;
  label: string;
  onSeeAll?: () => void;
}) {
  const tt = useUI();
  return (
    <a
      href={href}
      onClick={(event) => {
        if (!onSeeAll) return;
        event.preventDefault();
        onSeeAll();
      }}
      className={`inline-flex items-center ${TOOLBAR_BUTTON} ${TOOLBAR_BUTTON_OFF}`}
      aria-label={tt("打开完整素材库")}
    >
      {tt(label)} →
    </a>
  );
}

export interface MaterialShelfToolbarProps {
  level: MaterialLibraryLevel;
  sections: readonly MaterialLibraryLevel[];
  /** 宿主显式声明了 `levels` 时出 tab 组；否则维持旧的「← 当前 App」单键形态。 */
  tabbed: boolean;
  lockLevel?: MaterialLibraryLevel;
  onGoToLevel: (level: MaterialLibraryLevel) => void;
  /** 宿主自备的完整素材库外链（`hideSeeAll` 时为 null）。 */
  seeAllControl: ReactNode;
  settled: boolean;
  /**
   * 两类分区轴（可玩游戏 ｜ 游戏素材）。只有探索页会传：这一轴切换的是**呈现模式**，
   * 抽屉里的素材面板没有 feed 那一半，所以不传就整轴不渲染。
   */
  exploreClassAxis?: ExploreClassAxis | null;
  sceneChips?: readonly MaterialSceneChip[];
  scene: SceneSelection;
  onSceneChange: (scene: SceneSelection) => void;
  anchoredAppId?: string;
  anchoredAppLabel?: string;
  onClearAnchor?: () => void;
  multiSelectTypes: boolean;
  selectedTypes: readonly ArtifactType[];
  availableTypes?: readonly ArtifactType[];
  onApplyTypes: (types: ArtifactType[]) => void;
  canLoadMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  retryable: boolean;
  onRetry: () => void;
  /** 已经有卡片时错误降级成一行提示，不抢占整块货架。 */
  inlineFailure?: { title: string; description: string } | null;
}

export function MaterialShelfToolbar({
  level,
  sections,
  tabbed,
  lockLevel,
  onGoToLevel,
  seeAllControl,
  settled,
  exploreClassAxis,
  sceneChips,
  scene,
  onSceneChange,
  anchoredAppId = "",
  anchoredAppLabel = "",
  onClearAnchor,
  multiSelectTypes,
  selectedTypes,
  availableTypes,
  onApplyTypes,
  canLoadMore,
  loadingMore,
  onLoadMore,
  retryable,
  onRetry,
  inlineFailure,
}: MaterialShelfToolbarProps) {
  const tt = useUI();
  const levelControl = tabbed ? (
    <div
      role="tablist"
      aria-label={tt("素材分区")}
      className="flex flex-wrap items-center gap-1"
    >
      {sections.map((section) => (
        <button
          key={section}
          type="button"
          role="tab"
          aria-selected={section === level}
          data-material-library-section={section}
          onClick={() => onGoToLevel(section)}
          className={`${TOOLBAR_BUTTON} ${
            section === level ? TOOLBAR_BUTTON_ON : TOOLBAR_BUTTON_OFF
          }`}
        >
          {tt(materialLevelLabel(section))}
        </button>
      ))}
    </div>
  ) : level === "primary" ? (
    seeAllControl
  ) : lockLevel ? null : (
    <button
      type="button"
      onClick={() => onGoToLevel("primary")}
      className={`${TOOLBAR_BUTTON} ${TOOLBAR_BUTTON_OFF}`}
    >
      ← {tt("当前 App")}
    </button>
  );

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      data-material-shelf-state={settled ? "settled" : "loading"}
    >
      <span
        data-material-library-scope={level}
        className="whitespace-nowrap text-[11px] font-semibold text-[var(--fg,#292524)]"
      >
        {tt(materialLevelLabel(level))}
      </span>
      {sections.length > 1 && levelControl}
      {exploreClassAxis && exploreClassAxis.chips.length > 1 && (
        <ExploreClassFilter
          chips={exploreClassAxis.chips}
          selected={exploreClassAxis.selected}
          onSelect={exploreClassAxis.onSelect}
        />
      )}
      {sceneChips && sceneChips.length > 1 && (
        <MaterialSceneFilter
          chips={sceneChips}
          selected={scene}
          onSelect={onSceneChange}
        />
      )}
      {anchoredAppId && onClearAnchor && (
        <MaterialAppAnchorChip
          appId={anchoredAppId}
          label={anchoredAppLabel}
          onClear={onClearAnchor}
        />
      )}
      {!exploreClassAxis?.hideTypeFilter && (
        <MaterialTypeFilter
          multiSelect={multiSelectTypes}
          selectedTypes={selectedTypes}
          onApplyTypes={onApplyTypes}
          availableTypes={availableTypes}
        />
      )}
      {canLoadMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className={`${TOOLBAR_BUTTON} ${TOOLBAR_BUTTON_OFF} disabled:opacity-50`}
        >
          {tt(loadingMore ? "加载中…" : "继续加载")}
        </button>
      )}
      {retryable && (
        <button
          type="button"
          onClick={onRetry}
          className={`${TOOLBAR_BUTTON} border-amber-500/30 text-amber-700`}
        >
          {tt("重试")}
        </button>
      )}
      {inlineFailure && (
        <span role="alert" className="max-w-md text-[11px] text-rose-700">
          {tt(inlineFailure.title)}：{tt(inlineFailure.description)}
        </span>
      )}
    </div>
  );
}
