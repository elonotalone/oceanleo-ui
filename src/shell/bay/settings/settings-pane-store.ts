// 设置 → LeoBay 现在只有一页（付款卡 + 收款账户），不再分页签。
// 旧的 pane 名（profile / vetting / money）仍然是合法参数：老调用 `openBaySettings("money")`、
// 老深链 `?bay=settings:<pane>` 都落到这一页，所以类型与判断函数保留（I-7）。
// 模块加载时不碰 window。
export type BaySettingsPaneName = "profile" | "vetting" | "money";

export function isBaySettingsPane(value: unknown): value is BaySettingsPaneName {
  return value === "profile" || value === "vetting" || value === "money";
}
