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
import { MATERIAL_TAXONOMY_LABEL } from "./material-library-controller";

export function MaterialTypeFilter({
  multiSelect,
  selectedTypes,
  onApplyTypes,
}: {
  multiSelect: boolean;
  selectedTypes: readonly ArtifactType[];
  onApplyTypes: (types: ArtifactType[]) => void;
}) {
  const tt = useUI();
  const taxonomyId = useId();
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
          {ARTIFACT_TYPES.map((type) => (
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
      {ARTIFACT_TYPES.map((type) => (
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
