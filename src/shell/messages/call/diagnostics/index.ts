// W14 · 网络检测与通话检测（合同 §3.9；A-7 追加无 props 的 CallDiagnosticsHost，由 W07 在 CallHost 里无条件挂一次）。
//
// - NetworkBars { level }：五格信号，0 = 灰色问号；带可读名「网络：好」。
// - useNetworkHealth()：每 2 秒取一次 callActions.getStats()（全页面一个采样器），好/一般/差 + 持续变差时的建议（仅语音）。
// - CallIssueButton：issues 非空或网络持续差时出现的警告图标，点开逐条说明 + 一个办法按钮。
// - CallTestPanel { open, onClose }：通话检测（麦克风音量条、扬声器试音、摄像头预览、连接测试、复制诊断信息）。
// - CallTestMenuItem { onSelect? }：菜单里的「通话检测」入口；CallDiagnosticsHost：渲染由入口打开的面板。
export type { NetLevel } from "../engine";
export { NetworkBars, type NetworkBarsProps } from "./NetworkBars";
export { CallIssueButton } from "./CallIssueButton";
export { CallTestPanel, type CallTestPanelProps } from "./CallTestPanel";
export { CallDiagnosticsHost, CallTestMenuItem, type CallTestMenuItemProps } from "./CallTestMenuItem";
export { useNetworkHealth } from "./use-network-health";
export type { NetworkHealth, NetworkQuality, NetworkSuggestion } from "./health";
export { openCallTest } from "./diagnostics-store";
