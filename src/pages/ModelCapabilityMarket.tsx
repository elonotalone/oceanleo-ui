"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createModelGroup,
  deleteModelGroup,
  getModelGroups,
  MODEL_GROUP_CHANGED_EVENT,
  setActiveModelGroup,
  updateModelGroup,
  type CapabilitySelection,
  type CatalogCapability,
  type CatalogModel,
  type CatalogProviderBlock,
  type ModelCatalog,
  type ModelGroup,
  type ModelGroupsPayload,
  type ModelPriceRule,
} from "../lib/auth";
import {
  PROVIDER_DISPLAY_ORDER,
  canSelect,
  checkedAgo,
  groupOffers,
  matchesModel,
} from "../lib/model-search";
import { currencySymbol } from "../lib/money";
import { useUI, type UITranslate } from "../i18n/ui/useUI";
import { ConfirmDialog, FloatingMenu, FloatingMenuItem } from "../ui";
import { BYOK_STATUS_CHANGED_EVENT } from "../shell/byok-status";

const ALL_PROVIDERS = "__all__";

function offerProviderKey(model: CatalogModel): string {
  return model.connection_id ? `connection:${model.connection_id}` : model.provider;
}

function capabilityProviders(capability: CatalogCapability | undefined, connections: ModelCatalog["configured_connections"]) {
  const providers = new Map<string, { id: string; label: string }>();
  for (const connection of connections || []) {
    const id = `connection:${connection.connection_id}`;
    providers.set(id, { id, label: connection.display_name });
  }
  for (const block of capability?.providers || []) {
    // Personal connections belong to their named account, even when several
    // accounts use the same vendor. Keep their filters and routing distinct.
    if (!block.models.length || block.models.some(model => !model.connection_id)) {
      providers.set(block.id, { id: block.id, label: block.label });
    }
    for (const model of block.models) {
      if (!model.connection_id) continue;
      const id = offerProviderKey(model);
      providers.set(id, { id, label: model.connection_name || model.display_name || block.label });
    }
  }
  return [...providers.values()];
}

function cloneSelection(selection: CapabilitySelection): CapabilitySelection {
  return Object.fromEntries(
    Object.entries(selection || {}).map(([category, capabilities]) => [
      category,
      Object.fromEntries(
        Object.entries(capabilities || {}).map(([capability, keys]) => [
          capability,
          [...(keys || [])],
        ]),
      ),
    ]),
  );
}

function presetGroups(catalog: ModelCatalog | null): ModelGroup[] {
  return (["lite", "pro", "max"] as const).map((tier) => ({
    key: `preset:${tier}`,
    id: tier,
    kind: "preset",
    name: tier[0].toUpperCase() + tier.slice(1),
    editable: false,
    selection: cloneSelection(catalog?.tier_selection?.[tier] || {}),
  }));
}

function flatten(block: CatalogCapability) {
  return block.providers.flatMap((provider) => provider.models || []);
}

export type EmptyCapabilityReason =
  | "not_opened"
  | "byok_only"
  | "no_adapter"
  | "unpriced"
  | "none";

const EMPTY_REASON_PRIORITY: readonly EmptyCapabilityReason[] = [
  "not_opened",
  "byok_only",
  "no_adapter",
  "unpriced",
  "none",
];

function offerStatus(model: { status?: string; unpriced?: boolean }): string {
  if (model.status) return model.status;
  return model.unpriced ? "unpriced" : "";
}

function dominantEmptyReason(
  models: readonly { status?: string; unpriced?: boolean }[],
): EmptyCapabilityReason {
  const counts: Record<EmptyCapabilityReason, number> = {
    not_opened: 0,
    byok_only: 0,
    no_adapter: 0,
    unpriced: 0,
    none: 0,
  };
  for (const model of models) {
    const status = offerStatus(model);
    if (status === "not_opened") counts.not_opened += 1;
    else if (status === "byok_only") counts.byok_only += 1;
    else if (status === "no_adapter") counts.no_adapter += 1;
    else if (status === "unpriced") counts.unpriced += 1;
  }
  return EMPTY_REASON_PRIORITY.reduce((best, current) =>
    counts[current] > counts[best] ? current : best,
  );
}

/** Empty only when nothing is selectable; then the dominant unavailable status. */
export function emptyCapabilityReason(
  capability: CatalogCapability | undefined,
  byokProviders: readonly string[] = [],
): EmptyCapabilityReason {
  const models = capability ? flatten(capability) : [];
  if (models.some((model) => canSelect(model, byokProviders))) return "none";
  if (!models.length) return "none";
  return dominantEmptyReason(models);
}

export function emptyCategoryReason(
  capabilities: CatalogCapability[] | undefined,
  byokProviders: readonly string[] = [],
): EmptyCapabilityReason {
  const models = (capabilities || []).flatMap((item) => flatten(item));
  if (models.some((model) => canSelect(model, byokProviders))) return "none";
  if (!models.length) return "none";
  return dominantEmptyReason(models);
}

export function partitionOfferModels<T extends { provider?: string; status?: string; selectable?: boolean }>(
  models: readonly T[],
  byokProviders: readonly string[] = [],
): { selectable: T[]; unavailable: T[] } {
  const selectable: T[] = [];
  const unavailable: T[] = [];
  for (const model of models) {
    if (canSelect(model, byokProviders)) selectable.push(model);
    else unavailable.push(model);
  }
  return { selectable, unavailable };
}

function flattenProviders(providers: CatalogProviderBlock[] | undefined) {
  return (providers || []).flatMap((provider) => provider.models || []);
}

