"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  materialCatalogCardMatches,
  materialCatalogCards,
  materialCatalogEntries,
  materialCatalogFacetOptions,
  materialCatalogVariantChips,
  type MaterialCatalogCard,
  type MaterialCatalogVariantChip,
  type MaterialCatalogVariantChoice,
} from "./material-catalog-group";
import {
  EMPTY_MATERIAL_FACET_SELECTION,
  MATERIAL_INDUSTRY_ORDER,
  MATERIAL_INDUSTRY_SUB_LABELS,
  MATERIAL_SHAPE_LABELS,
  MATERIAL_SHAPE_ORDER,
  MATERIAL_SKIN_LABELS,
  MATERIAL_SKIN_ORDER,
  materialFacetRecords,
  materialFacetSelectionActive,
  type MaterialFacetOption,
  type MaterialFacetSelection,
} from "./material-library-facets";
import type { WorkspaceLibraryEntry } from "./workspace-library-model";

const FACET_SELECT =
  "min-h-8 max-w-[13rem] rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2 text-[11px] text-[var(--fg-2,#57534e)]";

const NO_VARIANT_CHOICE: Readonly<Record<string, string>> = {};

interface MaterialFacetFilterState {
  scopeKey: string;
  selection: MaterialFacetSelection;
  /** 每张卡自己选到第几版：键是 `groupKey`，值是变体键。换一站就清空。 */
  variants: Readonly<Record<string, string>>;
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

/**
 * 面板分两段：**行业与子类是货架的轴**，页数与外观只是**标签**。
 *
 * 这个先后不是排版偏好——把外观摆在轴的位置上，用户就会以为「玻璃风」是一个品类，
 * 而它其实只是同一件东西的一层皮。轴在前、标签在后，中间隔一道竖线，读者一眼就知道
 * 前两个决定「看的是什么」，后两个只是「筛一下」。
 */
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
  const hasTags = shapes.length > 0 || skins.length > 0;
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
      {hasTags && (
        <>
          <span
            className="mx-0.5 hidden h-4 w-px bg-[var(--border,#e7e5e4)] sm:block"
            aria-hidden="true"
          />
          <span className="whitespace-nowrap text-[11px] text-[var(--muted,#a8a29e)]">
            {tt("标签")}
          </span>
        </>
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

/**
 * 卡内的「换一个版本」。同一行业子类、同一页数下往往有好几套模板，过去它们各占一张
 * 卡，货架上就是同一个名字连着出现四五次；现在它们收进一张卡，这排小格子是用户看到
 * 其余那几套的唯一入口。
 *
 * 文案只说「版本」，**不说皮肤/风格**：实测同一组里的多行是不同模板（`tpl:` 各不
 * 相同，甚至有同皮肤的两版），叫它「配色」是骗人的。风格仍然只在上面的筛选标签里。
 */
function MaterialVariantSwitch({
  chips,
  onPick,
}: {
  chips: readonly MaterialCatalogVariantChip[];
  onPick: (variantKey: string) => void;
}) {
  const tt = useUI();
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      role="group"
      aria-label={tt("换一个版本")}
    >
      <span className="mr-0.5 text-[10px] text-[var(--muted,#a8a29e)]">
        {tt("版本")}
      </span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onPick(chip.key)}
          aria-pressed={chip.selected}
          aria-label={tt("看第 {n} 个版本，共 {total} 个", {
            n: chip.ordinal,
            total: chips.length,
          })}
          className={`min-h-6 min-w-6 rounded-md border px-1.5 text-[10px] leading-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent,#4f46e5)] ${
 chip.selected
 ? "border-[var(--accent,#4f46e5)] bg-[var(--accent,#4f46e5)] text-white"
 : "border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,#f5f5f4)]"
 }`}
        >
          {chip.ordinal}
        </button>
      ))}
    </div>
  );
}

export interface MaterialFacetShelf {
  entries: WorkspaceLibraryEntry[];
  active: boolean;
  control: ReactNode;
  /**
   * 交给 `WorkspaceLibrary` 的卡内插槽。只有「一组多版」的网站卡会长出内容，
   * 其余卡片返回 `null`，货架的视觉安静不变。
   */
  entryActions?: (entry: WorkspaceLibraryEntry) => ReactNode;
}

/**
 * Website 专用的增量筛选层。其它站 `enabled=false` 时直接返回原数组引用与空控件，
 * 因而共享包的既有卡片、工具条和取数行为都不变。
 *
 * 这一层同时是**分组的唯一装配点**：行先收成卡（`material-catalog-group.ts`），
 * 筛选、计数、出条目全部改在卡这一层做。没有 `group:` 的行一行一卡，
 * 其它品类的货架因此逐字不变。
 */
