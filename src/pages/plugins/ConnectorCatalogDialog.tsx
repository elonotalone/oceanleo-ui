"use client";

// 设置页「连接器」→「+ 添加连接器 ▾」→「从连接器目录添加」打开的大弹窗（skills-overhaul W10）。
// 分类页签 + 搜索 + 卡片网格。点注册表卡片 → 原来的连接对话框（一键授权 / 令牌 / 探活全部照旧，
// 由 useConnectorController 提供）。国内版把阿里云市场目录并成其中一个页签：卡片点开显示说明与
// 「去阿里云开通 ↗」外链，不再是设置页上另一大块。

import { useMemo, useState } from "react";

import { useUI } from "../../i18n/ui/useUI";
import type { McpItem } from "../../lib/database";
import { currencySymbol, formatMinor } from "../../lib/money";
import { ConfigDialogShell, ConfigEmptyState, ConfigToolbar } from "../../shell/skills/kit";
import { ConnectorIcon } from "./connector-icons";
import {
  CATALOG_ALL,
  CATALOG_MARKETPLACE,
  catalogMarketplaceItems,
  catalogRegistryItems,
  catalogTabs,
  safeExternalHref,
} from "./connector-logic";
import { ConnectorCard, type ConnectorController } from "./ConnectorsSection";
import { InTreeDialog } from "./parts";

/** 叠在大弹窗（z-1000）之上的小对话框层级。 */
export const OVER_CONFIG_DIALOG_Z = "z-[1020]";

/**
 * 插件目录的 `currency` 历史上既可能是货币码（"CNY" / "USD"）也可能直接是符号（"¥"）。
 * 码走共享符号表；已经是符号的原样用；空的按账本默认（CNY → ¥），不猜美元。
 */
function pluginPriceSymbol(currency: string | undefined): string {
  const raw = (currency || "").trim();
  if (raw && !/^[A-Za-z]{3}$/.test(raw)) return raw;
  return currencySymbol(raw);
}

/** 市场报价是主单位 float；最多 4 位小数，去掉长尾。有 amount_minor 时走账本格式。 */
export function formatCatalogPrice(
  price: number | string,
  currency: string | undefined,
  amountMinor?: number,
): string {
  if (typeof amountMinor === "number" && Number.isFinite(amountMinor)) {
    return formatMinor(amountMinor, currency);
  }
  const n = typeof price === "number" ? price : Number(String(price).trim());
  if (!Number.isFinite(n)) return `${pluginPriceSymbol(currency)}${price}`;
  const trimmed = n.toFixed(4).replace(/\.?0+$/, "");
  return `${pluginPriceSymbol(currency)}${trimmed}`;
}

export interface ConnectorCatalogDialogProps {
  open: boolean;
  onClose: () => void;
  controller: ConnectorController;
  /** 国内版：阿里云市场目录（usePluginsCatalog）。海外版传 `showMarketplace: false`。 */
  marketplace: {
    showMarketplace: boolean;
    items: McpItem[];
    loading: boolean;
    error: string | null;
    reload: () => void;
  };
  accent?: string;
}

