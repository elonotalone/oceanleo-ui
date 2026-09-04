/**
 * 工作流件的 L0 模式。普通模式露 React Flow 画布；专业模式才挂 Langflow iframe。
 *
 * 切模式的**唯一**通道是契约 v2 的 `set-mode`（R3）。这里不发明第二个开关。
 * 去向由本函数一次算完：舞台只照 `showCanvas` / `showHostedEditor` 渲染。
 * 写成 `if (mode === "pro")` 散落在 JSX 里的话，一句 `{false &&` 就能让
 * 用户看不见 iframe，而「文件里出现过 iframe」的源码闸照样绿（A-48 / A-53）。
 */
import {
  DEFAULT_EDITOR_MODE,
  buildSetModeMessage,
  type EditorMode,
} from "../hosted-editor/index";

export const WORKFLOW_LANGFLOW_DEFAULT_MODE: EditorMode = DEFAULT_EDITOR_MODE;
export const WORKFLOW_STAGE_ATTR = "data-workflow-langflow-stage";
export const WORKFLOW_MODE_ATTR = "data-workflow-langflow-mode";
export const WORKFLOW_CANVAS_ATTR = "data-workflow-canvas-visible";
export const WORKFLOW_HOSTED_ATTR = "data-workflow-hosted-visible";

export interface WorkflowEditorModePlan {
  instanceId: string;
  message: ReturnType<typeof buildSetModeMessage>;
  mode: EditorMode;
  /** 普通模式才画 React Flow 槽。专业模式把槽收起来，避免两张图画布叠着。 */
  showCanvas: boolean;
  /** 专业模式才挂 Langflow iframe。 */
  showHostedEditor: boolean;
}

export function applyWorkflowEditorMode(
  instanceId: string,
  mode: EditorMode,
): WorkflowEditorModePlan {
  const message = buildSetModeMessage(instanceId, mode);
  const next = message.type === "set-mode" ? message.mode : DEFAULT_EDITOR_MODE;
  const pro = next === "pro";
  return {
    instanceId,
    message,
    mode: next,
    showCanvas: !pro,
    showHostedEditor: pro,
  };
}

export function isWorkflowLangflowPro(mode: EditorMode): boolean {
  return applyWorkflowEditorMode("oceanleo-workflow", mode).showHostedEditor;
}