function allCatalogModels(catalog: ModelCatalog | null): CatalogModel[] {
  const byKey = new Map<string, CatalogModel>();
  for (const group of catalog?.groups || []) {
    for (const model of flattenProviders(group.providers)) {
      if (model.key) byKey.set(model.key, model);
    }
    for (const capability of group.capabilities || []) {
      for (const model of flatten(capability)) {
        if (model.key) byKey.set(model.key, model);
      }
    }
  }
  return [...byKey.values()];
}

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  available: "可用",
  not_opened: "平台暂未开通",
  unpriced: "价未公布",
  byok_only: "需自带 Key",
  no_adapter: "暂不支持调用",
  delisted: "已下架",
};

function statusLabel(
  status: string | undefined,
  catalog: ModelCatalog | null,
  tt: UITranslate,
) {
  if (!status) return "";
  const known = DEFAULT_STATUS_LABELS[status];
  if (known) return tt(known);
  const raw = catalog?.status_labels?.[status] || status;
  return tt(raw);
}

function applyDraftToPayload(
  payload: ModelGroupsPayload,
  groupId: string,
  groupKey: string,
  draft: CapabilitySelection,
): ModelGroupsPayload {
  const saved = (payload as ModelGroupsPayload & { group?: ModelGroup }).group;
  return {
    ...payload,
    groups: (payload.groups || []).map((item) => {
      if (item.id !== groupId && item.key !== groupKey) return item;
      const source =
        saved && (saved.id === item.id || saved.key === item.key) ? saved : item;
      return {
        ...source,
        selection: draft,
      };
    }),
  };
}

function checkedAgoText(iso: string | undefined, tt: UITranslate, now?: Date) {
  if (!iso) return "";
  const ago = checkedAgo(iso, now || new Date());
  const key =
    ago.unit === "minute"
      ? "{n} 分钟前核对过"
      : ago.unit === "hour"
        ? "{n} 小时前核对过"
        : "{n} 天前核对过";
  return tt(key, { n: ago.n });
}

function formatRuleLine(rule: ModelPriceRule, currency: string, tt: UITranslate) {
  const label = rule.label ? tt(rule.label) : "";
  const detail = rule.detail ? tt(rule.detail) : "";
  let prices = "";
  if (rule.input_per_m != null || rule.output_per_m != null) {
    const input = rule.input_per_m != null ? money(num(rule.input_per_m), currency) : "";
    const output = rule.output_per_m != null ? money(num(rule.output_per_m), currency) : "";
    if (input && output) prices = `${input} / ${output}`;
    else if (output) prices = tt("输出 {output}", { output });
    else prices = input;
  } else if (rule.price_per_unit != null) {
    prices = money(num(rule.price_per_unit), currency);
  }
  return [label, detail, prices].filter(Boolean).join(" ");
}

type SelectedRow =
  | { kind: "live"; key: string; model: CatalogModel }
  | { kind: "delisted"; key: string; label: string };

function resolveSelectedRows(
  keys: string[],
  byKey: Map<string, CatalogModel>,
  catalog: ModelCatalog | null,
  group: ModelGroup | undefined,
): SelectedRow[] {
  const entries = group?.entries || group?.items || [];
  return keys.map((key) => {
    const model = byKey.get(key);
    if (model) return { kind: "live" as const, key, model };
    const entry = entries.find((item) => item.key === key);
    const delisted = catalog?.delisted?.find((item) => item.key === key);
    const fromEntry = entry?.status === "delisted" ? entry.label : "";
    const label =
      fromEntry
      || delisted?.label
      || (key.includes(":") ? key.slice(key.indexOf(":") + 1) : key);
    return { kind: "delisted" as const, key, label };
  });
}

const num = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function fmt(value: number) {
  const normalized = num(value);
  return (normalized >= 1 ? normalized.toFixed(2) : normalized.toFixed(4))
    .replace(/\.?0+$/, "");
}

/** `fmt` 去掉了尾零，所以符号在这里自己拼：符号 + 数字，不走 formatMoney 的定长小数。 */
function money(value: number, currency: string) {
  return `${currencySymbol(currency)}${fmt(value)}`;
}