export function ConnectorCatalogDialog({
  open,
  onClose,
  controller,
  marketplace,
  accent = "#4f46e5",
}: ConnectorCatalogDialogProps) {
  const tt = useUI();
  const [tab, setTab] = useState(CATALOG_ALL);
  const [q, setQ] = useState("");
  const [market, setMarket] = useState<McpItem | null>(null);
  const withMarketplace = marketplace.showMarketplace;
  const tabs = useMemo(
    () => catalogTabs(controller.registry, withMarketplace),
    [controller.registry, withMarketplace],
  );
  const registryItems = catalogRegistryItems(controller.registry, tab, q);
  const marketItems = catalogMarketplaceItems(marketplace.items, tab, q, withMarketplace);
  const showMarketBlock = withMarketplace && (tab === CATALOG_ALL || tab === CATALOG_MARKETPLACE);

  function tabLabel(id: string): string {
    if (id === CATALOG_ALL) return tt("全部");
    if (id === CATALOG_MARKETPLACE) return tt("阿里云市场");
    return tt(id);
  }

  const registryBody =
    tab === CATALOG_MARKETPLACE ? null : controller.registryStatus === "loading" ? (
      <p className="py-10 text-center text-[13px] text-neutral-500">{tt("连接器目录加载中…")}</p>
    ) : controller.registryStatus === "error" ? (
      <div className="rounded-2xl border border-dashed border-red-200 bg-red-50 p-8 text-center">
        <p className="text-[13px] text-red-800">{tt("连接器目录加载失败")}</p>
        {controller.registryError ? (
          <p className="mt-1 text-[12px] text-red-700">{controller.registryError}</p>
        ) : null}
        <button
          type="button"
          onClick={() => void controller.loadRegistry()}
          className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800"
        >
          {tt("重试")}
        </button>
      </div>
    ) : registryItems.length > 0 ? (
      <div data-mcp-catalog-registry className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {registryItems.map((c) => (
          <ConnectorCard
            key={c.id}
            connector={c}
            connection={controller.connByConnector.get(c.id)}
            stale={controller.staleIds.has(c.id)}
            onClick={() => controller.openConnector(c)}
          />
        ))}
      </div>
    ) : null;

  const marketBody = !showMarketBlock ? null : marketplace.error ? (
    <div className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center">
      <p className="text-[13px] text-neutral-500">{marketplace.error}</p>
      <button
        type="button"
        onClick={marketplace.reload}
        className="mt-3 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50"
      >
        {tt("重试")}
      </button>
    </div>
  ) : marketplace.loading ? (
    <div data-mcp-catalog className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
      ))}
    </div>
  ) : marketItems.length > 0 ? (
    <div data-mcp-catalog data-mcp-catalog-grid className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {marketItems.map((it, i) => (
        <MarketplaceCard key={it.code || i} item={it} accent={accent} onOpen={() => setMarket(it)} />
      ))}
    </div>
  ) : null;

  const nothing =
    controller.registryStatus === "ready" &&
    registryItems.length === 0 &&
    (!showMarketBlock || (!marketplace.loading && !marketplace.error && marketItems.length === 0));

  return (
    <ConfigDialogShell
      open={open}
      onClose={onClose}
      size="xl"
      testId="connector-catalog"
      title={tt("连接器目录")}
      subtitle={tt("连接应用与 API（MCP）。连接后 Agent 在任务中可直接调用该服务的工具。")}
      toolbar={
        <div className="space-y-4">
          <ConfigToolbar
            search={{ value: q, onChange: setQ, placeholder: tt("搜索连接器（名称、描述、分类）") }}
          />
          <div
            role="tablist"
            aria-label={tt("分类")}
            data-connector-catalog-tabs
            className="flex flex-wrap gap-1.5"
          >
            {tabs.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                data-connector-catalog-tab={id}
                onClick={() => setTab(id)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${
                  tab === id
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                    : "bg-white text-neutral-600 ring-1 ring-neutral-200 hover:bg-neutral-50 dark:bg-neutral-900 dark:text-neutral-300 dark:ring-neutral-700"
                }`}
              >
                {tabLabel(id)}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div data-connector-catalog className="space-y-8">
        {registryBody}
        {showMarketBlock ? (
          <section data-connector-catalog-marketplace className="space-y-3">
            {tab === CATALOG_ALL ? (
              <h3 className="text-[13px] font-medium text-neutral-500">{tt("阿里云市场")}</h3>
            ) : null}
            {marketBody}
          </section>
        ) : null}
        {nothing ? (
          <ConfigEmptyState title={tt("没有匹配的连接器")} />
        ) : null}
      </div>

      {market ? <MarketplaceDetail item={market} accent={accent} onClose={() => setMarket(null)} /> : null}
      {open ? controller.dialogs : null}
    </ConfigDialogShell>
  );
}

function MarketplacePrice({ item, accent }: { item: McpItem; accent: string }) {
  const tt = useUI();
  if (item.free) {
    return (
      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
        {tt("免费")}
      </span>
    );
  }
  if (item.price == null || item.price === "") return null;
  return (
    <span
      data-mcp-catalog-price
      className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: `${accent}1a`, color: accent }}
    >
      {formatCatalogPrice(item.price, item.currency, item.amount_minor)}/{item.unit || tt("次")}
    </span>
  );
}

function MarketplaceLogo({ item, large }: { item: McpItem; large?: boolean }) {
  return item.image_url ? (
    <img
      data-mcp-catalog-image
      src={item.image_url}
      alt=""
      className={`${large ? "h-12 w-12" : "h-9 w-9"} shrink-0 rounded-lg object-cover`}
    />
  ) : (
    <ConnectorIcon id={item.code} label={item.name || item.vendor || item.code} size={large ? "lg" : undefined} />
  );
}

function MarketplaceCard({
  item,
  accent,
  onOpen,
}: {
  item: McpItem;
  accent: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      data-mcp-catalog-card={item.code || item.name || ""}
      onClick={onOpen}
      className="flex w-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-start gap-3">
        <MarketplaceLogo item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[15px] font-semibold text-neutral-900 dark:text-neutral-100">
              {item.name || item.code}
            </span>
            <MarketplacePrice item={item} accent={accent} />
          </div>
          {item.vendor ? (
            <span className="mt-0.5 block text-[12px] text-neutral-400">{item.vendor}</span>
          ) : null}
        </div>
      </div>
      {item.description ? (
        <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-neutral-500">{item.description}</p>
      ) : null}
    </button>
  );
}

function MarketplaceDetail({
  item,
  accent,
  onClose,
}: {
  item: McpItem;
  accent: string;
  onClose: () => void;
}) {
  const tt = useUI();
  const href = safeExternalHref(item.detail_url);
  return (
    <InTreeDialog onClose={onClose} wide testId="mcp-marketplace-detail" zClassName={OVER_CONFIG_DIALOG_Z}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <MarketplaceLogo item={item} large />
          <div className="min-w-0">
            <h3 className="truncate text-[18px] font-semibold text-neutral-900">{item.name || item.code}</h3>
            <p className="mt-0.5 text-[12px] text-neutral-500">
              {[item.vendor, tt("阿里云市场")].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label={tt("关闭")}
          onClick={onClose}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          ✕
        </button>
      </div>
      <div className="mb-4">
        <MarketplacePrice item={item} accent={accent} />
      </div>
      {item.description ? (
        <p className="whitespace-pre-line text-[14px] leading-relaxed text-neutral-700">{item.description}</p>
      ) : null}
      <p className="mt-4 text-[12px] text-neutral-500">
        {tt("这是阿里云市场上的 MCP 服务，需要先在阿里云开通，再把服务地址填进「自定义 MCP 服务器」。")}
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-neutral-200 px-4 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50"
        >
          {tt("取消")}
        </button>
        {href ? (
          <a
            data-mcp-marketplace-open
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800"
          >
            {tt("去阿里云开通 ↗")}
          </a>
        ) : null}
      </div>
    </InTreeDialog>
  );
}