export function useMaterialLibraryFacets(
  entries: readonly WorkspaceLibraryEntry[],
  options: { enabled: boolean; scopeKey: string },
): MaterialFacetShelf {
  const [state, setState] = useState<MaterialFacetFilterState>({
    scopeKey: options.scopeKey,
    selection: EMPTY_MATERIAL_FACET_SELECTION,
    variants: NO_VARIANT_CHOICE,
  });
  const scoped = state.scopeKey === options.scopeKey;
  const selection = scoped ? state.selection : EMPTY_MATERIAL_FACET_SELECTION;
  const perCard = scoped ? state.variants : NO_VARIANT_CHOICE;
  const records = useMemo(
    () => (options.enabled ? materialFacetRecords(entries) : []),
    [entries, options.enabled],
  );
  const cards = useMemo(() => materialCatalogCards(records), [records]);
  if (!options.enabled) {
    return { entries: entries as WorkspaceLibraryEntry[], active: false, control: null };
  }

  const active = materialFacetSelectionActive(selection);
  const industryCards = selection.industry
    ? cards.filter((card) => card.cover.facets.industry === selection.industry)
    : cards;
  const subjectCards = selection.sub
    ? industryCards.filter((card) => card.cover.facets.sub === selection.sub)
    : industryCards;
  const industries = materialCatalogFacetOptions(
    cards,
    "industry",
    MATERIAL_INDUSTRY_SUB_LABELS,
    MATERIAL_INDUSTRY_ORDER,
  );
  const subs = materialCatalogFacetOptions(
    industryCards,
    "sub",
    MATERIAL_INDUSTRY_SUB_LABELS,
  );
  const shapes = materialCatalogFacetOptions(
    subjectCards,
    "shape",
    MATERIAL_SHAPE_LABELS,
    MATERIAL_SHAPE_ORDER,
  );
  const skins = materialCatalogFacetOptions(
    subjectCards,
    "skin",
    MATERIAL_SKIN_LABELS,
    MATERIAL_SKIN_ORDER,
  );
  const choice: MaterialCatalogVariantChoice = {
    skin: selection.skin,
    perCard,
  };
  const visibleCards = active
    ? cards.filter((card) => materialCatalogCardMatches(card, selection))
    : cards;
  const visibleEntries = materialCatalogEntries(visibleCards, choice);
  // 条目与卡一一对应且同序，所以卡内插槽认「这一屏此刻的行 id」就够，不必再算一次。
  const cardByEntryId = new Map<string, MaterialCatalogCard>();
  visibleCards.forEach((card, index) => {
    const entry = visibleEntries[index];
    if (entry) cardByEntryId.set(String(entry.id), card);
  });
  const showControl =
    industries.length > 0 || shapes.length > 0 || skins.length > 0;
  const change = (key: keyof MaterialFacetSelection, value: string) => {
    setState((current) => {
      const inScope = current.scopeKey === options.scopeKey;
      return {
        scopeKey: options.scopeKey,
        selection: {
          ...(inScope ? current.selection : EMPTY_MATERIAL_FACET_SELECTION),
          [key]: value,
          ...(key === "industry" ? { sub: "" } : {}),
        },
        // 换筛选不清空卡内选过的版本：用户点过「第 3 版」，筛一下行业再回来，
        // 那张卡还该是第 3 版。
        variants: inScope ? current.variants : NO_VARIANT_CHOICE,
      };
    });
  };
  const clear = () => {
    setState({
      scopeKey: options.scopeKey,
      selection: EMPTY_MATERIAL_FACET_SELECTION,
      variants: NO_VARIANT_CHOICE,
    });
  };
  const pickVariant = (groupKey: string, variantKey: string) => {
    setState((current) => {
      const inScope = current.scopeKey === options.scopeKey;
      return {
        scopeKey: options.scopeKey,
        selection: inScope ? current.selection : EMPTY_MATERIAL_FACET_SELECTION,
        variants: {
          ...(inScope ? current.variants : NO_VARIANT_CHOICE),
          [groupKey]: variantKey,
        },
      };
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
        total={cards.length}
        onChange={change}
        onClear={clear}
      />
    ) : null,
    entryActions: (entry) => {
      const card = cardByEntryId.get(String(entry.id));
      if (!card) return null;
      const chips = materialCatalogVariantChips(card, choice);
      if (chips.length === 0) return null;
      return (
        <MaterialVariantSwitch
          chips={chips}
          onPick={(variantKey) => pickVariant(card.groupKey, variantKey)}
        />
      );
    },
  };
}
