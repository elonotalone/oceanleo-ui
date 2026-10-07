// 打开各站共用设置窗的「OceanLeo Bay」栏，并记下要看的那一块（钱 / 卖家资料 / 资质审核）。
import { openSettingsModal } from "../../../pages/settings/settings-tabs";
import { requestBaySettingsPane, type BaySettingsPaneName } from "./settings-pane-store";

export type { BaySettingsPaneName as BaySettingsPane };

export function openBaySettings(pane?: BaySettingsPaneName): void {
  requestBaySettingsPane(pane);
  openSettingsModal("bay");
}
