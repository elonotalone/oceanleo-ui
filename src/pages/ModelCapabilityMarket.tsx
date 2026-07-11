"use client";

import { useMemo, useState } from "react";
import type {
  CapabilitySelection,
  CatalogCapability,
  CatalogGroup,
  CatalogModel,
  ModelCatalog,
  ModelTierId,
} from "../lib/auth";
import { modelTierForSelection } from "../lib/model-tier";
import { useUI, type UITranslate } from "../i18n/ui/useUI";

const ALL_PROVIDERS = "__all__";
const HIDE_SELECTED_BADGE_CATEGORIES = new Set(["audio"]);

const num = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function fmt(value: number) {
  const normalized = num(value);
  return (normalized >= 1 ? normalized.toFixed(2) : normalized.toFixed(4))
    .replace(/\.?0+$/, "");
}

function priceText(model: CatalogModel, tt: UITranslate) {
  if (model.unpriced) return tt("免费 / 未公布");
  if (!model.price) return "—";
  if (model.price.billing === "job") {
    const unit = (model.price.unit || "CNY/次").replace("CNY/", "/");
    return `¥${fmt(num(model.price.price_cny_per_unit))} ${unit}`;
  }
  return `输入 ¥${fmt(num(model.price.input_cny_per_m))} · 输出 ¥${fmt(
    num(model.price.output_cny_per_m),
  )} / 百万 token`;
}

function flatten(block: Pick<CatalogGroup, "providers"> | CatalogCapability) {
  return block.providers.flatMap((provider) => provider.models || []);
}

function modelsForProvider(
  block: Pick<CatalogGroup, "providers"> | CatalogCapability,
  provider: string,
) {
  if (provider === ALL_PROVIDERS) return flatten(block);
  return block.providers.find((item) => item.id === provider)?.models || [];
}

function providerLabel(
  provider: string,
  labels: Record<string, string>,
  tt: UITranslate,
) {
  return provider === ALL_PROVIDERS
    ? tt("全部供应商")
    : labels[provider] || provider;
}

function matches(model: CatalogModel, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return [model.label, model.id, model.provider_label, ...model.capability_labels]
    .some((value) => (value || "").toLowerCase().includes(normalized));
}

