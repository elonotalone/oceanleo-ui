"use client";

/**
 * 素材库工具条上的类型筛选。两种形态、同一份取值：探索页用多选 chips，抽屉用紧凑
 * 下拉。两者的 DOM 契约（`data-material-type-chip`、`aria-pressed`、`aria-label`）
 * 与拆出来之前逐字相同。
 *
 * 从 `material-library-view.tsx` 拆出来只有一个原因：那个文件贴着 800 行硬顶
 * （`material-library-scope.test.mjs`），而这一段是纯展示、没有任何状态。
 */

import { useId } from "react";
import { useUI } from "../i18n/ui/useUI";
import { ARTIFACT_TYPES, type ArtifactType } from "./artifact-contract";
import type {
  ExploreArtifactClass,
  ExploreClassChip,
} from "./explore-artifact-class";
import { MATERIAL_TAXONOMY_LABEL } from "./material-library-controller";
import {
  MATERIAL_SCENE_ALL_ID,
  MATERIAL_SCENE_OTHER_ID,
  type MaterialSceneChip,
  type SceneSelection,
} from "./material-scene-axis";

const CHIP_BASE = "min-h-8 rounded-full border px-2.5 text-[11px]";
const CHIP_ON = "border-transparent bg-[var(--fg,#292524)] text-white";
const CHIP_OFF =
  "border-[var(--border,#e7e5e4)] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]";

function chipIdToSelection(id: string): SceneSelection {
  if (id === MATERIAL_SCENE_ALL_ID) return null;
  if (id === MATERIAL_SCENE_OTHER_ID) return "";
  return id;
}

function selectionToChipId(selected: SceneSelection): string {
  if (selected === null) return MATERIAL_SCENE_ALL_ID;
  if (selected === "") return MATERIAL_SCENE_OTHER_ID;
  return selected;
}

/**
 * 素材的**主分区轴 = 站点 app 目录的场景词**（D2）。原来那排原始 appId chips
 * （`ad-copy 4` / `xhs-note 4`）已下线：读者在工作台看到的是「学术教育 / 职场精选…」，
 * 探索页必须是同一套分区。
 *
 * `null` 是「全部」，`""` 是「其它」，两者必须区分得开，所以选中态不是空字符串哨兵。
 * 场景词是站点自己的分类文案，不是共享包 UI 文案，所以不过 `tt`。
 */
