"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  browserClient,
  oceanleoConfigured,
  loginUnavailableNotice,
  getModelCatalog,
  pricingDocUrl,
  type CatalogGroup,
  type ModelCatalog,
  type ProviderMeta,
} from "../lib/auth";
import { checkedAgo } from "../lib/model-search";
import { useUI } from "../i18n/ui/useUI";
import { ByokKeys } from "./ByokKeys";
import { ModelGroupManager } from "./ModelCapabilityMarket";
import { PageHeader } from "./PageHeader";
import { BYOK_STATUS_CHANGED_EVENT } from "../shell/byok-status";

const API_PANES = [
  { id: "selection", label: "模型选择" },
  { id: "byok", label: "自带 API key（BYOK）" },
] as const;

type ApiPane = (typeof API_PANES)[number]["id"];

function readApiPane(href?: string): ApiPane {
  try {
    const url = new URL(
      href || (typeof window !== "undefined" ? window.location.href : "https://oceanleo.com/"),
      "https://oceanleo.com",
    );
    const raw = url.searchParams.get("pane") || "";
    if (raw === "byok" || raw === "guide" || url.searchParams.get("guide") === "1") {
      return "byok";
    }
    return "selection";
  } catch {
    return "selection";
  }
}

function writeApiPane(next: ApiPane) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.delete("guide");
  if (next === "byok") url.searchParams.set("pane", "byok");
  else { url.searchParams.delete("pane"); url.searchParams.delete("connection"); }
  const href = `${url.pathname}${url.search}${url.hash}`;
  const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (here !== href) {
    window.history.replaceState(window.history.state, "", href);
  }
}

