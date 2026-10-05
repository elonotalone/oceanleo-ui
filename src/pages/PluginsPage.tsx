"use client";

// ============================================================================
// @oceanleo/ui — 「插件与连接器」统一页面（单一事实源）
// ----------------------------------------------------------------------------
// 技能、连接器与 MCP 服务器。目录来自网关 /v1/mcp/catalog（阿里云市场 MCP 快照，
// 公开只读）。全 OceanLeo 系列共享同一份目录。各站把它包进自己的 <AppShell>，
// 放在 /plugins 路由。组织共用的连接器不在这一页：去组织页查看和设置。
// ============================================================================

import { useState, type ReactNode } from "react";
import { currencySymbol, formatMinor } from "../lib/money";
import { PageHeader } from "./PageHeader";
import { ConnectorsSection } from "./plugins/ConnectorsSection";
import { ConnectorIcon } from "./plugins/connector-icons";
import { SkillsSection } from "./plugins/SkillsSection";
import { useUI } from "../i18n/ui/useUI";
import { usePluginsCatalog } from "../shell/usePluginsCatalog";

export {
  canManageOrgMcp,
  normalizeOrgMcpConnections,
  shouldRenderOrgSection,
  type OrgMcpConnection,
} from "../shell/usePluginsCatalog";

export {
  connectMcp,
  disconnectMcp,
  getMcpConnections,
  getMcpRegistry,
  mcpGatewayDetail,
  mcpOauthMessageOrigin,
  mcpOauthOpensPortalPage,
  mcpOauthPortalPageHref,
  mcpOauthReturnOrigin,
  probeMcp,
  startMcpOauth,
  toggleMcp,
  type McpConnection,
  type McpConnectorMeta,
} from "../lib/mcp-api";

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
function formatCatalogPrice(
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

export interface PluginsPageProps {
  accent?: string;
  title?: ReactNode;
  /**
   * `page`（缺省）：独立的 `/plugins` 页，带统一页头。
   * `pane`：嵌在设置窗「插件与连接器」面板里。面板区自带标题与滚动，所以不渲染页头
   * （页头的「返回」会把设置窗背后的页面退回上一页），也不占整页高度。
   */
  variant?: "page" | "pane";
}

export function PluginsPage({ accent = "#4f46e5", title, variant = "page" }: PluginsPageProps) {
  const tt = useUI();
  const pane = variant === "pane";
  const {
    items,
    loading,
    error,
    showMarketplace,
  } = usePluginsCatalog();
  const [q, setQ] = useState("");
  const [oauthOnly, setOauthOnly] = useState(false);

  const filtered = q.trim()
    ? items.filter((it) =>
        `${it.name || ""}${it.vendor || ""}${it.description || ""}`
          .toLowerCase()
          .includes(q.trim().toLowerCase()),
      )
    : items;

  return (
    <div
      className={pane ? "min-h-0" : "px-8 py-6"}
      data-plugins-pane={pane ? "" : undefined}
    >
      {!pane && <PageHeader title={typeof title === "string" ? title : tt("插件与连接器")} />}
      <p className={pane ? "text-[13px] text-neutral-500" : "mt-1 text-center text-[13px] text-neutral-500"}>{tt("技能、连接器与 MCP 服务器，接入后即可在全 OceanLeo 系列中调用。")}</p>

      <div className={pane ? "mt-4 max-w-3xl" : "mx-auto mt-6 max-w-3xl"}>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tt("搜索连接器与技能（名称、描述、分类）")}
            className="min-w-[16rem] flex-1 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-[14px] outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus:border-neutral-400"
          />
          <button
            type="button"
            aria-pressed={oauthOnly}
            onClick={() => setOauthOnly((v) => !v)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${
              oauthOnly
                ? "bg-sky-100 text-sky-800"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {tt("可一键授权")}
          </button>
        </div>

        <SkillsSection search={q} />

        {showMarketplace ? (
          error ? (
            <p className="mt-8 text-center text-sm text-neutral-500">{error}</p>
          ) : loading ? (
            <div data-mcp-catalog className="mt-6 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p data-mcp-catalog className="mt-8 text-center text-sm text-neutral-500">
              {tt("没有匹配的连接器。")}
            </p>
          ) : (
            <div data-mcp-catalog data-mcp-catalog-grid className="mt-6 grid gap-3 sm:grid-cols-2">
              {filtered.map((it, i) => (
                <a
                  key={it.code || i}
                  data-mcp-catalog-card={it.code || it.name || ""}
                  href={it.detail_url || "#"}
                  target={it.detail_url ? "_blank" : undefined}
                  rel="noreferrer"
                  className="group flex flex-col rounded-2xl border border-neutral-200 bg-white p-4 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    {it.image_url ? (
                      <img
                        data-mcp-catalog-image
                        src={it.image_url}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <ConnectorIcon id={it.code} label={it.name || it.vendor || it.code} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[14px] font-semibold text-neutral-900">
                          {it.name || it.code}
                        </span>
                        {it.free ? (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
                            {tt("免费")}
                          </span>
                        ) : it.price != null && it.price !== "" ? (
                          <span
                            data-mcp-catalog-price
                            className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ background: `${accent}1a`, color: accent }}
                          >
                            {formatCatalogPrice(it.price, it.currency, it.amount_minor)}/{it.unit || tt("次")}
                          </span>
                        ) : null}
                      </div>
                      {it.vendor && (
                        <span className="mt-0.5 block text-[12px] text-neutral-400">{it.vendor}</span>
                      )}
                    </div>
                  </div>
                  {it.description && (
                    <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-neutral-500">
                      {it.description}
                    </p>
                  )}
                </a>
              ))}
            </div>
          )
        ) : null}

        <ConnectorsSection search={q} oauthOnly={oauthOnly} />
      </div>
    </div>
  );
}
