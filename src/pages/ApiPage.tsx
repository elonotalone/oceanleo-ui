"use client";

// ============================================================================
// OceanLeo 全家桶「API」统一内容组件（不含侧栏 shell）
// ----------------------------------------------------------------------------
// 与主站 https://oceanleo.com/api 对齐。这份文件在所有 *.oceanleo.com 子站里
// 逐字相同（纯拼接），各站 api/page.tsx 只负责 <SiteShell><AccountApi/></SiteShell>。
//
// 功能：
//   1. 顶部：token 余额(¥) + 充值入口 + 计费规则说明（零服务费：费用即模型市场价）。
//   2. BYOK：自带 API key 管理（用自己的 key 免费用全家桶）+ 指导文档入口。
//   3. 用量记录：每次调用真实计费 + 「查看内容」审计弹窗（迁自 /settings）。
//   4. 价格来源：三家厂商（阿里云百炼 / 火山方舟 / OpenRouter）各自的更新时间 +
//      官方链接 + 可下载「官方原文 / PDF 表格」+ 在线查看 HTML 表格。
//   5. 模型市场：二维选择器（布局 A）——左侧竖栏选「类目」(文本/图片/视频/3D/语音)，
//      右上 tab 选「供应商」(全部供应商 / 阿里云百炼 / 火山方舟 / OpenRouter)，中间是
//      唯一一个固定高度可滚动列表（只渲染「当前类目 × 当前供应商」那一份）。供应商选择
//      全页保持（切类目不打断；所选供应商在新类目没模型时自动回落到「全部供应商」）。
//      搜索框作用于当前列表内。用户同时选「厂商 + 模型」（复合 key），同名模型在不同厂商
//      可分别选；选择即保存。每个模型单行显示「实际成本价（原价，不含服务费）」。
//
// 零站点特有依赖：仅 react + lib/oceanleo-auth（全站都有）。
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  browserClient,
  oceanleoConfigured,
  getCredits,
  getModelCatalog,
  getModelSelection,
  setModelSelection,
  pricingDocUrl,
  type WalletInfo,
  type ModelCatalog,
  type CatalogModel,
  type CatalogGroup,
} from "../lib/auth";
import { ByokKeys } from "./ByokKeys";
import { UsageHistory } from "./UsageHistory";

// 「全部供应商」这个虚拟 tab 的 id（与真实厂商 id 不冲突）。
const ALL_PROVIDERS = "__all__";

// 「语音」类目左栏不显示「已选数量」徽章（操作员要求；纯 UI，默认预选功能不动）。
const HIDE_SELECTED_BADGE_CATEGORIES = new Set<string>(["audio"]);

const toNum = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

function fmt(n: number): string {
  const v = toNum(n);
  const s = v >= 1 ? v.toFixed(2) : v.toFixed(4);
  return s.replace(/\.?0+$/, "");
}

// 每个模型显示「token 市场价」（OceanLeo 不加价，费用即此价）。
function priceText(m: CatalogModel): string {
  if (m?.unpriced) return "免费 / 未公布";
  const p = m?.price;
  if (!p) return "—";
  if (p.billing === "job") {
    const unit = (p.unit || "CNY/次").replace("CNY/", "/");
    return `¥${fmt(toNum(p.price_cny_per_unit))} ${unit}`;
  }
  return `输入 ¥${fmt(toNum(p.input_cny_per_m))} · 输出 ¥${fmt(
    toNum(p.output_cny_per_m),
  )} / 百万 token`;
}

function fmtTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

// 把一个类目的所有厂商模型拍平成 [{provider, model}]，厂商内保序——「全部供应商」列表。
function flattenGroup(g: CatalogGroup): CatalogModel[] {
  const out: CatalogModel[] = [];
  for (const pb of g.providers || []) {
    for (const m of pb.models || []) out.push(m);
  }
  return out;
}

// 一个类目 × 某个厂商（或「全部供应商」）对应的模型列表。
function modelsForProvider(g: CatalogGroup, provider: string): CatalogModel[] {
  if (provider === ALL_PROVIDERS) return flattenGroup(g);
  const pb = (g.providers || []).find((p) => p.id === provider);
  return pb?.models || [];
}