function fmtTime(iso: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function catalogSourceProviders(catalog: ModelCatalog | null): ProviderMeta[] {
  const seen = new Map<string, ProviderMeta>();
  for (const provider of catalog?.providers || []) {
    if (provider.id) seen.set(provider.id, provider);
  }
  const absorb = (id: string, label: string, sourceUrl: string, updatedAt: string, count: number) => {
    if (!id || seen.has(id)) return;
    seen.set(id, {
      id,
      label: label || id,
      source_url: sourceUrl || "",
      source_kind: "",
      generated_at: updatedAt || "",
      model_count: count,
    });
  };
  const walk = (groups: CatalogGroup[] | undefined) => {
    for (const group of groups || []) {
      for (const block of group.providers || []) {
        absorb(block.id, block.label, block.source_url, block.updated_at, block.models?.length || 0);
      }
      for (const capability of group.capabilities || []) {
        for (const block of capability.providers || []) {
          absorb(block.id, block.label, block.source_url, block.updated_at, block.models?.length || 0);
        }
      }
    }
  };
  walk(catalog?.groups);
  return [...seen.values()];
}

export interface ApiPageProps {
  onLogin?: () => void;
  billingHref?: string;
  /**
   * `page`（缺省）：独立的 `/api` 页，带统一页头。
   * `pane`：嵌在设置窗「AI 模型」面板里。面板区自带标题与滚动，所以不渲染页头
   * （页头的「返回」会把设置窗背后的页面退回上一页），也不占整页。
   */
  variant?: "page" | "pane";
}

/** Shared AI-model market page used by the main site and every subsite. */
export function ApiPage({
  onLogin,
  billingHref = "/settings/billing",
  variant = "page",
}: ApiPageProps = {}) {
  void onLogin;
  void billingHref;
  const tt = useUI();
  const pane = variant === "pane";
  const frameClass = pane ? "min-h-0" : "px-8 py-6";
  const paneMark = pane ? "" : undefined;
  const [apiPane, setApiPane] = useState<ApiPane>(() => readApiPane());
  const [openedPanes, setOpenedPanes] = useState<ApiPane[]>(() => [readApiPane()]);
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [byokConnectionId, setByokConnectionId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URL(window.location.href).searchParams.get("connection") || "";
  });

  useEffect(() => {
    setOpenedPanes((opened) => opened.includes(apiPane) ? opened : [...opened, apiPane]);
  }, [apiPane]);

  useEffect(() => {
    const client = browserClient();
    if (!client) {
      setChecked(true);
      return;
    }
    let active = true;
    let authChanged = false;
    // This is display state; the gateway validates every authenticated request.
    // Restoring the local session avoids waiting for another auth network call.
    void client.auth.getSession().then(({ data }) => {
      if (!active || authChanged) return;
      setUser(data.session?.user ?? null);
      setChecked(true);
    }).catch(() => {
      if (active && !authChanged) setChecked(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      authChanged = true;
      setUser(session?.user ?? null);
      setChecked(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!checked) return;
    let active = true;
    let request = 0;
    function refreshCatalog() {
      const current = ++request;
      void getModelCatalog().then((result) => {
        if (active && current === request && result.ok && result.data) setCatalog(result.data);
      });
    }
    setCatalog(null);
    refreshCatalog();
    window.addEventListener(BYOK_STATUS_CHANGED_EVENT, refreshCatalog);
    return () => {
      active = false;
      window.removeEventListener(BYOK_STATUS_CHANGED_EVENT, refreshCatalog);
    };
  }, [checked, user?.id]);

  useEffect(() => {
    function sync() {
      setApiPane(readApiPane());
      setByokConnectionId(new URL(window.location.href).searchParams.get("connection") || "");
    }
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function selectApiPane(next: ApiPane) {
    if (next !== "byok") setByokConnectionId("");
    setApiPane(next);
    writeApiPane(next);
  }

  if (!oceanleoConfigured()) {
    const notice = loginUnavailableNotice();
    return (
      <div className={frameClass} data-api-pane={paneMark}>
        {!pane && <PageHeader title={tt("AI 模型")} />}
        <div className={`${pane ? "" : "mx-auto mt-10 "}max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800`}>
          <p className="text-[14px] font-medium">{tt(notice?.title || "")}</p>
          {notice?.detail && (
            <p className="mt-1.5 text-[13px] text-amber-700">{tt(notice.detail)}</p>
          )}
        </div>
      </div>
    );
  }

  const providers = catalogSourceProviders(catalog);
  const tabs = (
    <div className="flex gap-1" data-api-settings-tabs="" role="tablist">
      {API_PANES.map((item) => {
        const active = apiPane === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-api-settings-tab={item.id}
            aria-selected={active}
            className={`rounded-lg px-3 py-2 text-[13px] font-medium ${
              active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
            }`}
            onClick={() => selectApiPane(item.id)}
          >
            {tt(item.label)}
          </button>
        );
      })}
    </div>
  );
  const selection = (
    <div className="space-y-8" data-api-selection="">
      <ModelGroupManager
        key={user?.id || "guest"}
        catalog={catalog}
        user={!!user}
        onSetupByok={(connectionId) => { setByokConnectionId(connectionId || ""); selectApiPane("byok"); }}
      />
      <section className="v-fade-up" style={{ animationDelay: "40ms" }}>
        <div className="rounded-2xl border border-neutral-200 p-5">
          <p className="text-[13px] font-semibold text-neutral-900">{tt("价格数据来源")}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">
            {tt("价格来自各厂商官方实时源，每小时自动更新。共收录")}{" "}
            <span className="font-medium text-neutral-700">
              {catalog?.model_count || 0}
            </span>{" "}
            {tt("个模型。")}
          </p>
          <div className="mt-3 space-y-2.5">
            {providers.map((provider) => {
              const checkedAt = provider.checked_at || catalog?.pricing?.checked_at;
              const ago = checkedAt ? checkedAgo(checkedAt) : null;
              const agoKey =
                ago?.unit === "minute"
                  ? "{n} 分钟前核对过"
                  : ago?.unit === "hour"
                    ? "{n} 小时前核对过"
                    : "{n} 天前核对过";
              return (
              <div key={provider.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-[88px] text-[12px] font-medium text-neutral-800">
                  {tt(provider.label)}
                </span>
                <span className="text-[11px] tabular-nums text-neutral-400">
                  {tt("{n} 个 · 更新 {time}", {
                    n: provider.model_count,
                    time: fmtTime(provider.generated_at) || "—",
                  })}
                </span>
                {ago ? (
                  <span data-provider-checked={provider.id} className="text-[11px] text-neutral-400">
                    {tt(agoKey, { n: ago.n })}
                  </span>
                ) : null}
                {(["html", "pdf", "source"] as const).map((kind) => (
                  <a
                    key={kind}
                    href={pricingDocUrl(provider.id, kind)}
                    target={kind === "html" ? "_blank" : undefined}
                    rel={kind === "html" ? "noreferrer" : undefined}
                    className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50"
                  >
                    {kind === "html" ? tt("在线查看") : kind === "source" ? tt("原始数据") : "PDF"}
                  </a>
                ))}
                {provider.source_url && (
                  <a
                    href={provider.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-400 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50"
                  >
                    {tt("官方页 ↗")}
                  </a>
                )}
              </div>
              );
            })}
          </div>
        </div>
      </section>
      {checked && !user && (
        <p className="pb-4 text-center text-[12px] text-neutral-400">
          {tt("登录后即可创建具名组合，并在全家桶按同一兜底顺序使用。")}
        </p>
      )}
    </div>
  );
  const byok = (
    <div className="space-y-8" data-api-byok="">
      <ByokKeys loggedIn={!!user} initialConnectionId={byokConnectionId} />
    </div>
  );

  return (
    <div className={frameClass} data-api-pane={paneMark}>
      {!pane && <PageHeader title={tt("AI 模型")} />}
      <div className={`${pane ? "" : "mx-auto mt-6 "}max-w-3xl space-y-6`}>
        {tabs}
        <div hidden={apiPane !== "selection"}>{openedPanes.includes("selection") ? selection : null}</div>
        <div hidden={apiPane !== "byok"}>{openedPanes.includes("byok") ? byok : null}</div>
      </div>
    </div>
  );
}
