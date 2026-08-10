"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  EMPTY_MATERIAL_FACET_SELECTION,
  MATERIAL_INDUSTRY_ORDER,
  MATERIAL_INDUSTRY_SUB_LABELS,
  MATERIAL_SHAPE_LABELS,
  MATERIAL_SHAPE_ORDER,
  MATERIAL_SKIN_LABELS,
  MATERIAL_SKIN_ORDER,
  materialFacetCardEntry,
  materialFacetOptions,
  materialFacetRecordMatches,
  materialFacetRecords,
  materialFacetSelectionActive,
  type MaterialFacetOption,
  type MaterialFacetSelection,
} from "./material-library-facets";
import type { WorkspaceLibraryEntry } from "./workspace-library-model";

const FACET_SELECT =
  "min-h-8 max-w-[13rem] rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 text-[11px] text-[var(--fg-2,#57534e)]";

interface MaterialFacetFilterState {
  scopeKey: string;
  selection: MaterialFacetSelection;
}

interface MaterialFacetControlsProps {
  selection: MaterialFacetSelection;
  industries: readonly MaterialFacetOption[];
  subs: readonly MaterialFacetOption[];
  shapes: readonly MaterialFacetOption[];
  skins: readonly MaterialFacetOption[];
  shown: number;
  total: number;
  onChange: (
    key: keyof MaterialFacetSelection,
    value: string,
  ) => void;
  onClear: () => void;
}

function FacetSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: readonly MaterialFacetOption[];
  onChange: (value: string) => void;
}) {
  const tt = useUI();
  return (
    <label className="flex items-center gap-1 text-[11px] text-[var(--muted,#78716c)]">
      <span className="whitespace-nowrap font-medium">{tt(label)}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        className={FACET_SELECT}
        aria-label={tt(label)}
      >
        <option value="">{tt(allLabel)}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {tt(option.label)} ({option.count})
          </option>
        ))}
      </select>
    </label>
  );
}

function MaterialFacetControls({
  selection,
  industries,
  subs,
  shapes,
  skins,
  shown,
  total,
  onChange,
  onClear,
}: MaterialFacetControlsProps) {
  const tt = useUI();
  const active = materialFacetSelectionActive(selection);
  return (
    <div
      className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--surface,#fafaf9)] p-2"
      data-material-facet-filter="website-templates"
    >
      {industries.length > 0 && (
        <FacetSelect
          label="行业"
          allLabel="全部行业"
          value={selection.industry}
          options={industries}
          onChange={(value) => onChange("industry", value)}
        />
      )}
      {selection.industry && subs.length > 0 && (
        <FacetSelect
          label="子类"
          allLabel="全部子类"
          value={selection.sub}
          options={subs}
          onChange={(value) => onChange("sub", value)}
        />
      )}
      {shapes.length > 0 && (
        <FacetSelect
          label="页数"
          allLabel="全部页数"
          value={selection.shape}
          options={shapes}
          onChange={(value) => onChange("shape", value)}
        />
      )}
      {skins.length > 0 && (
        <FacetSelect
          label="外观"
          allLabel="全部外观"
          value={selection.skin}
          options={skins}
          onChange={(value) => onChange("skin", value)}
        />
      )}
      {active && (
        <>
          <span
            className="whitespace-nowrap text-[11px] text-[var(--fg-2,#57534e)]"
            role="status"
            aria-live="polite"
          >
            {tt("筛到 {shown} / {total} 件", { shown, total })}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="min-h-8 rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 text-[11px] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#f5f5f4)]"
          >
            {tt("清除筛选")}
          </button>
        </>
      )}
    </div>
  );
}

export interface MaterialFacetShelf {
  entries: WorkspaceLibraryEntry[];
  active: boolean;
  control: ReactNode;
}

/**
 * Website 专用的增量筛选层。其它站 `enabled=false` 时直接返回原数组引用与空控件，
 * 因而共享包的既有卡片、工具条和取数行为都不变。
 */
export function useMaterialLibraryFacets(
  entries: readonly WorkspaceLibraryEntry[],
  options: { enabled: boolean; scopeKey: string },
): MaterialFacetShelf {
  const [state, setState] = useState<MaterialFacetFilterState>({
    scopeKey: options.scopeKey,
    selection: EMPTY_MATERIAL_FACET_SELECTION,
  });
  const selection =
    state.scopeKey === options.scopeKey
      ? state.selection
      : EMPTY_MATERIAL_FACET_SELECTION;
  const records = useMemo(
    () => (options.enabled ? materialFacetRecords(entries) : []),
    [entries, options.enabled],
  );
  if (!options.enabled) {
    return { entries: entries as WorkspaceLibraryEntry[], active: false, control: null };
  }

  const active = materialFacetSelectionActive(selection);
  const industryRecords = selection.industry
    ? records.filter((record) => record.facets.industry === selection.industry)
    : records;
  const subjectRecords = selection.sub
    ? industryRecords.filter((record) => record.facets.sub === selection.sub)
    : industryRecords;
  const industries = materialFacetOptions(
    records,
    "industry",
    MATERIAL_INDUSTRY_SUB_LABELS,
    MATERIAL_INDUSTRY_ORDER,
  );
  const subs = materialFacetOptions(
    industryRecords,
    "sub",
    MATERIAL_INDUSTRY_SUB_LABELS,
  );
  const shapes = materialFacetOptions(
    subjectRecords,
    "shape",
    MATERIAL_SHAPE_LABELS,
    MATERIAL_SHAPE_ORDER,
  );
  const skins = materialFacetOptions(
    subjectRecords,
    "skin",
    MATERIAL_SKIN_LABELS,
    MATERIAL_SKIN_ORDER,
  );
  const visibleRecords = active
    ? records.filter((record) => materialFacetRecordMatches(record, selection))
    : records;
  const visibleEntries = visibleRecords.map(materialFacetCardEntry);
  const showControl =
    industries.length > 0 || shapes.length > 0 || skins.length > 0;
  const change = (key: keyof MaterialFacetSelection, value: string) => {
    setState((current) => {
      const previous =
        current.scopeKey === options.scopeKey
          ? current.selection
          : EMPTY_MATERIAL_FACET_SELECTION;
      return {
        scopeKey: options.scopeKey,
        selection: {
          ...previous,
          [key]: value,
          ...(key === "industry" ? { sub: "" } : {}),
        },
      };
    });
  };
  const clear = () => {
    setState({
      scopeKey: options.scopeKey,
      selection: EMPTY_MATERIAL_FACET_SELECTION,
    });
  };

  return {
    entries: visibleEntries,
    active,
    control: showControl ? (
      <MaterialFacetControls
        selection={selection}
        industries={industries}
        subs={subs}
        shapes={shapes}
        skins={skins}
        shown={visibleEntries.length}
        total={entries.length}
        onChange={change}
        onClear={clear}
      />
    ) : null,
  };
}
