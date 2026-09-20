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

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getMcpCatalog, type McpItem } from "../lib/database";
import { currencySymbol } from "../lib/money";
import {
  deleteOrgMcpConnection,
  listInheritedMcp,
  listMyOrgs,
  listOrgMcpConnections,
  patchOrgMcpConnection,
  setOrgMcpForwardIdentity,
  upsertOrgMcpConnection,
  type OrgRole,
  type OrgSummary,
} from "../lib/org-api";
import { PageHeader } from "./PageHeader";
import { useUI } from "../i18n/ui/useUI";

/**
 * 插件目录的 `currency` 历史上既可能是货币码（"CNY" / "USD"）也可能直接是符号（"¥"）。
 * 码走共享符号表；已经是符号的原样用；空的按账本默认（CNY → ¥），不猜美元。
 */
function pluginPriceSymbol(currency: string | undefined): string {
  const raw = (currency || "").trim();
  if (raw && !/^[A-Za-z]{3}$/.test(raw)) return raw;
  return currencySymbol(raw);
}

// --- 组织提供的 MCP 连接 -----------------------------------------------------

/** 一条「组织连给我的」MCP 连接。组织侧的连接凭证只在网关里，这里永远拿不到。 */
export interface OrgMcpConnection {
  orgId: string;
  orgName: string;
  connectorId: string;
  label: string;
  icon: string;
  toolsCount: number;
  enabled: boolean;
  /** 管理员可以把一条连接对成员隐藏；成员视角拿到的永远是 true。 */
  memberVisible: boolean;
  /** 默认关。开了以后这台服务器会收到是哪位成员在操作。 */
  forwardMemberIdentity: boolean;
}

/**
 * 谁能管组织的 MCP 连接。owner / admin 能连能停能断，member 只能看和用。
 * 主站 `oceanleo/app/plugins/page.tsx` 自绘的那份必须与这里同判定。
 */
export function canManageOrgMcp(role: OrgRole | string): boolean {
  return role === "owner" || role === "admin";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value) return value;
  }
  return "";
}

/**
 * 网关的连接列表 → 页面用的行。
 *
 * 形状按 `/v1/mcp/connections`（`connections` 数组 + snake_case）写，同时认 `items`：
 * W08 落地时哪一种都不至于让整块静默变空。认不出来的条目直接丢，不抛错 ——
 * 这一块的产品承诺是「没有就不出现」，不是「坏了就报错」。
 */
export function normalizeOrgMcpConnections(
  payload: unknown,
  fallback: { orgId?: string; orgName?: string } = {},
): OrgMcpConnection[] {
  const root = asRecord(payload);
  const raw = Array.isArray(root.connections)
    ? root.connections
    : Array.isArray(root.items)
      ? root.items
      : Array.isArray(payload)
        ? payload
        : [];
  const rows: OrgMcpConnection[] = [];
  for (const entry of raw) {
    const row = asRecord(entry);
    const connectorId = text(row, "connector_id", "connectorId", "id");
    if (!connectorId) continue;
    rows.push({
      orgId: text(row, "org_id", "orgId") || fallback.orgId || "",
      orgName: text(row, "org_name", "orgName") || fallback.orgName || "",
      connectorId,
      label: text(row, "label", "name") || connectorId,
      icon: text(row, "icon") || "🔌",
      toolsCount: Number(row.tools_count ?? row.toolsCount ?? 0) || 0,
      enabled: row.enabled !== false,
      memberVisible: (row.member_visible ?? row.memberVisible) !== false,
      forwardMemberIdentity: (row.forward_member_identity ?? row.forwardMemberIdentity) === true,
    });
  }
  return rows;
}

/**
 * 这一块出不出现。
 *
 * 任务书写的是「零组织或零组织连接时整块不渲染」，理由是**没有组织的人看到的页面
 * 与今天完全一致**。照字面还会多挡掉一种人：组织刚建好、一条连接都还没有的管理员
 * —— 那样「为组织连接」这个入口永远点不到，整个功能不可达。所以判定分两半：
 * 有连接就渲染；没有连接时只给管得了事的人渲染那个入口。普通用户两条都不满足。
 */
export function shouldRenderOrgSection(input: {
  orgs: OrgSummary[];
  connections: OrgMcpConnection[];
}): boolean {
  if (input.connections.length > 0) return true;
  return input.orgs.some((org) => canManageOrgMcp(org.role));
}

/**
 * 组织侧请求全部走 `../lib/org-api`（A3：全波 `/v1/orgs` 只有一个出口）。
 * org-api 的纪律是失败**抛** `OrgApiError`；这一块的产品承诺是「没有就不出现」，
 * 所以每处调用都在这里吞成 `null` —— 端点没上线、掉登录、断网，对插件页都是同一件事。
 */