// 厂商的可读名（「全部供应商」或厂商中文名）。providerLabels 是全局厂商 id→名映射，
// 这样即使某厂商在某类目里没有任何模型，也能正确显示它的中文名。
function providerLabel(
  provider: string,
  providerLabels: Record<string, string>,
): string {
  if (provider === ALL_PROVIDERS) return "全部供应商";
  return providerLabels[provider] || provider;
}

// 大小写无关的模型搜索：匹配 label / id / 厂商名。
function matchModel(m: CatalogModel, q: string): boolean {
  if (!q) return true;
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    (m.label || "").toLowerCase().includes(s) ||
    (m.id || "").toLowerCase().includes(s) ||
    (m.provider_label || "").toLowerCase().includes(s)
  );
}

export function ApiPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [selection, setSelection] = useState<Record<string, string[]>>({});
  const [savingCat, setSavingCat] = useState<string>("");

  useEffect(() => {
    const c = browserClient();
    if (!c) {
      setChecked(true);
      return;
    }
    c.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setChecked(true);
    });
    const { data: sub } = c.auth.onAuthStateChange((_e, s) =>
      setUser(s?.user ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    getModelCatalog().then((r) => {
      if (r.ok && r.data) setCatalog(r.data);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    getCredits().then((r) => {
      if (r.ok && r.data) setWallet(r.data);
    });
    getModelSelection().then((r) => {
      if (r.ok && r.data) setSelection(r.data.selection || {});
    });
  }, [user]);

  const providers = catalog?.providers || [];
  const modelCount = catalog?.model_count || 0;

  // 选择以「类目」保存；值是该类目里选中的复合 key 列表（"<provider>:<model>"）。
  async function toggle(category: string, key: string) {
    if (!user) return;
    const current = selection[category] || [];
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    setSelection((s) => ({ ...s, [category]: next }));
    setSavingCat(category);
    const r = await setModelSelection(category, next);
    setSavingCat("");
    if (r.ok && r.data) setSelection(r.data.selection || {});
  }

  const isSelected = useMemo(
    () => (cat: string, key: string) => (selection[cat] || []).includes(key),
    [selection],
  );

  const totalSelected = useMemo(
    () => Object.values(selection).reduce((n, arr) => n + (arr?.length || 0), 0),
    [selection],
  );

  if (!oceanleoConfigured()) {
    return (
      <div className="px-8 py-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">API</h1>
        <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-[13px] text-amber-800">
          登录服务尚未配置（缺少 Supabase 环境变量）。
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6">
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">API</h1>

      <div className="mx-auto mt-6 max-w-3xl space-y-8">
        {/* 余额 + 计费说明（零服务费宗旨只在这里讲） */}
        <section className="v-fade-up">
          <div className="rounded-2xl border border-neutral-200 p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[12px] text-neutral-500">token 余额</p>
                <p className="mt-1 text-[26px] font-semibold tabular-nums text-neutral-900">
                  {wallet ? `¥${toNum(wallet.balance_yuan).toFixed(4)}` : checked && !user ? "登录后查看" : "…"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/api/guide"
                  className="rounded-lg border border-neutral-200 px-4 py-2 text-[13px] font-medium text-neutral-700 transition hover:bg-neutral-50"
                >
                  指导文档
                </a>
                <a
                  href="https://oceanleo.com/billing"
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800"
                >
                  充值
                </a>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-[12px] leading-relaxed text-emerald-800">
              计费规则：你支付的费用 = 该模型对应厂商的官方 token 市场价。
              <span className="font-semibold">OceanLeo 不加价、不抽成</span>——你花的每一分，都是模型本身的 token 成本。
              每一笔开销都可在下方「用量记录」里点开，逐字审计本次发给模型与模型返回的全部内容。
              想完全免费？在下方填入你自己的厂商 API key（BYOK），用自己的 key 调用全程不扣你的钱包。
            </div>
          </div>
        </section>

        {/* BYOK：自带 API key 管理 */}
        <ByokKeys loggedIn={!!user} />

        {/* 用量记录 + 审计（迁自 /settings） */}
        <UsageHistory />

        {/* 我的模型选择总览：5 个类目 → 已选模型 / 供应商 / 价格 */}
        <SelectionSummary catalog={catalog} selection={selection} user={!!user} />

        {/* 价格来源 + 各厂商更新时间 + 下载 */}
        <section className="v-fade-up" style={{ animationDelay: "40ms" }}>
          <div className="rounded-2xl border border-neutral-200 p-5">
            <p className="text-[13px] font-semibold text-neutral-900">价格数据来源</p>
            <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">
              百炼/火山为官方价格页确定性解析，OpenRouter 为其官方 API 实时价。
              共收录 <span className="font-medium text-neutral-700">{modelCount}</span> 个模型。
            </p>
            <div className="mt-3 space-y-2.5">
              {providers.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[88px] text-[12px] font-medium text-neutral-800">{p.label}</span>
                  <span className="text-[11px] tabular-nums text-neutral-400">
                    {p.model_count} 个 · 更新 {fmtTime(p.generated_at) || "—"}
                  </span>
                  <a
                    href={pricingDocUrl(p.id, "html")}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 transition hover:bg-neutral-50"
                  >
                    在线查看
                  </a>
                  <a
                    href={pricingDocUrl(p.id, "pdf")}
                    className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 transition hover:bg-neutral-50"
                  >
                    PDF
                  </a>
                  <a
                    href={pricingDocUrl(p.id, "source")}
                    className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 transition hover:bg-neutral-50"
                  >
                    原始数据
                  </a>
                  {p.source_url && (
                    <a
                      href={p.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-400 transition hover:bg-neutral-50"
                    >
                      官方页 ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 模型市场：二维选择器（左=类目栏 / 上=厂商 tab / 中=单一可滚动列表） */}
        {!catalog || (catalog.groups?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-[13px] text-neutral-500">
            正在加载模型列表…
          </div>
        ) : (
          <ModelMarket
            groups={catalog.groups}
            globalProviders={providers}
            user={!!user}
            savingCat={savingCat}
            totalSelected={totalSelected}
            selection={selection}
            isSelected={isSelected}
            onToggle={toggle}
          />
        )}

        {checked && !user && (
          <p className="pb-4 text-center text-[12px] text-neutral-400">
            登录后即可选择厂商 + 模型并保存（全家桶通用）。
          </p>
        )}
      </div>
    </div>
  );
}

// 我的模型选择总览表：按类目（文本/图片/视频/3D/语音）列出用户当前选中的模型，
// 每行展示「模型名 · 供应商徽章 · 价格」。数据从已加载的 catalog 里按选择的复合
// key 解析（不额外发请求）。未选则提示去下方选择。
function SelectionSummary({
  catalog,
  selection,
  user,
}: {
  catalog: ModelCatalog | null;
  selection: Record<string, string[]>;
  user: boolean;
}) {
  const byKey = useMemo(() => {
    const m = new Map<string, CatalogModel>();
    for (const g of catalog?.groups || []) {
      for (const model of flattenGroup(g)) m.set(model.key, model);
    }
    return m;
  }, [catalog]);

  if (!catalog || (catalog.groups?.length ?? 0) === 0) return null;

  const total = Object.values(selection).reduce(
    (n, arr) => n + (arr?.length || 0),
    0,
  );

  return (
    <section className="v-fade-up" style={{ animationDelay: "20ms" }}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-neutral-900">
          我的模型选择
          <span className="ml-2 text-[11px] font-normal text-neutral-400">
            各 OceanLeo 应用会使用你在这里选好的模型
          </span>
        </h2>
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200">
        <table className="w-full text-left text-[12px]">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="w-[88px] px-3 py-2 font-medium">类目</th>
              <th className="px-3 py-2 font-medium">模型</th>
              <th className="w-[112px] px-3 py-2 font-medium">供应商</th>
              <th className="px-3 py-2 text-right font-medium">价格</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {catalog.groups.map((g) => {
              const keys = selection[g.id] || [];
              const models = keys
                .map((k) => byKey.get(k))
                .filter((m): m is CatalogModel => Boolean(m));
              if (models.length === 0) {
                return (
                  <tr key={g.id} className="align-top">
                    <td className="px-3 py-2.5 font-medium text-neutral-700">{g.label}</td>
                    <td className="px-3 py-2.5 text-neutral-400" colSpan={3}>
                      {user ? "未选择（在下方模型市场选择）" : "登录后查看你的选择"}
                    </td>
                  </tr>
                );
              }
              return models.map((m, idx) => (
                <tr key={m.key} className="align-top transition hover:bg-neutral-50/60">
                  <td className="px-3 py-2.5 font-medium text-neutral-700">
                    {idx === 0 ? g.label : ""}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-neutral-900">{m.label}</td>
                  <td className="px-3 py-2.5">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
                      {m.provider_label}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-neutral-600">
                    {priceText(m)}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-neutral-400">
        共已选 {total} 个模型（跨全部类目）。价格即 token 市场价，OceanLeo 不加价。
      </p>
    </section>
  );
}

// 模型市场（布局 A — 二维选择器）：
//   - 左侧竖栏 = 类目选择器（文本 / 图片 / 视频 / 3D / 语音），带每类目模型数徽章。
//   - 右上 = 厂商 tab（全部供应商 + 三厂商），厂商选择「全页保持」：切类目时若所选
//     厂商在新类目没有模型，自动回落到「全部供应商」。
//   - 右中 = 唯一一个固定高度可滚动列表，只渲染「当前类目 × 当前厂商」那一份。
//   - 搜索框作用于「当前类目 × 当前厂商」列表内。
// 整页纵向空间恒定，不再竖着堆 N 段长列表。移动端：左栏塌成顶部横向 pill 行。
function ModelMarket({
  groups,
  globalProviders,
  user,
  savingCat,
  totalSelected,
  selection,
  isSelected,
  onToggle,
}: {
  groups: CatalogGroup[];
  globalProviders: ModelCatalog["providers"];
  user: boolean;
  savingCat: string;
  totalSelected: number;
  selection: Record<string, string[]>;
  isSelected: (cat: string, key: string) => boolean;
  onToggle: (cat: string, key: string) => void;
}) {
  // 全局厂商 id→名映射（即使某类目没收录某厂商也能显示其名）。
  const providerLabels = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of globalProviders || []) m[p.id] = p.label;
    return m;
  }, [globalProviders]);

  // 厂商 tab：全部供应商 + 全部三个厂商（永远都在，保证二维结构一致）。
  const providerTabs = useMemo(
    () => [ALL_PROVIDERS, ...(globalProviders || []).map((p) => p.id)],
    [globalProviders],
  );

  const [activeCat, setActiveCat] = useState<string>(groups[0]?.id || "");
  // 厂商选择全页保持（你就想逛某一家时，切类目不打断）。
  const [activeProvider, setActiveProvider] = useState<string>(ALL_PROVIDERS);
  const [query, setQuery] = useState("");

  const group = useMemo(
    () => groups.find((g) => g.id === activeCat) || groups[0],
    [groups, activeCat],
  );

  // 当前类目里某厂商是否真有模型（用于 tab 禁用 / 计数 / 回落判断）。
  const providerCount = (provider: string) =>
    group ? modelsForProvider(group, provider).length : 0;

  // 厂商「全页保持」+ 自动回落：所选厂商在当前类目没有模型时显示「全部供应商」。
  const effectiveProvider =
    activeProvider !== ALL_PROVIDERS && providerCount(activeProvider) === 0
      ? ALL_PROVIDERS
      : activeProvider;

  const listModels = group ? modelsForProvider(group, effectiveProvider) : [];
  const filtered = useMemo(
    () => listModels.filter((m) => matchModel(m, query)),
    [listModels, query],
  );
  const showProvider = effectiveProvider === ALL_PROVIDERS;
  const saving = !!group && savingCat === group.id;

  return (
    <section className="v-fade-up" style={{ animationDelay: "80ms" }}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-neutral-900">
          模型市场
          <span className="ml-2 text-[11px] font-normal text-neutral-400">
            已选 {totalSelected} 个（跨全部类目）
          </span>
        </h2>
        {saving && <span className="text-[11px] text-neutral-400">保存中…</span>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200">
        <div className="flex flex-col sm:flex-row">
          {/* 左：类目选择器（桌面竖栏 / 移动顶部横向 pill） */}
          <div className="shrink-0 border-b border-neutral-100 bg-neutral-50/60 p-2 sm:w-[148px] sm:border-b-0 sm:border-r">
            <div className="flex gap-1.5 overflow-x-auto sm:flex-col sm:gap-1 sm:overflow-visible">
              {groups.map((g) => {
                const sel = (selection[g.id] || []).length;
                const active = g.id === group?.id;
                const showBadge = sel > 0 && !HIDE_SELECTED_BADGE_CATEGORIES.has(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => {
                      setActiveCat(g.id);
                      setQuery("");
                    }}
                    className={[
                      "flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition sm:w-full",
                      active
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-600 hover:bg-neutral-200/60",
                    ].join(" ")}
                  >
                    <span className="flex items-center gap-1.5">
                      <span>{g.label}</span>
                      {showBadge && (
                        <span
                          className={[
                            "rounded-full px-1.5 text-[10px] tabular-nums",
                            active ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700",
                          ].join(" ")}
                        >
                          {sel}
                        </span>
                      )}
                    </span>
                    <span
                      className={[
                        "text-[11px] tabular-nums",
                        active ? "text-white/60" : "text-neutral-400",
                      ].join(" ")}
                    >
                      {g.model_count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 右：厂商 tab + 搜索 + 列表 */}
          <div className="min-w-0 flex-1 p-3">
            {/* 厂商 tab（全页保持） */}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {providerTabs.map((pId) => {
                const count = providerCount(pId);
                const active = pId === effectiveProvider;
                const disabled = pId !== ALL_PROVIDERS && count === 0;
                return (
                  <button
                    key={pId}
                    type="button"
                    disabled={disabled}
                    onClick={() => setActiveProvider(pId)}
                    className={[
                      "rounded-full px-3 py-1 text-[12px] font-medium transition",
                      active
                        ? "bg-neutral-900 text-white"
                        : disabled
                          ? "cursor-not-allowed bg-neutral-50 text-neutral-300"
                          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200",
                    ].join(" ")}
                  >
                    {providerLabel(pId, providerLabels)}
                    <span
                      className={[
                        "ml-1",
                        active ? "text-white/70" : disabled ? "text-neutral-300" : "text-neutral-400",
                      ].join(" ")}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 当前「类目 × 厂商」列表内的搜索框 */}
            <div className="mb-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`在「${group?.label || ""} · ${providerLabel(
                  effectiveProvider,
                  providerLabels,
                )}」中搜索模型…`}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-800 outline-none transition placeholder:text-neutral-400 focus:border-neutral-400"
              />
            </div>

            {/* 唯一一个固定高度可滚动列表 */}
            <div className="max-h-[400px] overflow-y-auto rounded-xl border border-neutral-200">
              {filtered.length === 0 ? (
                <p className="px-3.5 py-10 text-center text-[12px] text-neutral-400">
                  {query ? "没有匹配的模型" : "该类目下此供应商暂无模型"}
                </p>
              ) : (
                filtered.map((m, mi) => (
                  <ModelRow
                    key={m.key}
                    m={m}
                    first={mi === 0}
                    showProvider={showProvider}
                    user={user}
                    selected={group ? isSelected(group.id, m.key) : false}
                    onToggle={() => group && onToggle(group.id, m.key)}
                  />
                ))
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-400">
              共 {filtered.length} 个{query ? "（已过滤）" : ""} · 在容器内滚动查看与选择
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModelRow({
  m,
  first,
  showProvider,
  user,
  selected,
  onToggle,
}: {
  m: CatalogModel;
  first: boolean;
  showProvider?: boolean;
  user: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={!user}
      onClick={onToggle}
      className={[
        "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition",
        first ? "" : "border-t border-neutral-100",
        selected ? "bg-neutral-50" : "hover:bg-neutral-50/60",
        !user ? "cursor-default" : "",
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
        <span className="truncate text-[13px] font-medium text-neutral-900">{m.label}</span>
        {showProvider && (
          <span className="shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
            {m.provider_label}
          </span>
        )}
      </span>
      <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-neutral-600">
        {priceText(m)}
      </span>
    </button>
  );
}