function priceText(model: CatalogModel, tt: UITranslate) {
  if (model.connection_id) return "";
  if (model.unpriced || model.status === "unpriced") return tt("价未公布");
  if (!model.price) return "—";
  // 价格所在货币由网关的 pricing 元数据决定（.cn = CNY、.com = USD）；没说就是 CNY。
  const currency = model.price.currency || "CNY";
  const current = model.price.current;
  const applied = (current?.applied || []).filter(Boolean);
  const appliedText = applied.length
    ? ` ${applied.map((label) => tt(label)).join(" ")}`
    : "";
  if (model.price.billing === "job") {
    // 网关的单位标签形如 "USD/次" / "CNY/1M tokens"；货币码已由符号表达，这里只留 "/次"。
    const unit = (model.price.unit || `${currency}/次`).replace(/^[A-Z]{3}\//, "/");
    const value = num(
      current?.price_per_unit ?? model.price.price_per_unit ?? model.price.price_cny_per_unit,
    );
    return `${money(value, currency)} ${unit}${appliedText}`;
  }
  return `${tt("输入 {input} · 输出 {output} / 百万 token", {
    input: money(
      num(current?.input_per_m ?? model.price.input_per_m ?? model.price.input_cny_per_m),
      currency,
    ),
    output: money(
      num(current?.output_per_m ?? model.price.output_per_m ?? model.price.output_cny_per_m),
      currency,
    ),
  })}${appliedText}`;
}

function fallbackLabel(index: number, tt: UITranslate) {
  return index === 0 ? tt("主用") : tt("备用 {n}", { n: index });
}

export function ModelGroupManager({
  catalog,
  user,
  initialMarketQuery = "",
  onSetupByok,
}: {
  catalog: ModelCatalog | null;
  user: boolean;
  initialMarketQuery?: string;
  onSetupByok?: (connectionId?: string) => void;
}) {
  const tt = useUI();
  const [payload, setPayload] = useState<ModelGroupsPayload | null>(null);
  const [viewKey, setViewKey] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [activeCapability, setActiveCapability] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CapabilitySelection>({});
  const [provider, setProvider] = useState(ALL_PROVIDERS);
  const [query, setQuery] = useState("");
  const [marketQuery, setMarketQuery] = useState(initialMarketQuery);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [menuKey, setMenuKey] = useState("");
  const [pendingDeleteKey, setPendingDeleteKey] = useState("");
  const [unavailableOpen, setUnavailableOpen] = useState(false);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);

  // 依赖里刻意没有 `tt`：模型组合与语言无关，换语言不该重新拉一次 `getModelGroups()`
  //（还会把 `viewKey` 打回服务端的 active 组，丢掉用户当前正在看的那一组）。
  // 错误串只存中文原文（词典 key），渲染处本来就是 `tt(error)`。
  useEffect(() => {
    if (!user) {
      setPayload(null);
      return;
    }
    let alive = true;
    let request = 0;
    const initialRequest = ++request;
    void getModelGroups().then((result) => {
      if (!alive || initialRequest !== request) return;
      if (result.ok && result.data) {
        setPayload(result.data);
        setViewKey(result.data.active_group_key);
      } else {
        setError(result.error || "模型组合加载失败");
      }
    });
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<ModelGroupsPayload>).detail;
      if (detail?.groups) {
        request += 1;
        setPayload(detail);
      }
    };
    window.addEventListener(MODEL_GROUP_CHANGED_EVENT, onChanged);
    const refreshAvailability = () => {
      const current = ++request;
      void getModelGroups().then(result => {
        if (alive && current === request && result.ok && result.data) setPayload(result.data);
      });
    };
    window.addEventListener(BYOK_STATUS_CHANGED_EVENT, refreshAvailability);
    return () => {
      alive = false;
      window.removeEventListener(MODEL_GROUP_CHANGED_EVENT, onChanged);
      window.removeEventListener(BYOK_STATUS_CHANGED_EVENT, refreshAvailability);
    };
  }, [user]);

  const groups = useMemo(
    () => payload?.groups?.length ? payload.groups : presetGroups(catalog),
    [payload, catalog],
  );
  const groupKeySignature = groups.map((group) => group.key).join("\u0000");
  useEffect(() => {
    if (groups.some((group) => group.key === viewKey)) return;
    setViewKey(
      payload?.active_group_key
      || (groups.some((group) => group.key === "preset:pro")
        ? "preset:pro"
        : groups[0]?.key || ""),
    );
  }, [groupKeySignature, payload?.active_group_key, viewKey]);

  const group =
    groups.find((item) => item.key === viewKey)
    || groups.find((item) => item.key === "preset:pro")
    || groups[0];
  const catalogGroups = catalog?.groups || [];
  const category =
    catalogGroups.find((item) => item.id === activeCategory)
    || catalogGroups[0];
  const capability =
    category?.capabilities.find((item) => item.id === activeCapability)
    || category?.capabilities[0];
  const selection = editing ? draft : group?.selection || {};
  const selectedKeys =
    selection[category?.id || ""]?.[capability?.id || ""] || [];
  const byKey = useMemo(() => {
    const index = new Map<string, CatalogModel>();
    for (const catalogGroup of catalogGroups) {
      for (const model of flattenProviders(catalogGroup.providers)) {
        if (model.key) index.set(model.key, model);
      }
      for (const item of catalogGroup.capabilities || []) {
        for (const model of flatten(item)) {
          if (model.key && !index.has(model.key)) index.set(model.key, model);
        }
      }
    }
    return index;
  }, [catalogGroups]);
  const selectedRows = resolveSelectedRows(selectedKeys, byKey, catalog, group);
  const byokProviders = payload?.byok_providers || [];
  const providerOptions = capabilityProviders(capability, catalog?.configured_connections);
  const providerIds = providerOptions.map(item => item.id);
  const effectiveProvider =
    provider !== ALL_PROVIDERS && !providerIds.includes(provider)
      ? ALL_PROVIDERS
      : provider;
  const capabilityModels = capability ? flatten(capability) : [];
  const emptyConnection = catalog?.configured_connections?.find(connection =>
    `connection:${connection.connection_id}` === effectiveProvider && connection.model_count === 0,
  );
  const allModels = capabilityModels
    .filter((model) => effectiveProvider === ALL_PROVIDERS || offerProviderKey(model) === effectiveProvider)
    .filter((model) => !query.trim() || matchesModel(query, model));
  const partitioned = partitionOfferModels(allModels, byokProviders);
  const offerGroups = groupOffers(partitioned.selectable, PROVIDER_DISPLAY_ORDER);
  const unavailableGroups = groupOffers(partitioned.unavailable, PROVIDER_DISPLAY_ORDER);
  const capabilitySelectableCount = capabilityModels.filter((model) =>
    canSelect(model, byokProviders),
  ).length;
  const capabilityEmptyReason =
    capabilitySelectableCount === 0
      ? emptyCapabilityReason(capability, byokProviders)
      : "none";
  const unavailableReason = partitioned.unavailable.length
    ? dominantEmptyReason(partitioned.unavailable)
    : "none";
  const showUnavailable = unavailableOpen || Boolean(query.trim());
  const catalogModels = useMemo(() => allCatalogModels(catalog), [catalog]);
  const marketHits = useMemo(() => {
    const needle = marketQuery.trim();
    if (!needle) return { selectable: [], unavailable: [] };
    const hits = catalogModels.filter((model) => matchesModel(needle, model));
    const parts = partitionOfferModels(hits, byokProviders);
    return {
      selectable: groupOffers(parts.selectable, PROVIDER_DISPLAY_ORDER),
      unavailable: groupOffers(parts.unavailable, PROVIDER_DISPLAY_ORDER),
    };
  }, [catalogModels, marketQuery, byokProviders]);
  const menuGroup = groups.find((item) => item.key === menuKey);
  const pendingDelete = groups.find((item) => item.key === pendingDeleteKey);

  function chooseGroup(key: string) {
    if (editing || busy) return;
    setViewKey(key);
    setActiveCategory("");
    setActiveCapability("");
    setProvider(ALL_PROVIDERS);
    setQuery("");
    setRenaming(false);
    setMenuKey("");
    setError("");
  }

  async function beginEdit(item = group) {
    if (!item || !user) return;
    if (item.kind === "preset") {
      setBusy("create");
      const result = await createModelGroup(`${item.name} · ${tt("自定义")}`, item.key);
      setBusy("");
      if (!result.ok || !result.data) { setError(result.error || tt("创建模型组合失败")); return; }
      setPayload(result.data);
      item = result.data.group;
    }
    setViewKey(item.key);
    setDraft(cloneSelection(item.selection));
    setEditing(true);
    setRenaming(false);
    setProvider(ALL_PROVIDERS);
    setQuery("");
    setMenuKey("");
    setError("");
  }

  function beginRename(item = group) {
    if (!item || item.kind !== "custom") return;
    setViewKey(item.key);
    setRenameName(item.name);
    setRenaming(true);
    setEditing(false);
    setMenuKey("");
    setError("");
  }

  function patchCapability(next: string[]) {
    if (!category || !capability) return;
    setDraft((current) => ({
      ...current,
      [category.id]: {
        ...(current[category.id] || {}),
        [capability.id]: next,
      },
    }));
  }

  function toggleModel(key: string) {
    const index = selectedKeys.indexOf(key);
    if (index >= 0) {
      if (selectedKeys.length === 1) {
        setError(tt("每项能力至少保留一个模型。"));
        return;
      }
      patchCapability(selectedKeys.filter((item) => item !== key));
    } else {
      const model = byKey.get(key);
      if (model && !canSelect(model, byokProviders)) return;
      patchCapability([...selectedKeys, key]);
    }
    setError("");
  }

  async function selectOffer(key: string) {
    if (editing) { toggleModel(key); return; }
    if (!user || !group || !category || !capability || busy) return;
    let target = group;
    if (target.kind === "preset") {
      setBusy("create");
      const result = await createModelGroup(`${target.name} · ${tt("自定义")}`, target.key);
      setBusy("");
      if (!result.ok || !result.data) { setError(result.error || tt("创建模型组合失败")); return; }
      setPayload(result.data);
      target = result.data.group;
    }
    const next = cloneSelection(target.selection);
    const keys = next[category.id]?.[capability.id] || [];
    if (keys.includes(key) && keys.length === 1) { setError(tt("每项能力至少保留一个模型。")); return; }
    next[category.id] = { ...(next[category.id] || {}), [capability.id]: keys.includes(key) ? keys.filter(value => value !== key) : [...keys, key] };
    setViewKey(target.key);
    setDraft(next);
    setEditing(true);
    setError("");
  }

  function moveModel(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= selectedKeys.length) return;
    const next = [...selectedKeys];
    [next[index], next[target]] = [next[target], next[index]];
    patchCapability(next);
  }

  async function saveEdit() {
    if (!group || group.kind !== "custom") return;
    setBusy("save");
    setError("");
    const result = await updateModelGroup(group.id, { selection: draft });
    if (!result.ok || !result.data) {
      setBusy("");
      setError(result.error || tt("保存模型组合失败"));
      return;
    }
    const savedKey = group.key;
    const savedId = group.id;
    let nextPayload = applyDraftToPayload(result.data, savedId, savedKey, draft);
    if (nextPayload.active_group_key !== savedKey) {
      const activated = await setActiveModelGroup(savedKey);
      if (activated.ok && activated.data) {
        nextPayload = applyDraftToPayload(activated.data, savedId, savedKey, draft);
      } else {
        setBusy("");
        setPayload(nextPayload);
        setViewKey(savedKey);
        setEditing(false);
        setError(activated.error || tt("保存已成功，但未能设为全站默认组合"));
        return;
      }
    }
    setBusy("");
    setPayload(nextPayload);
    setViewKey(savedKey);
    setEditing(false);
  }

  async function createGroup() {
    const name = newName.trim();
    if (!name || !group) return;
    setBusy("create");
    setError("");
    const result = await createModelGroup(name, group.key);
    setBusy("");
    if (result.ok && result.data) {
      setPayload(result.data);
      setViewKey(result.data.group.key);
      setDraft(cloneSelection(result.data.group.selection));
      setCreating(false);
      setNewName("");
      setEditing(true);
    } else {
      setError(result.error || tt("创建模型组合失败"));
    }
  }

  async function saveRename() {
    if (!group || group.kind !== "custom" || !renameName.trim()) return;
    setBusy("rename");
    setError("");
    const result = await updateModelGroup(group.id, { name: renameName.trim() });
    setBusy("");
    if (result.ok && result.data) {
      setPayload(result.data);
      setRenaming(false);
    } else {
      setError(result.error || tt("修改组合名称失败"));
    }
  }

  async function activateGroup(item: ModelGroup) {
    if (payload?.active_group_key === item.key) {
      setMenuKey("");
      return;
    }
    setBusy("activate");
    setError("");
    const result = await setActiveModelGroup(item.key);
    setBusy("");
    if (result.ok && result.data) {
      setPayload(result.data);
      setMenuKey("");
    } else {
      setError(result.error || tt("切换模型组合失败"));
    }
  }

  async function removeGroup() {
    const target = pendingDelete || group;
    if (!target || target.kind !== "custom") return;
    setBusy("delete");
    setError("");
    const result = await deleteModelGroup(target.id);
    setBusy("");
    if (result.ok && result.data) {
      setPayload(result.data);
      setViewKey(result.data.active_group_key || "preset:pro");
      setPendingDeleteKey("");
      setMenuKey("");
    } else {
      setError(result.error || tt("删除模型组合失败"));
    }
  }

  if (!catalogGroups.length || !group || !category || !capability) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-[13px] text-neutral-500">
        {tt("正在加载模型组合…")}
      </div>
    );
  }

  return (
    <section className="v-fade-up">
      <div data-model-price-search="" className="mb-8">
        <h2 className="text-[14px] font-semibold text-neutral-900">{tt("搜模型查价")}</h2>
        <input
          type="search"
          data-model-price-search-input=""
          value={marketQuery}
          onChange={(event) => setMarketQuery(event.target.value)}
          placeholder={tt("输入模型名，如 glm 5.1、deepseek v3.2、kimi")}
          className="mt-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[12px] outline-none placeholder:text-neutral-400 focus:border-neutral-400"
        />
        {!marketQuery.trim() ? (
          <p data-model-price-search-hint="" className="mt-2 text-[12px] text-neutral-400">
            {tt("输入模型名即可查看各家价格与此刻能否选用。")}
          </p>
        ) : (
          <div data-model-price-search-results="" className="mt-3 space-y-2">
            {marketHits.selectable.length + marketHits.unavailable.length === 0 ? (
              <p className="text-[12px] text-neutral-400">{tt("没有匹配的模型。")}</p>
            ) : (
              <>
                {marketHits.selectable.map((hit) => (
                  <OfferGroupRow
                    key={hit.canonical}
                    label={hit.label}
                    category={hit.category}
                    offers={hit.offers}
                    catalog={catalog}
                    tt={tt}
                    byokProviders={byokProviders}
                  />
                ))}
                {marketHits.unavailable.map((hit) => (
                  <OfferGroupRow
                    key={`unavailable-${hit.canonical}`}
                    label={hit.label}
                    category={hit.category}
                    offers={hit.offers}
                    catalog={catalog}
                    tt={tt}
                    byokProviders={byokProviders}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-neutral-900">{tt("我的模型选择")}</h2>
        {payload?.active_group_key === group.key ? (
          <span
            data-model-group-active=""
            className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
          >
            {tt("当前在所有 OceanLeo 站点使用")}
          </span>
        ) : null}
      </div>

      <div className="mb-3 rounded-2xl border border-neutral-200 bg-neutral-50/60 p-2">
        <div className="flex flex-wrap gap-1.5">
          {groups.map((item) => {
            const selected = item.key === group.key;
            const live = payload?.active_group_key === item.key;
            return (
            <div
              key={item.key}
              data-model-group-chip={item.key}
              data-model-group-live={live ? "true" : undefined}
              className={`inline-flex items-center rounded-lg border text-[12px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
                selected
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
              }`}
            >
              <button
                type="button"
                disabled={editing || !!busy}
                onClick={() => chooseGroup(item.key)}
                className="rounded-lg px-3 py-1.5 disabled:cursor-default"
              >
                {item.name}
                {item.kind === "custom" && (
                  <span className={selected ? "ml-1 text-white/65" : "ml-1 text-indigo-500"}>
                    · {tt("自定义")}
                  </span>
                )}
              </button>
              {user ? (
                <button
                  type="button"
                  ref={menuKey === item.key ? menuAnchorRef : undefined}
                  disabled={editing || !!busy}
                  aria-label={tt("组合操作")}
                  data-model-group-menu={item.key}
                  onClick={(event) => {
                    event.stopPropagation();
                    menuAnchorRef.current = event.currentTarget;
                    setMenuKey((current) => (current === item.key ? "" : item.key));
                  }}
                  className={`mr-1 inline-flex h-6 w-6 items-center justify-center rounded-md disabled:cursor-default ${
                    selected ? "text-white/80 hover:bg-white/10" : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  }`}
                >
                  <KebabIcon />
                </button>
              ) : null}
            </div>
            );
          })}
          {user && !editing && (
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setNewName("");
              }}
              className="rounded-lg border border-dashed border-neutral-300 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-neutral-400 hover:text-neutral-800"
            >
              {tt("+ 新建自定义组合")}
            </button>
          )}
        </div>
        {creating && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-2">
            <input
              autoFocus
              value={newName}
              maxLength={40}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createGroup();
                if (event.key === "Escape") setCreating(false);
              }}
              placeholder={tt("给新组合命名")}
              className="min-w-[180px] flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] outline-none focus:border-neutral-400"
            />
            <button type="button" disabled={!newName.trim() || busy === "create"} onClick={() => void createGroup()} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40">
              {busy === "create" ? tt("创建中…") : tt("创建并编辑")}
            </button>
            <button type="button" onClick={() => setCreating(false)} className="px-2 py-1.5 text-[12px] text-neutral-400 hover:text-neutral-700">
              {tt("取消")}
            </button>
          </div>
        )}
        {renaming && group.kind === "custom" && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 bg-white p-2">
            <input
              autoFocus
              value={renameName}
              maxLength={40}
              onChange={(event) => setRenameName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void saveRename();
                if (event.key === "Escape") setRenaming(false);
              }}
              className="min-w-[180px] flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] outline-none focus:border-neutral-400"
            />
            <button type="button" onClick={() => void saveRename()} className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white">
              {tt("保存")}
            </button>
            <button type="button" onClick={() => setRenaming(false)} className="px-2 py-1.5 text-[12px] text-neutral-400 hover:text-neutral-700">
              {tt("取消")}
            </button>
          </div>
        )}
        <FloatingMenu
          open={!!menuGroup}
          anchorRef={menuAnchorRef}
          onClose={() => setMenuKey("")}
          align="end"
          width={200}
          zClassName="z-[180]"
          ariaLabel={tt("组合操作")}
        >
          <FloatingMenuItem
            label={tt("设为默认")}
            disabled={!!busy || payload?.active_group_key === menuGroup?.key}
            selected={payload?.active_group_key === menuGroup?.key}
            onSelect={() => {
              if (menuGroup) void activateGroup(menuGroup);
            }}
          />
          {menuGroup?.kind === "custom" ? (
            <>
              <FloatingMenuItem
                label={tt("改名")}
                disabled={!!busy}
                onSelect={() => beginRename(menuGroup)}
              />
              <FloatingMenuItem
                label={tt("编辑组合")}
                disabled={!!busy}
                onSelect={() => beginEdit(menuGroup)}
              />
              <FloatingMenuItem
                label={tt("删除")}
                danger
                disabled={!!busy}
                onSelect={() => {
                  setPendingDeleteKey(menuGroup.key);
                  setMenuKey("");
                  setConfirmingDelete(true);
                }}
              />
            </>
          ) : null}
        </FloatingMenu>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-1.5">
          {editing ? (
            <>
              <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-[11px] text-neutral-500 hover:bg-neutral-50">{tt("取消")}</button>
              <button type="button" disabled={busy === "save"} onClick={() => void saveEdit()} className="rounded-lg bg-neutral-900 px-3 py-1 text-[11px] font-medium text-white disabled:opacity-40">{busy === "save" ? tt("保存中…") : tt("保存组合")}</button>
            </>
          ) : user ? <button type="button" data-model-edit-direct="" disabled={!!busy} onClick={() => void beginEdit()} className="rounded-lg border border-neutral-200 px-3 py-1 text-[11px]">{tt(group.kind === "preset" ? "复制并编辑组合" : "编辑组合")}</button> : null}
        </div>
      </div>

      <div data-model-group-table="" className="overflow-hidden rounded-2xl border border-neutral-200">
        <div className="flex flex-col sm:flex-row">
          <div className="shrink-0 border-b border-neutral-100 bg-neutral-50/60 p-2 sm:w-[148px] sm:border-b-0 sm:border-r">
            <div className="flex gap-1.5 overflow-x-auto sm:flex-col sm:gap-1 sm:overflow-visible">
              {catalogGroups.map((item) => {
                const count = Object.values(selection[item.id] || {}).reduce(
                  (sum, keys) => sum + (keys?.length || 0),
                  0,
                );
                const active = item.id === category.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-model-cat={item.id}
                    onClick={() => {
                      setActiveCategory(item.id);
                      setActiveCapability(item.capabilities[0]?.id || "");
                      setProvider(ALL_PROVIDERS);
                      setQuery("");
                      setUnavailableOpen(false);
                    }}
                    className={`flex shrink-0 flex-col items-stretch rounded-lg px-3 py-2 text-left text-[13px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] sm:w-full ${
 active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-200/60"
 }`}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span>{tt(item.label)}</span>
                      <span className={active ? "text-[11px] text-white/65" : "text-[11px] text-neutral-400"}>✓{count}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0 flex-1 p-3">
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {category.capabilities.map((item) => {
                const active = item.id === capability.id;
                const count = (selection[category.id]?.[item.id] || []).length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-model-cap={item.id}
                    onClick={() => {
                      setActiveCapability(item.id);
                      setProvider(ALL_PROVIDERS);
                      setQuery("");
                      setUnavailableOpen(false);
                    }}
                    className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-left text-[12px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
 active ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
 }`}
                  >
                    <span>
                      {tt(item.label)}
                      <span className={active ? "ml-1 text-emerald-200" : "ml-1 text-emerald-600"}>✓{count}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mb-2 text-[11px] text-neutral-400">{tt(capability.description)}</p>

            <div className="overflow-hidden rounded-xl border border-neutral-200">
              {selectedRows.map((row, index) => (
                row.kind === "delisted" ? (
                  <DelistedModelRow
                    key={row.key}
                    rowKey={row.key}
                    label={row.label}
                    index={index}
                    tt={tt}
                    editing={editing}
                    onRemove={() => toggleModel(row.key)}
                  />
                ) : (
                  <SelectedModelRow
                    key={row.key}
                    model={row.model}
                    index={index}
                    tt={tt}
                    editing={editing}
                    onMove={(direction) => moveModel(index, direction)}
                    onRemove={() => toggleModel(row.key)}
                    first={index === 0}
                    last={index === selectedRows.length - 1}
                  />
                )
              ))}
              {capabilitySelectableCount === 0 ? (
                <EmptyCapabilityPanel
                  reason={capabilityEmptyReason}
                  tt={tt}
                />
              ) : null}
            </div>

            {(
              <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50/50 p-2.5">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    data-model-provider-chip={ALL_PROVIDERS}
                    data-model-provider-selectable={capabilitySelectableCount}
                    onClick={() => setProvider(ALL_PROVIDERS)}
                    className={`rounded-full px-3 py-1 text-[11px] font-medium ${effectiveProvider === ALL_PROVIDERS ? "bg-neutral-900 text-white" : "bg-white text-neutral-600"}`}
                  >
                    {tt("全部供应商")} {capabilitySelectableCount}
                  </button>
                  {providerOptions.map((item) => {
                    const selectableHere = capabilityModels.filter(
                      (model) => offerProviderKey(model) === item.id && canSelect(model, byokProviders),
                    ).length;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-model-provider-chip={item.id}
                        data-model-provider-selectable={selectableHere}
                        onClick={() => setProvider(item.id)}
                        className={`rounded-full px-3 py-1 text-[11px] font-medium ${effectiveProvider === item.id ? "bg-neutral-900 text-white" : "bg-white text-neutral-600"}`}
                      >
                        {tt(item.label)} {selectableHere}
                      </button>
                    );
                  })}
                </div>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tt("搜索全部可用模型…")} className="mb-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[12px] outline-none placeholder:text-neutral-400 focus:border-neutral-400" />
                <div data-model-edit-offers="" className="max-h-[360px] overflow-y-auto rounded-xl border border-neutral-200 bg-white">
                  {emptyConnection ? (
                    <div data-model-empty-connection={emptyConnection.connection_id} className="flex items-center justify-between gap-3 p-3 text-[12px] text-neutral-600">
                      <span>{emptyConnection.display_name} · {tt("请填写模型 ID")}</span>
                      {onSetupByok ? (
                        <button type="button" onClick={() => onSetupByok(emptyConnection.connection_id)} className="shrink-0 rounded-lg border border-neutral-200 px-3 py-1.5 text-neutral-900">{tt("添加模型")}</button>
                      ) : (
                        <a href={`/settings/ai-models?pane=byok&connection=${encodeURIComponent(emptyConnection.connection_id)}`} className="shrink-0 rounded-lg border border-neutral-200 px-3 py-1.5 text-neutral-900">{tt("添加模型")}</a>
                      )}
                    </div>
                  ) : null}
                  {offerGroups.map((hit, index) => (
                    <EditOfferGroup
                      key={hit.canonical}
                      hit={hit}
                      index={index}
                      catalogGroups={catalogGroups}
                      selectedKeys={selectedKeys}
                      byokProviders={byokProviders}
                      catalog={catalog}
                      tt={tt}
                      onToggle={key => void selectOffer(key)}
                    />
                  ))}
                  {unavailableGroups.length ? (
                    <div
                      data-model-unavailable=""
                      data-model-unavailable-count={partitioned.unavailable.length}
                      data-empty-reason={unavailableReason}
                      className={offerGroups.length ? "border-t border-neutral-100" : ""}
                    >
                      <button
                        type="button"
                        data-model-unavailable-toggle=""
                        aria-expanded={showUnavailable ? "true" : "false"}
                        onClick={() => setUnavailableOpen((open) => !open)}
                        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[12px] font-medium text-neutral-600 hover:bg-neutral-50"
                      >
                        <span>
                          {tt("暂不可选 · {n}", { n: partitioned.unavailable.length })}
                        </span>
                        <span className="text-[11px] text-neutral-400">
                          {showUnavailable ? tt("收起") : tt("展开")}
                        </span>
                      </button>
                      <div hidden={!showUnavailable} data-model-unavailable-offers="">
                        {unavailableGroups.map((hit, index) => (
                          <EditOfferGroup
                            key={`unavailable-${hit.canonical}`}
                            hit={hit}
                            index={index + 1}
                            catalogGroups={catalogGroups}
                            selectedKeys={selectedKeys}
                            byokProviders={byokProviders}
                            catalog={catalog}
                            tt={tt}
                            onToggle={toggleModel}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
            {error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-[11px] text-rose-600">{tt(error)}</p>}
          </div>
        </div>
      </div>
      {!user && (
        <p className="mt-3 text-center text-[12px] text-neutral-400">
          {tt("登录后即可创建、命名和编辑多个自定义模型组合。")}
        </p>
      )}
      {confirmingDelete && pendingDelete && (
        <ConfirmDialog
          title={tt("确定删除模型组合「{name}」吗？", { name: pendingDelete.name })}
          body={tt("组合里的模型搭配会被删除且无法恢复；已经跑过的任务不受影响。")}
          confirmLabel={tt("删除")}
          danger
          onConfirm={async () => {
            setConfirmingDelete(false);
            await removeGroup();
          }}
          onCancel={() => {
            setConfirmingDelete(false);
            setPendingDeleteKey("");
          }}
        />
      )}
    </section>
  );
}

function EmptyCapabilityPanel({
  reason,
  tt,
}: {
  reason: EmptyCapabilityReason;
  tt: UITranslate;
}) {
  return (
    <div
      data-model-empty-capability=""
      data-empty-reason={reason}
      className="px-3.5 py-3 text-[12px] text-neutral-600"
    >
      <p className="font-medium text-neutral-800">{tt("这一类暂无可选模型")}</p>
    </div>
  );
}

function EditOfferGroup({
  hit,
  index,
  catalogGroups,
  selectedKeys,
  byokProviders,
  catalog,
  tt,
  onToggle,
}: {
  hit: { canonical: string; label: string; category: string; offers: CatalogModel[] };
  index: number;
  catalogGroups: { id: string; label: string }[];
  selectedKeys: string[];
  byokProviders: readonly string[];
  catalog: ModelCatalog | null;
  tt: UITranslate;
  onToggle: (key: string) => void;
}) {
  return (
    <div
      data-model-edit-row={hit.canonical}
      className={`px-3.5 py-2.5 ${index ? "border-t border-neutral-100" : ""}`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="truncate text-[13px] font-medium text-neutral-900">{hit.label}</span>
        {hit.category ? (
          <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
            {tt(catalogGroups.find((item) => item.id === hit.category)?.label || hit.category)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {hit.offers.map((model) => {
          const selectedIndex = selectedKeys.indexOf(model.key);
          const selectable = canSelect(model, byokProviders);
          return (
            <div key={model.key} className="flex flex-col gap-1">
              <button
                type="button"
                data-model-offer={model.key}
                data-model-offer-disabled={selectable ? undefined : "true"}
                disabled={!selectable}
                onClick={() => onToggle(model.key)}
                className={`rounded-lg border px-2.5 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-50 ${
                  selectedIndex >= 0
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
                }`}
              >
                <span className="block text-[11px] font-medium">{tt(model.provider_label)}</span>
                {model.connection_id ? <span className="block text-[11px]">{model.connection_name || model.display_name || model.connection_id} · {model.model_id || model.id}</span> : null}
                {!model.connection_id ? <span data-model-price="" className={`block text-[11px] ${selectedIndex >= 0 ? "text-white/80" : "text-neutral-500"}`}>
                  {priceText(model, tt)}
                </span> : null}
                {!selectable ? (
                  <span data-model-status={offerStatus(model) || "unavailable"} className="mt-0.5 block text-[10px] text-amber-700">
                    {statusLabel(offerStatus(model), catalog, tt)}
                  </span>
                ) : null}
                {selectedIndex >= 0 ? (
                  <span className="mt-0.5 block text-[10px] text-amber-200">{fallbackLabel(selectedIndex, tt)}</span>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KebabIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <circle cx="8" cy="3.5" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="8" cy="12.5" r="1.25" />
    </svg>
  );
}

function SelectedModelRow({
  model,
  index,
  tt,
  editing,
  onMove,
  onRemove,
  first,
  last,
}: {
  model: CatalogModel;
  index: number;
  tt: UITranslate;
  editing: boolean;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  first: boolean;
  last: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-3.5 py-2.5 ${index ? "border-t border-neutral-100" : ""}`}>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${index === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{fallbackLabel(index, tt)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-neutral-900">{model.label}</span>
          <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{tt(model.provider_label)}</span>
        </span>
        {model.connection_id ? <span className="block text-[11px] text-neutral-500">{model.connection_name || model.display_name || model.connection_id} · {model.model_id || model.id}</span> : null}
      </span>
      {!model.connection_id ? <span data-model-price="" className="shrink-0 whitespace-nowrap text-[11px] text-neutral-500">{priceText(model, tt)}</span> : null}
      {editing && (
        <span className="flex shrink-0 items-center gap-0.5">
          <button type="button" disabled={first} onClick={() => onMove(-1)} aria-label={tt("上移")} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-20">↑</button>
          <button type="button" disabled={last} onClick={() => onMove(1)} aria-label={tt("下移")} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-20">↓</button>
          <button type="button" onClick={onRemove} aria-label={tt("移除")} className="rounded p-1 text-rose-400 hover:bg-rose-50">×</button>
        </span>
      )}
    </div>
  );
}

function DelistedModelRow({
  rowKey,
  label,
  index,
  tt,
  editing,
  onRemove,
}: {
  rowKey: string;
  label: string;
  index: number;
  tt: UITranslate;
  editing: boolean;
  onRemove: () => void;
}) {
  return (
    <div
      data-model-delisted={rowKey}
      className={`flex items-center gap-3 px-3.5 py-2.5 text-neutral-400 ${index ? "border-t border-neutral-100" : ""}`}
    >
      <span className="min-w-0 flex-1 truncate text-[13px]">
        {label} · {tt("已下架")}
      </span>
      {editing && (
        <button type="button" onClick={onRemove} aria-label={tt("移除")} className="rounded p-1 text-rose-400 hover:bg-rose-50">×</button>
      )}
    </div>
  );
}

function OfferGroupRow({
  label,
  category,
  offers,
  catalog,
  tt,
  byokProviders,
}: {
  label: string;
  category: string;
  offers: CatalogModel[];
  catalog: ModelCatalog | null;
  tt: UITranslate;
  byokProviders: string[];
}) {
  const categoryLabel =
    catalog?.groups.find((group) => group.id === category)?.label || category;
  return (
    <div data-model-offer-row="" className="rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="truncate text-[13px] font-medium text-neutral-900">{label}</span>
        {categoryLabel ? (
          <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
            {tt(categoryLabel)}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {offers.map((model) => {
          const selectable = canSelect(model, byokProviders);
          const currency = model.price?.currency || "CNY";
          const rules = model.connection_id ? [] : model.price?.rules || [];
          const checked = checkedAgoText(model.checked_at || model.price?.checked_at, tt);
          const official = model.connection_id ? undefined : model.source_url;
          return (
            <div
              key={model.key}
              data-model-offer={model.key}
              data-model-offer-disabled={selectable ? undefined : "true"}
              className={`min-w-[140px] rounded-lg border px-2.5 py-1.5 ${
                selectable ? "border-neutral-200 bg-neutral-50" : "border-neutral-200 bg-neutral-50 opacity-70"
              }`}
            >
              <span className="block text-[11px] font-medium text-neutral-800">{tt(model.provider_label)}</span>
              {model.connection_id ? <span className="block text-[11px] text-neutral-600">{model.connection_name || model.display_name || model.connection_id} · {model.model_id || model.id}</span> : null}
              {!model.connection_id ? <span data-model-price="" className="block text-[11px] text-neutral-600">{priceText(model, tt)}</span> : null}
              {rules.map((rule, index) => (
                <span key={`${rule.kind || "rule"}-${index}`} className="block text-[10px] text-neutral-400">
                  {formatRuleLine(rule, currency, tt)}
                </span>
              ))}
              <span data-model-status={offerStatus(model) || ""} className="mt-0.5 block text-[10px] text-neutral-500">
                {statusLabel(offerStatus(model) || "available", catalog, tt)}
              </span>
              {checked ? (
                <span data-model-checked="" className="block text-[10px] text-neutral-400">{checked}</span>
              ) : null}
              {official ? (
                <a
                  href={official}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 block text-[10px] text-neutral-500 underline"
                >
                  {tt("官方价目")}
                </a>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
