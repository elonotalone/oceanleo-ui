// 详情页访客从哪里进来：货架点开时记下入口，计数时再收成给网关的短标签。
// 只放在模块变量里，不用任何浏览器存储——页内窗口没有同源存储，也不该把这次点击写进可追踪的仓。

import { familyForHost } from "../../../contracts/domain-family";

export type BayAppEntry = "shelf" | "search" | "fresh" | "follow";

export type RememberedBayAppEntry = {
  appId: string;
  entry: BayAppEntry;
  at: number;
};

export type ResolveSourceInput = {
  search: string;
  remembered: RememberedBayAppEntry | null;
  now: number;
  siteKey: string;
  referrer: string;
  host: string;
};

export const BAY_APP_ENTRY_TTL_MS = 30_000;
const SITE_KEY = /^[a-z0-9][a-z0-9-]{1,23}$/;

let remembered: RememberedBayAppEntry | null = null;

/** 货架 / 搜索结果 / 新上架位 / 关注列表里点开一个网站或软件之前调用：记下这次是从哪里点进来的。 */
export function rememberBayAppEntry(appId: string, entry: BayAppEntry): void {
  const id = typeof appId === "string" ? appId.trim() : "";
  if (!id) return;
  remembered = { appId: id, entry, at: Date.now() };
}

export function matchingRemembered(
  appId: string,
  record: RememberedBayAppEntry | null,
  now: number = Date.now(),
): RememberedBayAppEntry | null {
  if (!record || record.appId !== appId) return null;
  if (now - record.at > BAY_APP_ENTRY_TTL_MS) return null;
  return record;
}

function querySrc(search: string): string {
  try {
    const text = typeof search === "string" ? search : "";
    const params = new URLSearchParams(text.startsWith("?") || text === "" ? text : `?${text}`);
    return (params.get("src") || "").trim();
  } catch {
    return "";
  }
}

// 第一方域的判定只走家族表（UC-7：包里不许出现第二处对域名后缀的判断）。
function firstPartyHost(hostname: string): boolean {
  return familyForHost(hostname) !== undefined;
}

function referrerBranch(referrer: string, host: string): string | null {
  const text = typeof referrer === "string" ? referrer.trim() : "";
  if (!text) return null;
  try {
    const refHost = new URL(text).hostname.toLowerCase();
    const here = (host || "").trim().toLowerCase();
    if (!refHost || refHost === here) return null;
    if (firstPartyHost(refHost)) return "direct";
    const stripped = refHost.startsWith("www.") ? refHost.slice(4) : refHost;
    return `ext:${stripped}`;
  } catch {
    return null;
  }
}

/** 不读 window：调用方把当前页的查询串、主机名和刚记下的入口传进来。 */
export function resolveSource(input: ResolveSourceInput): string {
  const src = querySrc(input.search);
  if (src === "share" || src === "follow") return src;
  const hit = matchingRemembered(input.remembered?.appId ?? "", input.remembered, input.now);
  if (hit) {
    if (hit.entry === "search" || hit.entry === "fresh" || hit.entry === "follow") return hit.entry;
    if (hit.entry === "shelf") return SITE_KEY.test(input.siteKey) ? `site:${input.siteKey}` : "shelf";
  }
  return referrerBranch(input.referrer, input.host) ?? "direct";
}

/** 详情页记浏览 / 打开时调用：这位访客是从哪里来到这个详情页的（给网关的短标签）。 */
export function currentBayAppSource(appId: string, siteKey: string): string {
  if (typeof window === "undefined") return "direct";
  const now = Date.now();
  return resolveSource({
    search: window.location.search,
    remembered: matchingRemembered(appId, remembered, now),
    now,
    siteKey,
    referrer: typeof document === "undefined" ? "" : document.referrer,
    host: window.location.hostname,
  });
}
