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
}>(items: T[], term: string, oauthOnly: boolean): T[] {
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

export function isConnectionStale(probe: { ok?: boolean } | null | undefined): boolean {
  return Boolean(probe && probe.ok === false);
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