export function ModelSelectionSummary({
  catalog,
  selection,
  user,
  applyingTier,
  onApplyTier,
}: {
  catalog: ModelCatalog | null;
  selection: CapabilitySelection;
  user: boolean;
  applyingTier: ModelTierId | "";
  onApplyTier: (tier: ModelTierId) => void;
}) {
  const tt = useUI();
  const groups = catalog?.groups || [];
  const [activeCategory, setActiveCategory] = useState(groups[0]?.id || "");
  const [activeCapability, setActiveCapability] = useState(
    groups[0]?.capabilities[0]?.id || "",
  );
  const byKey = useMemo(() => {
    const index = new Map<string, CatalogModel>();
    for (const group of catalog?.groups || []) {
      for (const model of flatten(group)) index.set(model.key, model);
    }
    return index;
  }, [catalog]);
  const currentTier = useMemo(
    () =>
      user
        ? modelTierForSelection(
            selection,
            catalog?.tier_selection || { lite: {}, pro: {}, max: {} },
          )
        : catalog?.default_tier || "pro",
    [catalog, selection, user],
  );

  if (!groups.length) return null;
  const total = Object.values(selection).reduce(
    (sum, capabilities) =>
      sum
      + Object.values(capabilities || {}).reduce(
        (count, models) => count + (models?.length || 0),
        0,
      ),
    0,
  );
  const group = groups.find((item) => item.id === activeCategory) || groups[0];
  const capability =
    group.capabilities.find((item) => item.id === activeCapability)
    || group.capabilities[0];
  const selectedModels = (selection[group.id]?.[capability?.id || ""] || [])
    .map((key) => byKey.get(key))
    .filter((model): model is CatalogModel => Boolean(model));

  return (
    <section className="v-fade-up" style={{ animationDelay: "20ms" }}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-neutral-900">
          {tt("我的模型选择")}
          <span className="ml-2 text-[11px] font-normal text-neutral-400">
            {tt("已选 {n} 个能力模型", { n: total })}
          </span>
        </h2>
        <span className="text-[11px] text-neutral-400">
          {tt("各 OceanLeo 应用会按能力使用你在这里选好的模型")}
        </span>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-neutral-50/70 p-2">
        <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5">
          {(["lite", "pro", "max", "custom"] as const).map((tier) => {
            const active = currentTier === tier;
            const applying = applyingTier === tier;
            const label =
              tier === "custom" ? tt("自定义") : tier[0].toUpperCase() + tier.slice(1);
            return (
              <button
                key={tier}
                type="button"
                disabled={!user || tier === "custom" || !!applyingTier}
                onClick={() => {
                  if (tier !== "custom") onApplyTier(tier);
                }}
                className={[
                  "min-w-[62px] rounded-md px-3 py-1.5 text-[12px] font-medium transition",
                  active
                    ? "bg-neutral-900 text-white shadow-sm"
                    : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800",
                  !user || tier === "custom" || applyingTier
                    ? "disabled:cursor-default"
                    : "",
                ].join(" ")}
              >
                {applying ? tt("应用中…") : label}
              </button>
            );
          })}
        </div>
        <span className="text-[11px] text-neutral-400">
          {currentTier === "lite"
            ? tt("Lite：每项能力 1 个免费或低价模型")
            : currentTier === "max"
              ? tt("Max：旗舰质量优先")
              : currentTier === "custom"
                ? tt("自定义：保留你手动编辑的完整选择")
                : tt("Pro：质量与成本平衡（新用户默认）")}
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-neutral-200">
        <div className="flex flex-col sm:flex-row">
          <div className="shrink-0 border-b border-neutral-100 bg-neutral-50/60 p-2 sm:w-[148px] sm:border-b-0 sm:border-r">
            <div className="flex gap-1.5 overflow-x-auto sm:flex-col sm:gap-1 sm:overflow-visible">
              {groups.map((item) => {
                const selectedCount = Object.values(selection[item.id] || {})
                  .reduce((count, models) => count + (models?.length || 0), 0);
                const active = item.id === group.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(item.id);
                      setActiveCapability(item.capabilities[0]?.id || "");
                    }}
                    className={[
                      "flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition sm:w-full",
                      active
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-600 hover:bg-neutral-200/60",
                    ].join(" ")}
                  >
                    <span>{tt(item.label)}</span>
                    <span className={active ? "text-[11px] text-white/65" : "text-[11px] text-neutral-400"}>
                      ✓{selectedCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="min-w-0 flex-1 p-3">
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {group.capabilities.map((item) => {
                const active = item.id === capability?.id;
                const selectedCount = (selection[group.id]?.[item.id] || []).length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveCapability(item.id)}
                    title={item.description}
                    className={[
                      "shrink-0 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition",
                      active
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300",
                    ].join(" ")}
                  >
                    {tt(item.label)}
                    <span className={active ? "ml-1 text-emerald-200" : "ml-1 text-emerald-600"}>
                      ✓{selectedCount}
                    </span>
                  </button>
                );
              })}
            </div>
            {capability?.description && (
              <p className="mb-2 text-[11px] text-neutral-400">{tt(capability.description)}</p>
            )}
            <div className="max-h-[300px] overflow-y-auto rounded-xl border border-neutral-200">
              {selectedModels.length === 0 ? (
                <p className="px-3.5 py-10 text-center text-[12px] text-neutral-400">
                  {user ? tt("未选择（在下方模型市场选择）") : tt("登录后查看你的选择")}
                </p>
              ) : (
                selectedModels.map((model, index) => (
                  <ModelRow
                    key={model.key}
                    model={model}
                    first={index === 0}
                    showProvider
                    user={false}
                    selected
                    onToggle={() => undefined}
                  />
                ))
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-400">
              {tt("已选 {n} 个能力模型", { n: selectedModels.length })}
              {" · "}
              {tt("OceanLeo 不加价、不抽成")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ModelCapabilityMarket({
  groups,
  globalProviders,
  user,
  savingSelection,
  totalSelected,
  selection,
  isSelected,
  onToggle,
}: {
  groups: CatalogGroup[];
  globalProviders: ModelCatalog["providers"];
  user: boolean;
  savingSelection: string;
  totalSelected: number;
  selection: CapabilitySelection;
  isSelected: (category: string, capability: string, key: string) => boolean;
  onToggle: (category: string, capability: string, key: string) => void;
}) {
  const tt = useUI();
  const labels = useMemo(
    () => Object.fromEntries(globalProviders.map((provider) => [provider.id, provider.label])),
    [globalProviders],
  );
  const providerTabs = useMemo(
    () => [ALL_PROVIDERS, ...globalProviders.map((provider) => provider.id)],
    [globalProviders],
  );
  const [activeCategory, setActiveCategory] = useState(groups[0]?.id || "");
  const [activeCapability, setActiveCapability] = useState(
    groups[0]?.capabilities[0]?.id || "",
  );
  const [activeProvider, setActiveProvider] = useState(ALL_PROVIDERS);
  const [query, setQuery] = useState("");

  const group = groups.find((item) => item.id === activeCategory) || groups[0];
  const capability =
    group?.capabilities.find((item) => item.id === activeCapability)
    || group?.capabilities[0];
  const providerCount = (provider: string) =>
    capability ? modelsForProvider(capability, provider).length : 0;
  const effectiveProvider =
    activeProvider !== ALL_PROVIDERS && providerCount(activeProvider) === 0
      ? ALL_PROVIDERS
      : activeProvider;
  const filtered = (capability
    ? modelsForProvider(capability, effectiveProvider)
    : []
  ).filter((model) => matches(model, query));
  const showProvider = effectiveProvider === ALL_PROVIDERS;
  const saving =
    !!group
    && !!capability
    && savingSelection === `${group.id}:${capability.id}`;

  return (
    <section className="v-fade-up" style={{ animationDelay: "80ms" }}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-neutral-900">
          {tt("模型市场")}
          <span className="ml-2 text-[11px] font-normal text-neutral-400">
            {tt("已选 {n} 个能力模型", { n: totalSelected })}
          </span>
        </h2>
        {saving && <span className="text-[11px] text-neutral-400">{tt("保存中…")}</span>}
      </div>
      <div className="overflow-hidden rounded-2xl border border-neutral-200">
        <div className="flex flex-col sm:flex-row">
          <div className="shrink-0 border-b border-neutral-100 bg-neutral-50/60 p-2 sm:w-[148px] sm:border-b-0 sm:border-r">
            <div className="flex gap-1.5 overflow-x-auto sm:flex-col sm:gap-1 sm:overflow-visible">
              {groups.map((item) => {
                const selectedCount = Object.values(selection[item.id] || {})
                  .reduce((count, models) => count + (models?.length || 0), 0);
                const active = item.id === group?.id;
                const showBadge =
                  selectedCount > 0 && !HIDE_SELECTED_BADGE_CATEGORIES.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveCategory(item.id);
                      setActiveCapability(item.capabilities[0]?.id || "");
                      setQuery("");
                    }}
                    className={[
                      "flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition sm:w-full",
                      active
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-600 hover:bg-neutral-200/60",
                    ].join(" ")}
                  >
                    <span>
                      {tt(item.label)}
                      {showBadge && (
                        <span className={active ? "ml-1 text-emerald-200" : "ml-1 text-emerald-600"}>
                          ✓{selectedCount}
                        </span>
                      )}
                    </span>
                    <span className={active ? "text-[11px] text-white/60" : "text-[11px] text-neutral-400"}>
                      {item.model_count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="min-w-0 flex-1 p-3">
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {(group?.capabilities || []).map((item) => {
                const active = item.id === capability?.id;
                const selectedCount = (selection[group?.id || ""]?.[item.id] || []).length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveCapability(item.id);
                      setQuery("");
                    }}
                    title={item.description}
                    className={[
                      "shrink-0 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition",
                      active
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300",
                    ].join(" ")}
                  >
                    {tt(item.label)}
                    <span className={active ? "ml-1 text-white/65" : "ml-1 text-neutral-400"}>
                      {item.model_count}
                    </span>
                    {selectedCount > 0 && (
                      <span className={active ? "ml-1 text-emerald-200" : "ml-1 text-emerald-600"}>
                        ✓{selectedCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {capability?.description && (
              <p className="mb-2 text-[11px] text-neutral-400">{tt(capability.description)}</p>
            )}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {providerTabs.map((provider) => {
                const count = providerCount(provider);
                const active = provider === effectiveProvider;
                const disabled = provider !== ALL_PROVIDERS && count === 0;
                return (
                  <button
                    key={provider}
                    type="button"
                    disabled={disabled}
                    onClick={() => setActiveProvider(provider)}
                    className={[
                      "rounded-full px-3 py-1 text-[12px] font-medium transition",
                      active
                        ? "bg-neutral-900 text-white"
                        : disabled
                          ? "cursor-not-allowed bg-neutral-50 text-neutral-300"
                          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200",
                    ].join(" ")}
                  >
                    {providerLabel(provider, labels, tt)}
                    <span className={active ? "ml-1 text-white/70" : "ml-1 text-neutral-400"}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tt("在「{category} · {capability}」中搜索模型…", {
                category: group?.label || "",
                capability: capability?.label || "",
              })}
              className="mb-2 w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400"
            />
            <div className="max-h-[400px] overflow-y-auto rounded-xl border border-neutral-200">
              {filtered.length === 0 ? (
                <p className="px-3.5 py-10 text-center text-[12px] text-neutral-400">
                  {query ? tt("没有匹配的模型") : tt("该能力下此供应商暂无模型")}
                </p>
              ) : (
                filtered.map((model, index) => (
                  <ModelRow
                    key={model.key}
                    model={model}
                    first={index === 0}
                    showProvider={showProvider}
                    user={user}
                    selected={
                      !!group
                      && !!capability
                      && isSelected(group.id, capability.id, model.key)
                    }
                    onToggle={() =>
                      group && capability && onToggle(group.id, capability.id, model.key)
                    }
                  />
                ))
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-400">
              {tt("共 {n} 个模型 · 在容器内滚动查看与选择", { n: filtered.length })}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModelRow({
  model,
  first,
  showProvider,
  user,
  selected,
  onToggle,
}: {
  model: CatalogModel;
  first: boolean;
  showProvider: boolean;
  user: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const tt = useUI();
  return (
    <button
      type="button"
      disabled={!user}
      onClick={onToggle}
      className={[
        "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition",
        first ? "" : "border-t border-neutral-100",
        selected ? "bg-neutral-50" : "hover:bg-neutral-50/60",
        user ? "" : "cursor-default",
      ].join(" ")}
    >
      <span
        className={[
          "grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border text-[10px]",
          selected ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-transparent",
        ].join(" ")}
        aria-hidden
      >
        ✓
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-[13px] font-medium text-neutral-900">{model.label}</span>
        {showProvider && (
          <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
            {model.provider_label}
          </span>
        )}
      </span>
      <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-neutral-600">
        {priceText(model, tt)}
      </span>
    </button>
  );
}