async function quiet<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

export interface PluginsPageProps {
  accent?: string;
  title?: ReactNode;
}

export function PluginsPage({ accent = "#4f46e5", title }: PluginsPageProps) {
  const tt = useUI();
  const [items, setItems] = useState<McpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [orgConnections, setOrgConnections] = useState<OrgMcpConnection[]>([]);
  const [connectForOrg, setConnectForOrg] = useState<string | null>(null);
  const [busyConnector, setBusyConnector] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await getMcpCatalog();
      if (!alive) return;
      setLoading(false);
      if (!r.ok || !r.data) {
        setError(r.error || tt("加载失败"));
        return;
      }
      setItems(r.data.items || []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 成员看 `/v1/orgs/mcp/available`（我从各组织继承到的），管理员再按组织补一遍
   * `/v1/orgs/{id}/mcp/connections`（含对成员隐藏的那些）。同一条连接以管理员那份为准。
   */
  const loadOrgConnections = useCallback(async (list: OrgSummary[]) => {
    // 行上的 `org_name` 优先（W25 起 available 会带）；没有再按 org_id 从 listMyOrgs 补。
    const nameOf = new Map(list.map((org) => [org.id, org.name]));
    const withName = (c: OrgMcpConnection): OrgMcpConnection =>
      c.orgName ? c : { ...c, orgName: nameOf.get(c.orgId) || "" };
    const inherited = normalizeOrgMcpConnections(await quiet(() => listInheritedMcp())).map(withName);
    const byKey = new Map(inherited.map((c) => [`${c.orgId}:${c.connectorId}`, c]));
    for (const org of list) {
      if (!canManageOrgMcp(org.role)) continue;
      const owned = normalizeOrgMcpConnections(
        await quiet(() => listOrgMcpConnections(org.id)),
        { orgId: org.id, orgName: org.name },
      );
      for (const c of owned) byKey.set(`${c.orgId}:${c.connectorId}`, withName(c));
    }
    return [...byKey.values()];
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      let list: OrgSummary[] = [];
      try {
        list = await listMyOrgs();
      } catch {
        return; // 组织 API 还没上线：这一块就当不存在
      }
      if (!alive || !Array.isArray(list) || list.length === 0) return;
      const rows = await loadOrgConnections(list);
      if (!alive) return;
      setOrgs(list);
      setOrgConnections(rows);
    })();
    return () => {
      alive = false;
    };
  }, [loadOrgConnections]);

  const refreshOrgConnections = useCallback(async () => {
    setOrgConnections(await loadOrgConnections(orgs));
  }, [loadOrgConnections, orgs]);

  const manageableOrgs = orgs.filter((org) => canManageOrgMcp(org.role));
  const showOrgSection = shouldRenderOrgSection({ orgs, connections: orgConnections });

  /** `patch` 是 org-api 的 camelCase 形状（它自己转成网关的 `member_visible`）。 */
  async function patchConnection(
    row: OrgMcpConnection,
    patch: { enabled?: boolean; memberVisible?: boolean },
  ) {
    setBusyConnector(row.connectorId);
    await quiet(() => patchOrgMcpConnection(row.orgId, row.connectorId, patch));
    await refreshOrgConnections();
    setBusyConnector("");
  }

  async function removeConnection(row: OrgMcpConnection) {
    setBusyConnector(row.connectorId);
    await quiet(() => deleteOrgMcpConnection(row.orgId, row.connectorId));
    await refreshOrgConnections();
    setBusyConnector("");
  }

  async function setForwardIdentity(row: OrgMcpConnection, forward: boolean) {
    setBusyConnector(row.connectorId);
    await quiet(() => setOrgMcpForwardIdentity(row.orgId, row.connectorId, forward));
    await refreshOrgConnections();
    setBusyConnector("");
  }

  const filtered = q.trim()
    ? items.filter((it) =>
        `${it.name || ""}${it.vendor || ""}${it.description || ""}`
          .toLowerCase()
          .includes(q.trim().toLowerCase()),
      )
    : items;

  return (
    <div className="px-8 py-6">
      <PageHeader title={typeof title === "string" ? title : tt("插件与连接器")} />
      <p className="mt-1 text-center text-[13px] text-neutral-500">{tt("技能、连接器与 MCP 服务器，接入后即可在全 OceanLeo 系列中调用。")}</p>

      <div className="mx-auto mt-6 max-w-3xl">
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

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tt("搜索连接器 / MCP 服务器…")}
          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-[14px] outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus:border-neutral-400"
        />

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
    const res = await quiet(() =>
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
