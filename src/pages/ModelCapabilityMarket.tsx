"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createModelGroup,
  deleteModelGroup,
  getModelGroups,
  MODEL_GROUP_CHANGED_EVENT,
  updateModelGroup,
  type CapabilitySelection,
  type CatalogCapability,
  type CatalogModel,
  type ModelCatalog,
  type ModelGroup,
  type ModelGroupsPayload,
} from "../lib/auth";
import { useUI, type UITranslate } from "../i18n/ui/useUI";

const ALL_PROVIDERS = "__all__";

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

function fallbackLabel(index: number, tt: UITranslate) {
  return index === 0 ? tt("主用") : tt("备用 {n}", { n: index });
}

export function ModelGroupManager({
  catalog,
  user,
}: {
  catalog: ModelCatalog | null;
  user: boolean;
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
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState("");

  useEffect(() => {
    if (!user) {
      setPayload(null);
      return;
    }
    let alive = true;
    void getModelGroups().then((result) => {
      if (!alive) return;
      if (result.ok && result.data) {
        setPayload(result.data);
        setViewKey(result.data.active_group_key);
      } else {
        setError(result.error || tt("模型组合加载失败"));
      }
    });
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<ModelGroupsPayload>).detail;
      if (detail?.groups) setPayload(detail);
    };
    window.addEventListener(MODEL_GROUP_CHANGED_EVENT, onChanged);
    return () => {
      alive = false;
      window.removeEventListener(MODEL_GROUP_CHANGED_EVENT, onChanged);
    };
  }, [user, tt]);

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
      for (const model of catalogGroup.providers.flatMap((item) => item.models || [])) {
        index.set(model.key, model);
      }
    }
    return index;
  }, [catalogGroups]);
  const selectedModels = selectedKeys
    .map((key) => byKey.get(key))
    .filter((model): model is CatalogModel => Boolean(model));
  const providerIds = capability?.providers.map((item) => item.id) || [];
  const effectiveProvider =
    provider !== ALL_PROVIDERS && !providerIds.includes(provider)
      ? ALL_PROVIDERS
      : provider;
  const allModels = (capability ? flatten(capability) : [])
    .filter((model) => effectiveProvider === ALL_PROVIDERS || model.provider === effectiveProvider)
    .filter((model) => {
      const normalized = query.trim().toLowerCase();
      return !normalized || [
        model.label,
        model.id,
        model.provider_label,
        ...model.capability_labels,
      ].some((value) => (value || "").toLowerCase().includes(normalized));
    });
  const customCount = groups.filter((item) => item.kind === "custom").length;

  function chooseGroup(key: string) {
    if (editing || busy) return;
    setViewKey(key);
    setActiveCategory("");
    setActiveCapability("");
    setProvider(ALL_PROVIDERS);
    setQuery("");
    setRenaming(false);
    setError("");
  }

  function beginEdit() {
    if (!group?.editable) return;
    setDraft(cloneSelection(group.selection));
    setEditing(true);
    setProvider(ALL_PROVIDERS);
    setQuery("");
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
      patchCapability([...selectedKeys, key]);
    }
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
    setBusy("");
    if (result.ok && result.data) {
      setPayload(result.data);
      setEditing(false);
    } else {
      setError(result.error || tt("保存模型组合失败"));
    }
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

  async function removeGroup() {
    if (!group || group.kind !== "custom") return;
    if (!window.confirm(tt("确定删除模型组合「{name}」吗？", { name: group.name }))) return;
    setBusy("delete");
    setError("");
    const result = await deleteModelGroup(group.id);
    setBusy("");
    if (result.ok && result.data) {
      setPayload(result.data);
      setViewKey(result.data.active_group_key || "preset:pro");
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
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold text-neutral-900">
            {tt("我的模型选择")}
            <span className="ml-2 text-[11px] font-normal text-neutral-400">
              {tt("{n} 个自定义组合", { n: customCount })}
            </span>
          </h2>
          <p className="mt-1 text-[11px] text-neutral-400">
            {tt("在这里管理组合；真正生效的组合请在每个页面右上角切换。")}
          </p>
        </div>
        {payload?.active_group_key === group.key && (
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
            {tt("当前全站使用")}
          </span>
        )}
      </div>

      <div className="mb-3 rounded-2xl border border-neutral-200 bg-neutral-50/60 p-2">
        <div className="flex flex-wrap gap-1.5">
          {groups.map((item) => (
            <button
              key={item.key}
              type="button"
              disabled={editing || !!busy}
              onClick={() => chooseGroup(item.key)}
              className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition disabled:cursor-default ${
                item.key === group.key
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
              }`}
            >
              {item.name}
              {item.kind === "custom" && (
                <span className={item.key === group.key ? "ml-1 text-white/65" : "ml-1 text-indigo-500"}>
                  · {tt("自定义")}
                </span>
              )}
            </button>
          ))}
          {user && !editing && (
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setNewName("");
              }}
              className="rounded-lg border border-dashed border-neutral-300 bg-white px-3 py-1.5 text-[12px] font-medium text-neutral-500 transition hover:border-neutral-400 hover:text-neutral-800"
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
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200">
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
                    onClick={() => {
                      setActiveCategory(item.id);
                      setActiveCapability(item.capabilities[0]?.id || "");
                      setProvider(ALL_PROVIDERS);
                      setQuery("");
                    }}
                    className={`flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition sm:w-full ${
                      active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-200/60"
                    }`}
                  >
                    <span>{tt(item.label)}</span>
                    <span className={active ? "text-[11px] text-white/65" : "text-[11px] text-neutral-400"}>✓{count}</span>
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
                    onClick={() => {
                      setActiveCapability(item.id);
                      setProvider(ALL_PROVIDERS);
                      setQuery("");
                    }}
                    className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition ${
                      active ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                    }`}
                  >
                    {tt(item.label)}
                    <span className={active ? "ml-1 text-emerald-200" : "ml-1 text-emerald-600"}>✓{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-[11px] text-neutral-400">{tt(capability.description)}</p>
                <p className="mt-0.5 text-[11px] font-medium text-amber-700">
                  {tt("从上到下依次尝试：主用不可用时自动使用下一项。")}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {group.kind === "preset" ? (
                  <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] text-neutral-500">{tt("平台只读组合")}</span>
                ) : editing ? (
                  <>
                    <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-[11px] text-neutral-500 hover:bg-neutral-50">{tt("取消")}</button>
                    <button type="button" disabled={busy === "save"} onClick={() => void saveEdit()} className="rounded-lg bg-neutral-900 px-3 py-1 text-[11px] font-medium text-white disabled:opacity-40">{busy === "save" ? tt("保存中…") : tt("保存组合")}</button>
                  </>
                ) : renaming ? (
                  <>
                    <input value={renameName} maxLength={40} onChange={(event) => setRenameName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void saveRename()} className="w-36 rounded-lg border border-neutral-200 px-2.5 py-1 text-[11px] outline-none focus:border-neutral-400" />
                    <button type="button" onClick={() => void saveRename()} className="rounded-lg bg-neutral-900 px-2.5 py-1 text-[11px] text-white">{tt("保存")}</button>
                    <button type="button" onClick={() => setRenaming(false)} className="px-1.5 py-1 text-[11px] text-neutral-400">{tt("取消")}</button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => { setRenaming(true); setRenameName(group.name); }} className="rounded-lg border border-neutral-200 px-2.5 py-1 text-[11px] text-neutral-500 hover:bg-neutral-50">{tt("改名")}</button>
                    <button type="button" onClick={beginEdit} className="rounded-lg bg-neutral-900 px-3 py-1 text-[11px] font-medium text-white">{tt("编辑组合")}</button>
                    <button type="button" onClick={() => void removeGroup()} className="rounded-lg px-2 py-1 text-[11px] text-rose-500 hover:bg-rose-50">{tt("删除")}</button>
                  </>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-neutral-200">
              {selectedModels.map((model, index) => (
                <SelectedModelRow
                  key={model.key}
                  model={model}
                  index={index}
                  tt={tt}
                  editing={editing}
                  onMove={(direction) => moveModel(index, direction)}
                  onRemove={() => toggleModel(model.key)}
                  first={index === 0}
                  last={index === selectedModels.length - 1}
                />
              ))}
            </div>

            {editing && (
              <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50/50 p-2.5">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setProvider(ALL_PROVIDERS)} className={`rounded-full px-3 py-1 text-[11px] font-medium ${effectiveProvider === ALL_PROVIDERS ? "bg-neutral-900 text-white" : "bg-white text-neutral-600"}`}>{tt("全部供应商")}</button>
                  {capability.providers.map((item) => (
                    <button key={item.id} type="button" onClick={() => setProvider(item.id)} className={`rounded-full px-3 py-1 text-[11px] font-medium ${effectiveProvider === item.id ? "bg-neutral-900 text-white" : "bg-white text-neutral-600"}`}>{item.label}</button>
                  ))}
                </div>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tt("搜索全部可用模型…")} className="mb-2 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[12px] outline-none placeholder:text-neutral-400 focus:border-neutral-400" />
                <div className="max-h-[360px] overflow-y-auto rounded-xl border border-neutral-200 bg-white">
                  {allModels.map((model, index) => {
                    const selectedIndex = selectedKeys.indexOf(model.key);
                    return (
                      <button key={model.key} type="button" onClick={() => toggleModel(model.key)} className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-neutral-50 ${index ? "border-t border-neutral-100" : ""}`}>
                        <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border text-[10px] ${selectedIndex >= 0 ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 text-transparent"}`}>✓</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-neutral-900">{model.label}</span>
                            <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{model.provider_label}</span>
                          </span>
                        </span>
                        {selectedIndex >= 0 && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">{fallbackLabel(selectedIndex, tt)}</span>}
                        <span className="shrink-0 whitespace-nowrap text-[11px] text-neutral-500">{priceText(model, tt)}</span>
                      </button>
                    );
                  })}
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
    </section>
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
          <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">{model.provider_label}</span>
        </span>
      </span>
      <span className="shrink-0 whitespace-nowrap text-[11px] text-neutral-500">{priceText(model, tt)}</span>
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
