// W14 · 网络检测与通话检测（合同 §3.9；A-7 追加无 props 的 CallDiagnosticsHost，由 W07 在 CallHost 里无条件挂一次）。
// 桩阶段：组件先 return null；NetLevel 取自 W05 引擎。
import type { NetLevel } from "../engine";

export type { NetLevel } from "../engine";

export type NetworkQuality = "unknown" | "good" | "fair" | "poor";

export interface NetworkHealth {
  /** 当前等级（0 未知）。 */
  level: NetLevel;
  quality: NetworkQuality;
  /** 持续变差（连续多次采样为差）。 */
  sustainedPoor: boolean;
  /** 持续变差且未开仅语音时建议切换为仅语音。 */
  suggestAudioOnly: boolean;
}

export interface NetworkBarsProps { level: NetLevel }
export interface CallTestPanelProps { open: boolean; onClose(): void }
export interface CallTestMenuItemProps { onSelect?(): void }

export function NetworkBars(_props: NetworkBarsProps): null {
  return null;
}

export function CallIssueButton(): null {
  return null;
}

export function CallTestPanel(_props: CallTestPanelProps): null {
  return null;
}

export function CallTestMenuItem(_props: CallTestMenuItemProps = {}): null {
  return null;
}

/** 全局宿主（A-7）：渲染由 `CallTestMenuItem` 打开的「通话检测」面板，活得比菜单久，不在通话中也能用。 */
export function CallDiagnosticsHost(): null {
  return null;
}

export function useNetworkHealth(): NetworkHealth {
  return { level: 0, quality: "unknown", sustainedPoor: false, suggestAudioOnly: false };
}
