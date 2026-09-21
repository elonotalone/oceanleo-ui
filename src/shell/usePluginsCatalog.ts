"use client";

// PluginsPage 与输入框连接器浮层共用的目录 / 组织连接取数。
// 请求只走 lib/database.getMcpCatalog 与 lib/org-api，这里不自建 fetch。

import { useCallback, useEffect, useState } from "react";
import { getMcpCatalog, type McpItem } from "../lib/database";
import {
  deleteOrgMcpConnection,
  listInheritedMcp,
  listMyOrgs,
  listOrgMcpConnections,
  patchOrgMcpConnection,
  setOrgMcpForwardIdentity,
  type OrgRole,
  type OrgSummary,
} from "../lib/org-api";
import { useUI } from "../i18n/ui/useUI";

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

export type PopoverConnectorKind = "connect" | "toggle" | "connected";

export interface PopoverConnector {
  id: string;
  name: string;
  icon: string;
  iconIsUrl: boolean;
  letter: string;
  beta: boolean;
  kind: PopoverConnectorKind;
  enabled: boolean;
  connectHref: string;
  manageHref: string;
  orgId: string;
  connectorId: string;
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
      forwardMemberIdentity:
        (row.forward_member_identity ?? row.forwardMemberIdentity) === true,
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
export async function quietOrg<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch {
    return null;
  }
}

function letterOf(name: string): string {
  const ch = [...name.trim()][0];
  return (ch || "?").toUpperCase();
}

function iconIsUrl(icon: string): boolean {
  return /^(https?:\/\/|\/|data:)/i.test(icon);
}

function looksBeta(...parts: Array<string | undefined>): boolean {
  return parts.some((part) => /\bbeta\b/i.test(part || ""));
}

export function buildPopoverConnectors(input: {
  items: McpItem[];
  connections: OrgMcpConnection[];
  orgs: OrgSummary[];
}): PopoverConnector[] {
  const manageByOrg = new Map(input.orgs.map((org) => [org.id, canManageOrgMcp(org.role)]));
  const byConnector = new Map<string, OrgMcpConnection>();
  for (const row of input.connections) {
    const key = row.connectorId.toLowerCase();
    if (!byConnector.has(key)) byConnector.set(key, row);
  }
  const used = new Set<string>();
  const rows: PopoverConnector[] = [];

  const pushFromConnection = (
    row: OrgMcpConnection,
    fallbackName: string,
    extra?: { beta?: boolean; connectHref?: string },
  ) => {
    const toggleable = manageByOrg.get(row.orgId) === true;
    rows.push({
      id: row.connectorId,
      name: row.label || fallbackName || row.connectorId,
      icon: row.icon,
      iconIsUrl: iconIsUrl(row.icon),
      letter: letterOf(row.label || fallbackName || row.connectorId),
      beta: extra?.beta === true,
      kind: toggleable ? "toggle" : "connected",
      enabled: row.enabled,
      connectHref: extra?.connectHref || "/plugins",
      manageHref: "/plugins",
      orgId: row.orgId,
      connectorId: row.connectorId,
    });
  };

  for (const item of input.items) {
    const connectorId = (item.code || item.name || "").trim();
    if (!connectorId) continue;
    const connected = byConnector.get(connectorId.toLowerCase());
    const name = item.name || connectorId;
    const href = item.detail_url || "/plugins";
    const beta = looksBeta(item.name, item.description, item.code, item.vendor);
    if (connected) {
      used.add(connected.connectorId.toLowerCase());
      pushFromConnection(connected, name, { beta, connectHref: href });
      continue;
    }
    rows.push({
      id: connectorId,
      name,
      icon: "",
      iconIsUrl: false,
      letter: letterOf(name),
      beta,
      kind: "connect",
      enabled: false,
      connectHref: href,
      manageHref: "/plugins",
      orgId: "",
      connectorId,
    });
  }

  for (const row of input.connections) {
    if (used.has(row.connectorId.toLowerCase())) continue;
    pushFromConnection(row, row.label);
  }

  return rows;
}

export interface PluginsCatalogState {
  items: McpItem[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  orgs: OrgSummary[];
  orgConnections: OrgMcpConnection[];
  refreshOrgConnections: () => Promise<void>;
  busyConnector: string;
  patchConnection: (
    row: OrgMcpConnection,
    patch: { enabled?: boolean; memberVisible?: boolean },
  ) => Promise<void>;
  removeConnection: (row: OrgMcpConnection) => Promise<void>;
  setForwardIdentity: (row: OrgMcpConnection, forward: boolean) => Promise<void>;
}

export function usePluginsCatalog(): PluginsCatalogState {
  const tt = useUI();
  const [items, setItems] = useState<McpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [orgConnections, setOrgConnections] = useState<OrgMcpConnection[]>([]);
  const [busyConnector, setBusyConnector] = useState("");

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    void getMcpCatalog().then((r) => {
      setLoading(false);
      if (!r.ok || !r.data) {
        setError(r.error || tt("加载失败"));
        return;
      }
      setItems(r.data.items || []);
    });
  }, [tt]);

  useEffect(() => {
    let alive = true;
    void (async () => {
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
    const nameOf = new Map(list.map((org) => [org.id, org.name]));
    const withName = (c: OrgMcpConnection): OrgMcpConnection =>
      c.orgName ? c : { ...c, orgName: nameOf.get(c.orgId) || "" };
    const inherited = normalizeOrgMcpConnections(
      await quietOrg(() => listInheritedMcp()),
    ).map(withName);
    const byKey = new Map(inherited.map((c) => [`${c.orgId}:${c.connectorId}`, c]));
    for (const org of list) {
      if (!canManageOrgMcp(org.role)) continue;
      const owned = normalizeOrgMcpConnections(
        await quietOrg(() => listOrgMcpConnections(org.id)),
        { orgId: org.id, orgName: org.name },
      );
      for (const c of owned) byKey.set(`${c.orgId}:${c.connectorId}`, withName(c));
    }
    return [...byKey.values()];
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      let list: OrgSummary[] = [];
      try {
        list = await listMyOrgs();
      } catch {
        return;
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

  async function patchConnection(
    row: OrgMcpConnection,
    patch: { enabled?: boolean; memberVisible?: boolean },
  ) {
    setBusyConnector(row.connectorId);
    await quietOrg(() => patchOrgMcpConnection(row.orgId, row.connectorId, patch));
    await refreshOrgConnections();
    setBusyConnector("");
  }

  async function removeConnection(row: OrgMcpConnection) {
    setBusyConnector(row.connectorId);
    await quietOrg(() => deleteOrgMcpConnection(row.orgId, row.connectorId));
    await refreshOrgConnections();
    setBusyConnector("");
  }

  async function setForwardIdentity(row: OrgMcpConnection, forward: boolean) {
    setBusyConnector(row.connectorId);
    await quietOrg(() =>
      setOrgMcpForwardIdentity(row.orgId, row.connectorId, forward),
    );
    await refreshOrgConnections();
    setBusyConnector("");
  }

  return {
    items,
    loading,
    error,
    reload,
    orgs,
    orgConnections,
    refreshOrgConnections,
    busyConnector,
    patchConnection,
    removeConnection,
    setForwardIdentity,
  };
}
