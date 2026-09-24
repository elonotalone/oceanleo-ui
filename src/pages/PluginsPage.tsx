"use client";

// ============================================================================
// @oceanleo/ui — 「插件与连接器」统一页面（单一事实源）
// ----------------------------------------------------------------------------
// 技能、连接器与 MCP 服务器。目录来自网关 /v1/mcp/catalog（阿里云市场 MCP 快照，
// 公开只读）。全 OceanLeo 系列共享同一份目录。各站把它包进自己的 <AppShell>，
// 放在 /plugins 路由。
//
// 企业版（2026-09）在目录之上多一块「组织提供」：管理员在组织里连一次，成员这里
// 自动出现，成员不填凭证也删不掉。没有组织的人看到的页面与今天逐像素一致。
// ============================================================================

import { useState, type ReactNode } from "react";
import { currencySymbol } from "../lib/money";
import {
  upsertOrgMcpConnection,
  type OrgSummary,
} from "../lib/org-api";
import { PageHeader } from "./PageHeader";
import { ConnectorsSection } from "./plugins/ConnectorsSection";
import { SkillsSection } from "./plugins/SkillsSection";
import { useUI } from "../i18n/ui/useUI";
import {
  canManageOrgMcp,
  quietOrg,
  shouldRenderOrgSection,
  usePluginsCatalog,
} from "../shell/usePluginsCatalog";

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
    orgs,
    orgConnections,
    refreshOrgConnections,
    busyConnector,
    patchConnection,
    removeConnection,
    setForwardIdentity,
  } = usePluginsCatalog();
  const [q, setQ] = useState("");
  const [oauthOnly, setOauthOnly] = useState(false);
  const [connectForOrg, setConnectForOrg] = useState<string | null>(null);

  const manageableOrgs = orgs.filter((org) => canManageOrgMcp(org.role));
  const showOrgSection = shouldRenderOrgSection({ orgs, connections: orgConnections });

  const filtered = q.trim()
    ? items.filter((it) =>
        `${it.name || ""}${it.vendor || ""}${it.description || ""}`
          .toLowerCase()
          .includes(q.trim().toLowerCase()),
      )
    : items;

  return (
    <div
      className={pane ? "min-h-0 overflow-y-auto overscroll-contain" : "px-8 py-6"}
      data-plugins-pane={pane ? "" : undefined}
    >
      {!pane && <PageHeader title={typeof title === "string" ? title : tt("插件与连接器")} />}
      <p className={pane ? "text-[13px] text-neutral-500" : "mt-1 text-center text-[13px] text-neutral-500"}>{tt("技能、连接器与 MCP 服务器，接入后即可在全 OceanLeo 系列中调用。")}</p>

      <div className={pane ? "mt-4 max-w-3xl" : "mx-auto mt-6 max-w-3xl"}>
        {showOrgSection && (
          <section data-org-mcp-section className="mb-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-neutral-900">{tt("组织提供")}</h2>
              {manageableOrgs.length > 0 && (
                <button
                  type="button"
                  data-org-mcp-connect-entry
                  onClick={() => setConnectForOrg(manageableOrgs[0].id)}
                  className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-neutral-800"
                >
                  {tt("为组织连接")}
                </button>
              )}
            </div>
            <p className="mb-3 mt-0.5 text-[12px] text-neutral-500">
              {manageableOrgs.length > 0
                ? tt("在组织里连一次，组织成员的插件页会自动出现这条连接，成员不用各自填凭证。")
                : tt("组织提供的连接由管理员统一管理，你可以直接使用，不需要填凭证。")}
            </p>
            {orgConnections.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center">
                <p className="text-[13px] text-neutral-500">{tt("这个组织还没有连接任何 MCP 服务器。")}</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {orgConnections.map((row) => {
                  const manageable = manageableOrgs.some((org) => org.id === row.orgId);
                  const busy = busyConnector === row.connectorId;
                  return (
                    <div
                      key={`${row.orgId}:${row.connectorId}`}
                      data-org-mcp-row={row.connectorId}
                      className="rounded-2xl border border-neutral-200 bg-white p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-lg">
                          {row.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[14px] font-semibold text-neutral-900">{row.label}</span>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                row.enabled ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
                              }`}
                            >
                              {row.enabled ? tt("已启用") : tt("已停用")}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[12px] text-neutral-500">
                            {tt("由组织 {name} 提供", { name: row.orgName })}
                            {" · "}
                            {tt("{n} 个工具", { n: row.toolsCount })}
                          </p>
                        </div>
                      </div>
                      {manageable && (
                        <div data-org-mcp-manage className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patchConnection(row, { enabled: !row.enabled })}
                            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                          >
                            {row.enabled ? tt("停用") : tt("启用")}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            aria-pressed={row.memberVisible}
                            onClick={() => void patchConnection(row, { memberVisible: !row.memberVisible })}
                            className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                          >
                            {tt("成员可见")}
                          </button>
                          <label
                            data-org-mcp-forward-identity
                            className="flex max-w-full items-start gap-2 text-[12px] text-neutral-700"
                          >
                            <input
                              type="checkbox"
                              disabled={busy}
                              checked={row.forwardMemberIdentity}
                              onChange={(e) => void setForwardIdentity(row, e.target.checked)}
                              className="mt-0.5"
                            />
                            <span>
                              <span className="block">{tt("把成员身份转给这台服务器")}</span>
                              <span className="mt-0.5 block text-[11px] text-neutral-500">
                                {tt("开了以后服务器知道是哪位成员在操作、各看各的工作区；关着时服务器只知道是本组织。")}
                              </span>
                            </span>
                          </label>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removeConnection(row)}
                            className="rounded-lg px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50 disabled:opacity-60"
                          >
                            {tt("断开")}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

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

        {error ? (
          <p className="mt-8 text-center text-sm text-neutral-500">{error}</p>
        ) : loading ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-8 text-center text-sm text-neutral-500">{tt("没有匹配的连接器。")}</p>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {filtered.map((it, i) => (
              <a
                key={it.code || i}
                href={it.detail_url || "#"}
                target={it.detail_url ? "_blank" : undefined}
                rel="noreferrer"
                className="group flex flex-col rounded-2xl border border-neutral-200 bg-white p-4 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[14px] font-semibold text-neutral-900">{it.name || it.code}</span>
                  {it.free ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">{tt("免费")}</span>
                  ) : it.price != null && it.price !== "" ? (
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${accent}1a`, color: accent }}>
                      {pluginPriceSymbol(it.currency)}{it.price}/{it.unit || tt("次")}
                    </span>
                  ) : null}
                </div>
                {it.vendor && <span className="mt-0.5 text-[12px] text-neutral-400">{it.vendor}</span>}
                {it.description && <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-neutral-500">{it.description}</p>}
              </a>
            ))}
          </div>
        )}

        <ConnectorsSection search={q} oauthOnly={oauthOnly} />
      </div>

      {connectForOrg !== null && (
        <OrgConnectDialog
          orgs={manageableOrgs}
          initialOrgId={connectForOrg}
          onClose={() => setConnectForOrg(null)}
          onConnected={async () => {
            setConnectForOrg(null);
            await refreshOrgConnections();
          }}
        />
      )}
    </div>
  );
}