export function MaterialSceneFilter({
  chips,
  selected,
  onSelect,
}: {
  chips: readonly MaterialSceneChip[];
  selected: SceneSelection;
  onSelect: (scene: SceneSelection) => void;
}) {
  const tt = useUI();
  const activeId = selectionToChipId(selected);
  return (
    <div
      role="group"
      aria-label={tt("素材场景分区")}
      data-material-scene-axis="true"
      className="flex flex-wrap items-center gap-1"
    >
      {chips.map((chip) => {
        const pressed = chip.id === activeId;
        const builtin =
          chip.id === MATERIAL_SCENE_ALL_ID ||
          chip.id === MATERIAL_SCENE_OTHER_ID;
        return (
          <button
            key={chip.id}
            type="button"
            aria-pressed={pressed}
            data-material-scene-chip={chip.id}
            onClick={() => onSelect(chipIdToSelection(chip.id))}
            className={`${CHIP_BASE} ${pressed ? CHIP_ON : CHIP_OFF}`}
          >
            {builtin ? tt(chip.label) : chip.label}
            <span className="ml-1 opacity-60">{chip.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 探索页最上面那一轴：**可玩游戏 ｜ 游戏素材**（本轮合同 §0 P1/P2）。
 *
 * 它比场景分区轴更高一级，因为两类的**呈现模式**本身不同（可玩那一类是整屏竖向
 * feed，素材那一类是网格货架），不是同一种布局下的两组筛选。取值来自
 * `exploreClassChips()`：可玩那一格只在真的有可玩作品时才出现，所以其余 35 站的
 * 探索页上根本不会多出这一轴。
 */
export function ExploreClassFilter({
  chips,
  selected,
  onSelect,
}: {
  chips: readonly ExploreClassChip[];
  selected: ExploreArtifactClass;
  onSelect: (artifactClass: ExploreArtifactClass) => void;
}) {
  const tt = useUI();
  return (
    <div
      role="tablist"
      aria-label={tt("探索分类")}
      data-explore-class-axis="true"
      className="flex flex-wrap items-center gap-1"
    >
      {chips.map((chip) => {
        const current = chip.id === selected;
        return (
          <button
            key={chip.id}
            type="button"
            role="tab"
            aria-selected={current}
            data-explore-class-chip={chip.id}
            data-explore-class-render-mode={chip.renderMode}
            onClick={() => onSelect(chip.id)}
            className={`${CHIP_BASE} ${current ? CHIP_ON : CHIP_OFF}`}
          >
            {tt(chip.label)}
            <span className="ml-1 opacity-60">{chip.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** `?app=` 锚点的可清除指示，不是分区轴：一颗，不是一排。 */
export function MaterialAppAnchorChip({
  appId,
  label,
  onClear,
}: {
  appId: string;
  label: string;
  onClear: () => void;
}) {
  const tt = useUI();
  return (
    <button
      type="button"
      data-material-app-anchor={appId}
      onClick={onClear}
      aria-label={tt(`取消只看「${label || appId}」的筛选`)}
      className={`${CHIP_BASE} ${CHIP_ON}`}
    >
      {label || appId}
      <span className="ml-1 opacity-60" aria-hidden="true">
        ×
      </span>
    </button>
  );
}

/**
 * 次级筛选（D2：13 个 artifactType chips 从第一层降为次级）。
 *
 * `availableTypes` 给了就只铺货架上真实存在的类型 + 已选中的类型：站点不再声明
 * `types`，铺满 13 颗里有 11 颗点了必空，那不是筛选而是噪音。
 */
export function MaterialTypeFilter({
  multiSelect,
  selectedTypes,
  onApplyTypes,
  availableTypes,
}: {
  multiSelect: boolean;
  selectedTypes: readonly ArtifactType[];
  onApplyTypes: (types: ArtifactType[]) => void;
  availableTypes?: readonly ArtifactType[];
}) {
  const tt = useUI();
  const taxonomyId = useId();
  const offered = availableTypes
    ? ARTIFACT_TYPES.filter(
        (type) =>
          availableTypes.includes(type) || selectedTypes.includes(type),
      )
    : ARTIFACT_TYPES;
  if (!multiSelect) {
    const taxonomy: ArtifactType | "" =
      selectedTypes.length === 1 ? selectedTypes[0] : "";
    return (
      <>
        <label className="sr-only" htmlFor={taxonomyId}>
          {tt("货架")}
        </label>
        <select
          id={taxonomyId}
          value={taxonomy}
          onChange={(event) => {
            const next = event.currentTarget.value as ArtifactType | "";
            onApplyTypes(next ? [next] : []);
          }}
          aria-label={tt("货架")}
          className="min-h-8 rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 text-[11px] text-[var(--fg-2,#57534e)]"
        >
          <option value="">{tt("全部类型")}</option>
          {offered.map((type) => (
            <option key={type} value={type}>
              {tt(MATERIAL_TAXONOMY_LABEL[type])}
            </option>
          ))}
        </select>
      </>
    );
  }
  return (
    <div
      role="group"
      aria-label={tt("货架")}
      className="flex flex-wrap items-center gap-1"
    >
      <button
        type="button"
        aria-pressed={selectedTypes.length === 0}
        onClick={() => onApplyTypes([])}
        className={`min-h-8 rounded-full border px-2.5 text-[11px] ${
          selectedTypes.length === 0
            ? "border-transparent bg-[var(--fg,#292524)] text-white"
            : "border-[var(--border,#e7e5e4)] text-[var(--fg-2,#57534e)]"
        }`}
      >
        {tt("全部类型")}
      </button>
      {offered.map((type) => (
        <button
          key={type}
          type="button"
          aria-pressed={selectedTypes.includes(type)}
          data-material-type-chip={type}
          onClick={() =>
            onApplyTypes(
              selectedTypes.includes(type)
                ? selectedTypes.filter((value) => value !== type)
                : [...selectedTypes, type],
            )
          }
          className={`min-h-8 rounded-full border px-2.5 text-[11px] ${
            selectedTypes.includes(type)
              ? "border-transparent bg-[var(--fg,#292524)] text-white"
              : "border-[var(--border,#e7e5e4)] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#fafaf9)]"
          }`}
        >
          {tt(MATERIAL_TAXONOMY_LABEL[type])}
        </button>
      ))}
    </div>
  );
}
