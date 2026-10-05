// 设置中心的栏目 id。人看到的地址是 `/settings/<tab>`。
// 旧书签 `/settings?tab=`、`#settings/<tab>` 读进来后写成这条路径。

/** 内置栏目，按导航里的出现顺序。 */
export const SETTINGS_BUILTIN_TABS = [
  "general",
  "account",
  "personalization",
  "billing",
  "ai-models",
  "plugins",
  "mail",
  "devices",
  "team",
] as const;

export type SettingsBuiltinTab = (typeof SETTINGS_BUILTIN_TABS)[number];

/** 退役的 id → 现在承接它的内置栏目。旧书签与旧调用方（`openSettingsModal("memory")`）靠它落地。 */
export const SETTINGS_TAB_ALIASES: Readonly<Record<string, SettingsBuiltinTab>> = {
  org: "team",
  memory: "personalization",
  knowledge: "personalization",
  models: "ai-models",
  api: "ai-models",
  cost: "billing",
  "usage-details": "billing",
  topup: "billing",
  "top-up": "billing",
};

const BUILTIN = new Set<string>(SETTINGS_BUILTIN_TABS);
const ALIASES = new Map<string, string>(Object.entries(SETTINGS_TAB_ALIASES));
const SETTINGS_HASH = /^#settings(?:\/([^/]*))?$/;

export function canonicalSettingsTab(tab: string): string {
  return ALIASES.get(tab) ?? tab;
}

/** 内置栏目与别名占用的 id：站点经 `extraSections` 传进来的同 id 项让位给内置。 */
export function isReservedSettingsTab(id: string): boolean {
  return BUILTIN.has(id) || ALIASES.has(id);
}

/**
 * 请求的 tab → 真正会打开的那一栏：别名换成现名；既不是内置栏目、也不在 `known`
 * （站点自己的面板 id）里时回落 `fallback`。
 */
export function resolveSettingsTab(
  tab: string | null | undefined,
  known: Iterable<string> = [],
  fallback = "general",
): string {
  const requested = canonicalSettingsTab((tab ?? "").trim());
  if (!requested) return fallback;
  if (BUILTIN.has(requested)) return requested;
  for (const id of known) if (id === requested) return requested;
  return fallback;
}

/** 账户栏子页。左栏仍高亮「账户」，不占导航项。 */
export const ACCOUNT_SETTINGS_VIEWS = [
  "home",
  "sign-in-methods",
  "login-devices",
  "security",
] as const;

export type AccountSettingsView = (typeof ACCOUNT_SETTINGS_VIEWS)[number];

/** 用量与账单页内页签。左栏与地址都停在「用量与账单」。 */
export type BillingPaneView = "overview" | "usage-details" | "topup";

type SettingsHistoryState = {
  settingsOverlay?: boolean;
  settingsBillingView?: BillingPaneView;
};

/** 旧栏目 id / 调用方 tab → 页内页签。`billing` 与未知值都是总览。 */
export function billingViewFromRaw(tab: string | null | undefined): BillingPaneView {
  const raw = (tab ?? "").trim();
  if (raw === "usage-details" || raw === "cost") return "usage-details";
  if (raw === "topup" || raw === "top-up") return "topup";
  return "overview";
}

/** @deprecated 与 billingViewFromRaw 相同；旧调用方还在用。 */
export function billingViewFromTab(tab: string | null | undefined): BillingPaneView {
  return billingViewFromRaw(tab);
}

export function billingViewFromLocation(href: string): BillingPaneView {
  try {
    const url = new URL(href, "https://oceanleo.com");
    if (isSettingsPathname(url.pathname)) {
      const segment = settingsPathnameSegments(url.pathname)[0];
      if (segment) return billingViewFromRaw(segment);
      const queryTab = url.searchParams.get("tab");
      if (queryTab) return billingViewFromRaw(queryTab);
      return "overview";
    }
    const hashMatch = url.hash.match(SETTINGS_HASH);
    if (hashMatch) return billingViewFromRaw(decodeURIComponent(hashMatch[1] || ""));
    const queryTab = url.searchParams.get("tab");
    if (queryTab) return billingViewFromRaw(queryTab);
  } catch {
    /* ignore */
  }
  return "overview";
}

/** 路径上的旧费用/充值地址优先；否则读本次会话记在 history.state 里的页签。 */
export function readSettingsBillingView(href?: string): BillingPaneView {
  const source = href || (typeof window !== "undefined" ? window.location.href : "");
  if (source) {
    const fromPath = billingViewFromLocation(source);
    if (fromPath !== "overview") return fromPath;
  }
  if (typeof window === "undefined") return "overview";
  const stored = (window.history.state as SettingsHistoryState | null)?.settingsBillingView;
  if (stored === "usage-details" || stored === "topup") return stored;
  return "overview";
}

/** 把页签记在本页 history.state，地址收成 `/settings/billing`。刷新后回到总览。 */
export function rememberSettingsBillingView(view: BillingPaneView, href?: string) {
  if (typeof window === "undefined") return;
  const prev = (window.history.state as SettingsHistoryState | null) || {};
  window.history.replaceState(
    {
      ...prev,
      settingsBillingView: view === "overview" ? undefined : view,
    },
    "",
    settingsPath("billing", href || window.location.href),
  );
}

const ACCOUNT_NESTED_VIEWS = new Set<string>(["sign-in-methods", "login-devices", "security"]);

