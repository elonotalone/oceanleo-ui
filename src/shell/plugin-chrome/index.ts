// 统一插件外壳的对外入口。13 件插件一律从这里取，不要深引子模块。

export {
  PluginChromeFrame,
  usePluginChromePanelHost,
  type PluginChromeFrameProps,
} from "./PluginChromeFrame";
export {
  PluginChromeEditBarButton,
  PluginChromeEditBarDivider,
} from "./PluginChromeEditBarButton";
export { PluginChromeNotices } from "./PluginChromeNotices";
export { PluginChromeStatus } from "./PluginChromeStatus";
export {
  usePluginChromePanels,
  type PluginChromePanelController,
} from "./use-plugin-chrome-panels";
// agent 抽屉的 id 与面板由外壳内建，插件**不要**自己注册同 id 的面板
// （传了也会被 PluginChromeFrame 过滤掉）。导出 id 是给跨仓契约测试断言用的，
// 不是给插件拿去挂第二个 agent 面板的入口。详见 signals/W22-chrome-contract.md。
export { PLUGIN_AGENT_DRAWER_ID } from "./agent-drawer";
export { PluginAgentPanel, type PluginAgentPanelProps } from "./PluginAgentPanel";
export {
  PLUGIN_CHROME_EDITBAR_MIN_H,
  PLUGIN_CHROME_HEADER_H,
  PLUGIN_CHROME_PANEL_DEFAULT_W,
  pluginChromeStyle,
} from "./tokens";
export type {
  PluginChromeAction,
  PluginChromeNotice,
  PluginChromePanel,
  PluginChromeSaveState,
  PluginChromeView,
  PluginChromeWindowActions,
} from "./types";
