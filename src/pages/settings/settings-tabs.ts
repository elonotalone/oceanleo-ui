// 设置中心的栏目 id。人看到的地址是 `/settings/<tab>`。
// 旧书签 `/settings?tab=`、`#settings/<tab>` 读进来后写成这条路径。

/** 内置栏目，按导航里的出现顺序。 */
export const SETTINGS_BUILTIN_TABS = [
  "general",
  "account",
  "personalization",
  "billing",
  "cost",
  "api",
  "plugins",
  "devices",
  "team",
] as const;

export type SettingsBuiltinTab = (typeof SETTINGS_BUILTIN_TABS)[number];

/** 退役的 id → 现在承接它的内置栏目。旧书签与旧调用方（`openSettingsModal("memory")`）靠它落地。 */
export const SETTINGS_TAB_ALIASES: Readonly<Record<string, SettingsBuiltinTab>> = {
  org: "team",
  memory: "personalization",
  models: "api",
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

export function isSettingsPathname(pathname: string): boolean {
  if (pathname === "/settings" || pathname === "/settings/") return true;
  const match = pathname.match(/^\/settings\/([^/]+)\/?$/);
  // 操作员要求只留 /settings/api：这一栏就是 AI 模型，不再踢去整页 /api。
  return Boolean(match?.[1]);
}

export function settingsPath(tab: string, href?: string): string {
  const id = encodeURIComponent(canonicalSettingsTab(tab) || "general");
  let extra = "";
  try {
    const url = new URL(
      href || (typeof window !== "undefined" ? window.location.href : "https://oceanleo.com/"),
      "https://oceanleo.com",
    );
    url.searchParams.delete("tab");
    const search = url.searchParams.toString();
    extra = search ? `?${search}` : "";
  } catch {
    extra = "";
  }
  return `/settings/${id}${extra}`;
}

export function tabFromSettingsLocation(
  href: string,
  known: Iterable<string> = [],
  fallback = "general",
): string {
  try {
    const url = new URL(href, "https://oceanleo.com");
    const pathMatch = url.pathname.match(/^\/settings(?:\/([^/]+))?\/?$/);
    if (pathMatch) {
      const segment = pathMatch[1];
      if (segment) return resolveSettingsTab(decodeURIComponent(segment), known, fallback);
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
  const resolved = canonicalSettingsTab(tab) || "general";
  const next = settingsPath(resolved);
  if (isSettingsPathname(window.location.pathname)) {
    if (herePath() !== next) {
      window.history.replaceState({ ...(window.history.state as object), settingsOverlay: true }, "", next);
    }
  } else {
    window.history.pushState({ ...(window.history.state as object), settingsOverlay: true }, "", next);
  }
  window.dispatchEvent(new Event("popstate"));
}

/** 设置栏地址走 overlay；其它地址整页走。 */
export function navigateSettingsOrHref(href: string) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(href, window.location.href);
    if (isSettingsPathname(url.pathname) || SETTINGS_HASH.test(url.hash)) {
      openSettingsModal(tabFromSettingsLocation(url.href));
      return;
    }
  } catch {
    /* fall through */
  }
  window.location.href = href;
}