function settingsSearch(href: string): string {
  try {
    const url = new URL(href, "https://oceanleo.com");
    url.searchParams.delete("tab");
    const search = url.searchParams.toString();
    return search ? `?${search}` : "";
  } catch {
    return "";
  }
}

function encodeSettingsSegments(tab: string): string {
  return tab
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function settingsPathnameSegments(pathname: string): string[] {
  const match = pathname.match(/^\/settings(?:\/(.*))?$/);
  if (!match) return [];
  const rest = (match[1] || "").replace(/\/+$/, "");
  if (!rest) return [];
  return rest.split("/").filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
}

export function isSettingsPathname(pathname: string): boolean {
  if (pathname === "/settings" || pathname === "/settings/") return true;
  // 一栏 `/settings/<tab>`，账户子页 `/settings/account/<view>`。
  return /^\/settings\/[^/]+(?:\/[^/]+)?\/?$/.test(pathname);
}

export function settingsPath(tab: string, href?: string): string {
  const source =
    href || (typeof window !== "undefined" ? window.location.href : "https://oceanleo.com/");
  const canonical = canonicalSettingsTab(tab) || "general";
  const extra = settingsSearch(source);
  const segments = encodeSettingsSegments(canonical);
  if (segments.startsWith("account/") || segments !== "account") {
    return `/settings/${segments}${extra}`;
  }
  // SettingsModalHost 用 tabFromSettingsLocation（nav tab=account）再 settingsPath
  // 规范化地址：当前已在账户子页时不能把 /login-devices 裁掉。
  const currentView = accountSettingsView(source);
  if (currentView !== "home") {
    return `/settings/account/${encodeURIComponent(currentView)}${extra}`;
  }
  return `/settings/account${extra}`;
}

export function accountSettingsPath(view: AccountSettingsView, href?: string): string {
  const source =
    href || (typeof window !== "undefined" ? window.location.href : "https://oceanleo.com/");
  const extra = settingsSearch(source);
  if (view === "home") return `/settings/account${extra}`;
  return `/settings/account/${encodeURIComponent(view)}${extra}`;
}

export function accountSettingsView(href: string): AccountSettingsView {
  try {
    const url = new URL(href, "https://oceanleo.com");
    const segments = settingsPathnameSegments(url.pathname);
    if (segments.length === 0) return "home";
    const tab = canonicalSettingsTab(segments[0] || "");
    if (tab !== "account") return "home";
    const nested = segments[1] || "";
    if (ACCOUNT_NESTED_VIEWS.has(nested)) return nested as AccountSettingsView;
    return "home";
  } catch {
    return "home";
  }
}

export function tabFromSettingsLocation(
  href: string,
  known: Iterable<string> = [],
  fallback = "general",
): string {
  try {
    const url = new URL(href, "https://oceanleo.com");
    if (isSettingsPathname(url.pathname)) {
      const segment = settingsPathnameSegments(url.pathname)[0];
      if (segment) return resolveSettingsTab(segment, known, fallback);
      const queryTab = url.searchParams.get("tab");
      if (queryTab) return resolveSettingsTab(queryTab, known, fallback);
      return fallback;
    }
    const hashMatch = url.hash.match(SETTINGS_HASH);
    if (hashMatch) {
      return resolveSettingsTab(decodeURIComponent(hashMatch[1] || fallback), known, fallback);
    }
    const queryTab = url.searchParams.get("tab");
    if (queryTab) return resolveSettingsTab(queryTab, known, fallback);
  } catch {
    /* ignore */
  }
  return fallback;
}

export function isSettingsLocation(href: string): boolean {
  try {
    const url = new URL(href, "https://oceanleo.com");
    if (isSettingsPathname(url.pathname)) return true;
    return SETTINGS_HASH.test(url.hash);
  } catch {
    return false;
  }
}

function herePath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

/** 打开设置卡片并把地址写成 `/settings/<tab>`。不从 Host 文件导出，避免把整窗拖进输入框模块图。 */
export function openSettingsModal(tab = "general") {
  if (typeof window === "undefined") return;
  const billingView = billingViewFromRaw(tab);
  const resolved = canonicalSettingsTab(tab) || "general";
  const next = settingsPath(resolved);
  const prev = (window.history.state as SettingsHistoryState | null) || {};
  const state: SettingsHistoryState = {
    ...prev,
    settingsOverlay: true,
    settingsBillingView:
      resolved === "billing" && billingView !== "overview" ? billingView : undefined,
  };
  if (isSettingsPathname(window.location.pathname)) {
    if (herePath() !== next || prev.settingsBillingView !== state.settingsBillingView) {
      window.history.replaceState(state, "", next);
    }
  } else {
    window.history.pushState(state, "", next);
  }
  window.dispatchEvent(new Event("popstate"));
}

/** 设置栏地址走 overlay；其它地址整页走。 */
export function navigateSettingsOrHref(href: string) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(href, window.location.href);
    if (isSettingsPathname(url.pathname) || SETTINGS_HASH.test(url.hash)) {
      const tab = tabFromSettingsLocation(url.href);
      const view = accountSettingsView(url.href);
      const billingView = billingViewFromLocation(url.href);
      if (tab === "account" && view !== "home") {
        openSettingsModal(`account/${view}`);
      } else if (tab === "billing" && billingView !== "overview") {
        openSettingsModal(billingView === "topup" ? "topup" : "usage-details");
      } else {
        openSettingsModal(tab);
      }
      return;
    }
  } catch {
    /* fall through */
  }
  window.location.href = href;
}
