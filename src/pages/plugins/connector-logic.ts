// 「插件与连接器」页连接器卡片的判定。点下去会发生什么（一键授权还是贴凭证、按钮
// 何时可点、等多久算超时、探活失败算不算失效）全在这里，页面只负责画。

import type { McpConnection } from "../../lib/mcp-api";

/** 等对方授权的上限：超过就退出等待态，让用户重试。 */
export const OAUTH_WAIT_MS = 180_000;

/**
 * 等待授权期间多久问一次连接列表。子站收不到网关回调页的回执，只能靠这一问；
 * 主站两条路同时走，谁先到算谁的。
 */
export const OAUTH_POLL_MS = 2_000;

function connectorSearchHaystack(c: { name: string; desc: string; category: string }): string {
  return `${c.name}\n${c.desc}\n${c.category}`.toLowerCase();
}

export function filterRegistryItems<T extends {
  name: string;
  desc: string;
  category: string;
  supports_oauth?: boolean;
}>(items: T[], term: string, oauthOnly = false): T[] {
  const q = term.trim().toLowerCase();
  return items.filter((c) => {
    if (oauthOnly && !c.supports_oauth) return false;
    if (!q) return true;
    return connectorSearchHaystack(c).includes(q);
  });
}

export function groupRegistryByCategory<T extends { category: string }>(
  items: T[],
): { category: string; items: T[] }[] {
  const groups: { category: string; items: T[] }[] = [];
  for (const c of items) {
    let group = groups.find((g) => g.category === c.category);
    if (!group) {
      group = { category: c.category, items: [] };
      groups.push(group);
    }
    group.items.push(c);
  }
  return groups;
}

export function showOneClickButton(supportsOauth: boolean | undefined): boolean {
  return Boolean(supportsOauth);
}

/**
 * 自定义 MCP（`id === "custom"`，凭证 auth）没有登录页，一键授权不能当主按钮。
 * 其它连接器仍按 `supports_oauth` 决定主路径。
 */
export function credentialsArePrimaryPath(connector: {
  id: string;
  supports_oauth?: boolean;
}): boolean {
  return connector.id === "custom" || !showOneClickButton(connector.supports_oauth);
}

const WORKSPACE_MCP_HOST = "workspace-mcp.oceandino.com";

/** 连 OceanLeo 工作区 MCP 时，默认把成员身份转给这台服务器。 */
export function workspaceMcpForwardsIdentityByDefault(endpoint: string): boolean {
  try {
    return new URL(endpoint.trim()).hostname.toLowerCase() === WORKSPACE_MCP_HOST;
  } catch {
    return false;
  }
}

export function oneClickDisabled(
  needsEndpoint: boolean,
  endpoint: string,
  authorizing: boolean,
): boolean {
  return authorizing || (needsEndpoint && !String(endpoint || "").trim());
}

export function primaryOauthLabel(input: {
  authorizing: boolean;
  connected: boolean;
  stale: boolean;
}): string {
  if (input.authorizing) return "正在等待对方授权…";
  if (input.stale || input.connected) return "重新授权";
  return "一键授权";
}

export function helpUrlIsPrimaryPath(supportsOauth: boolean): boolean {
  return !supportsOauth;
}

/**
 * 等待授权的结局。`popupClosed` 要在「关窗之后那一问」回来以后才给 true：网关先写库、
 * 回调页再显示 800ms 才自己关窗，所以关窗后的第一问一定看得到成功的那条连接，
 * 看不到才是真的没授权就关了。
 */
export function oauthWaitOutcome(input: {
  startedAt: number;
  now: number;
  timeoutMs: number;
  popupClosed: boolean;
}): "waiting" | "closed" | "timeout" {
  if (input.popupClosed) return "closed";
  if (input.now - input.startedAt >= input.timeoutMs) return "timeout";
  return "waiting";
}

export function isConnectionStale(probe: { ok?: boolean; needs_reauth?: boolean } | null | undefined): boolean {
  return Boolean(probe?.ok === false && probe.needs_reauth === true);
}

/**
 * 授权完成了没有，只看连接列表：这个连接器的连接出现了，或者换了一条。
 * 重新授权时网关按 (用户, 连接器) upsert，行 id 不变但令牌指纹会变。
 */
