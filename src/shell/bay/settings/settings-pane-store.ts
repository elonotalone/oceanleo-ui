// 「在设置中打开」、深链 `?bay=settings:<pane>` 把要看的那一块记在这里；
// 设置窗里的 BaySettingsSection 挂载时（或已经挂着时）取走。模块加载时不碰 window。
export type BaySettingsPaneName = "profile" | "vetting" | "money";

/** 设置窗里的四块：前三块可被深链指定，「规则与条款」只能点进去。 */
export type BaySettingsBlock = BaySettingsPaneName | "terms";

export const BAY_SETTINGS_BLOCKS: readonly BaySettingsBlock[] = ["profile", "vetting", "money", "terms"];

/** 请求超过这个时间还没人取（设置窗没打开），就当作废：以后手动打开时不该跳到老的那一块。 */
const REQUEST_TTL_MS = 15_000;

let requested: { pane: BaySettingsPaneName; at: number } | null = null;
const listeners = new Set<() => void>();

export function isBaySettingsPane(value: unknown): value is BaySettingsPaneName {
  return value === "profile" || value === "vetting" || value === "money";
}

export function requestBaySettingsPane(pane: BaySettingsPaneName | undefined): void {
  if (!isBaySettingsPane(pane)) return;
  requested = { pane, at: Date.now() };
  for (const listener of Array.from(listeners)) listener();
}

/** 取走（并清掉）最近一次请求；过期的当作没有。 */
export function takeBaySettingsPane(): BaySettingsPaneName | null {
  const request = requested;
  requested = null;
  return request && Date.now() - request.at <= REQUEST_TTL_MS ? request.pane : null;
}

export function subscribeBaySettingsPane(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
