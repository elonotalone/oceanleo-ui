// 设置中心的栏目 id：设置窗（`#settings/<tab>`）与设置页（`?tab=<tab>`）共用这一份。

/** 内置栏目，按导航里的出现顺序。 */
export const SETTINGS_BUILTIN_TABS = [
  "general",
  "account",
  "personalization",
  "billing",
  "models",
  "plugins",
  "devices",
  "org",
] as const;

export type SettingsBuiltinTab = (typeof SETTINGS_BUILTIN_TABS)[number];

/** 退役的 id → 现在承接它的内置栏目。旧书签与旧调用方（`openSettingsModal("memory")`）靠它落地。 */
export const SETTINGS_TAB_ALIASES: Readonly<Record<string, SettingsBuiltinTab>> = {
  memory: "personalization",
};

const BUILTIN = new Set<string>(SETTINGS_BUILTIN_TABS);
const ALIASES = new Map<string, string>(Object.entries(SETTINGS_TAB_ALIASES));

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