export function oauthConnectionLanded(
  before: Pick<McpConnection, "id" | "fingerprint"> | undefined,
  after: Pick<McpConnection, "id" | "fingerprint"> | undefined,
): boolean {
  if (!after) return false;
  if (!before) return true;
  return after.id !== before.id || after.fingerprint !== before.fingerprint;
}

/** `/plugins#connect=github` → `github`；设置窗的 `#settings/plugins` 不是这条。 */
export function connectorIdFromLocationHash(hash: string): string {
  const raw = (hash || "").replace(/^#/, "");
  if (!raw.startsWith("connect=")) return "";
  try {
    return decodeURIComponent(raw.slice("connect=".length)).trim();
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// 设置页「连接器」（skills-overhaul W10）：页面只列我已连接/已添加的；目录在弹窗里。
// ---------------------------------------------------------------------------

/** 目录弹窗的「全部」页签 id。 */
export const CATALOG_ALL = "all";
/** 国内版目录里的「阿里云市场」页签 id（不与注册表分类名相撞）。 */
export const CATALOG_MARKETPLACE = "aliyun-marketplace";
/** 自定义 MCP 服务器在注册表里的 id。 */
export const CUSTOM_CONNECTOR_ID = "custom";

export type MyConnectorStatus = "connected" | "disabled" | "stale";

/** 卡片状态：探活失败过 → 已失效；否则看开关。 */
export function myConnectorStatus(
  connection: { enabled: boolean },
  stale: boolean,
): MyConnectorStatus {
  if (stale) return "stale";
  return connection.enabled ? "connected" : "disabled";
}

/**
 * 「我的连接器」列表：只含已有连接的条目，按注册表顺序排（注册表里没有的排最后，按名称），
 * 搜索看连接名、注册表名称、描述、分类。
 */
export function myConnectorRows<
  C extends { connector_id: string; label: string },
  M extends { id: string; name: string; desc: string; category: string },
>(connections: C[], registry: M[], term: string): { connection: C; meta: M | null }[] {
  const order = new Map(registry.map((m, i) => [m.id, i]));
  const byId = new Map(registry.map((m) => [m.id, m]));
  const q = term.trim().toLowerCase();
  return connections
    .map((connection) => ({ connection, meta: byId.get(connection.connector_id) ?? null }))
    .filter(({ connection, meta }) => {
      if (!q) return true;
      const hay = [connection.label, connection.connector_id, meta?.name, meta?.desc, meta?.category]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => {
      const ia = order.get(a.connection.connector_id) ?? Number.MAX_SAFE_INTEGER;
      const ib = order.get(b.connection.connector_id) ?? Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
      return (a.connection.label || "").localeCompare(b.connection.label || "");
    });
}

/** 目录弹窗的页签：全部 + 注册表分类（出现顺序）+ 国内版的「阿里云市场」。 */
export function catalogTabs(
  registry: { category: string }[],
  withMarketplace: boolean,
): string[] {
  const tabs = [CATALOG_ALL];
  for (const c of registry) if (c.category && !tabs.includes(c.category)) tabs.push(c.category);
  if (withMarketplace) tabs.push(CATALOG_MARKETPLACE);
  return tabs;
}

/** 目录弹窗里某个页签 + 搜索词下的注册表连接器（阿里云市场页签不含注册表项）。 */
export function catalogRegistryItems<T extends { name: string; desc: string; category: string }>(
  registry: T[],
  tab: string,
  term: string,
): T[] {
  if (tab === CATALOG_MARKETPLACE) return [];
  const inTab = tab === CATALOG_ALL ? registry : registry.filter((c) => c.category === tab);
  return filterRegistryItems(inTab, term);
}

/** 阿里云市场条目：在「全部」与「阿里云市场」页签里出现，按名称/厂商/描述搜索。 */
export function catalogMarketplaceItems<
  T extends { name?: string; vendor?: string; description?: string; code?: string },
>(items: T[], tab: string, term: string, withMarketplace: boolean): T[] {
  if (!withMarketplace) return [];
  if (tab !== CATALOG_ALL && tab !== CATALOG_MARKETPLACE) return [];
  const q = term.trim().toLowerCase();
  if (!q) return items;
  return items.filter((it) =>
    `${it.name || ""}\n${it.vendor || ""}\n${it.description || ""}\n${it.code || ""}`
      .toLowerCase()
      .includes(q),
  );
}

/** 阿里云市场外链只放行 http(s)；其它协议（脚本伪协议等）一律不渲染成链接。 */
export function safeExternalHref(raw: string | undefined | null): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}