/**
 * 「为组织连接」对话框。
 *
 * 共享页这一份历史上没有个人连接对话框（个人连接在主站自绘那份里），所以这里按
 * 主站同一组字段自建一份最小的：连接器、服务地址、凭证、名称。凭证只往网关送一次，
 * 之后连管理员自己也读不回来。
 */
function OrgConnectDialog({
  orgs,
  initialOrgId,
  onClose,
  onConnected,
}: {
  orgs: OrgSummary[];
  initialOrgId: string;
  onClose: () => void;
  onConnected: () => void | Promise<void>;
}) {
  const tt = useUI();
  const [orgId, setOrgId] = useState(initialOrgId);
  const [connectorId, setConnectorId] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [memberVisible, setMemberVisible] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit() {
    if (!connectorId.trim()) return;
    setSubmitting(true);
    setFailed(false);
    // body 是 org-api 的 `OrgMcpConnectBody`（camelCase）；snake_case 转换在 org-api 里做。
    const res = await quietOrg(() =>
      upsertOrgMcpConnection(orgId, {
        connectorId: connectorId.trim(),
        endpoint: endpoint.trim(),
        token: token.trim(),
        label: label.trim() || connectorId.trim(),
        memberVisible,
      }),
    );
    setSubmitting(false);
    if (res === null) {
      setFailed(true);
      return;
    }
    await onConnected();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div data-org-mcp-dialog className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-neutral-900">{tt("为组织连接 MCP")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3">
          {orgs.length > 1 && (
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">{tt("连给哪个组织")}</label>
              <select
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
              >
                {orgs.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">{tt("连接器标识")}</label>
            <input
              value={connectorId}
              onChange={(e) => setConnectorId(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">{tt("MCP 服务地址（你的专属 URL）")}</label>
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">Token / API Key</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">{tt("名称")}</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-[13px] outline-none focus:border-neutral-400"
            />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-neutral-700">
            <input
              type="checkbox"
              checked={memberVisible}
              onChange={(e) => setMemberVisible(e.target.checked)}
            />
            {tt("成员可见")}
          </label>
          {failed && (
            <p className="text-[12px] text-red-600">{tt("连接失败，请检查地址与凭证后重试。")}</p>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={submitting || !connectorId.trim()}
              onClick={() => void submit()}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              {submitting ? tt("连接中…") : tt("连接并验证")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50"
            >
              {tt("取消")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
