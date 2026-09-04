/**
 * L0 / L3：专业模式 = option JSON 代码模式（R4）。
 *
 * Native 件不往 iframe 发 postMessage。`buildSetModeMessage` 只用来校验闭集
 * `normal | pro`；真切 UI 的是 `codeModeVisible`。
 */
import {
  DEFAULT_EDITOR_MODE,
  buildSetModeMessage,
  type EditorMode,
} from "../hosted-editor/index";

export const CHART_NEXT_INSTANCE_ID = "oceanleo-chart-next";
export const CHART_NEXT_DEFAULT_MODE: EditorMode = DEFAULT_EDITOR_MODE;
export const CHART_NEXT_STAGE_ATTR = "data-chart-next-stage";
export const CHART_NEXT_MODE_ATTR = "data-chart-next-mode";

export function applyChartNextMode(
  instanceId: string,
  mode: EditorMode,
): { mode: EditorMode; codeModeVisible: boolean } {
  const message = buildSetModeMessage(instanceId, mode);
  const next = message.mode as EditorMode;
  return {
    mode: next,
    codeModeVisible: next === "pro",
  };
}
