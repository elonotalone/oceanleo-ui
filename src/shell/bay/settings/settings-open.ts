// 打开各站共用设置窗的「LeoBay」栏。这一栏只有一页（付款卡 + 收款账户），
// 所以 pane 只是为了不改老调用方的签名（I-7）：传什么、不传，都落到这一页。
import { openSettingsModal } from "../../../pages/settings/settings-tabs";
import type { BaySettingsPaneName } from "./settings-pane-store";

export type { BaySettingsPaneName as BaySettingsPane };

export function openBaySettings(_pane?: BaySettingsPaneName): void {
  openSettingsModal("bay");
}
