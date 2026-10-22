// W14 · 网络检测与通话检测（合同 §3.9）。首个提交：导出名与 props 的桩，组件先 return null。
// NetLevel 与 W05 engine/index.ts 的定义同形（0 未知，1 很差 … 5 很好）；W05 引擎落地后改为从 ../engine 引入。

export type NetLevel = 0 | 1 | 2 | 3 | 4 | 5;

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

export function NetworkBars(_props: NetworkBarsProps): null {
  return null;
}

export function CallIssueButton(): null {
  return null;
}

export function CallTestPanel(_props: CallTestPanelProps): null {
  return null;
}

export function CallTestMenuItem(): null {
  return null;
}

export function useNetworkHealth(): NetworkHealth {
  return { level: 0, quality: "unknown", sustainedPoor: false, suggestAudioOnly: false };
}
