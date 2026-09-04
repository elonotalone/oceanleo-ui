/**
 * 3D 新核的 L0 模式。Native 面（model-viewer）走 adapter.setMode；
 * 专业模式才把 three.js editor iframe 露出来，并向它发契约 v2 的 `set-mode`。
 *
 * `buildSetModeMessage` 校验闭集。默认 ordinary = `"normal"`。
 */
import {
  DEFAULT_EDITOR_MODE,
  buildSetModeMessage,
  type EditorMode,
} from "../hosted-editor/index";

export const MODEL3D_NEXT_INSTANCE_ID = "oceanleo-model3d-next";
export const MODEL3D_NEXT_DEFAULT_MODE: EditorMode = DEFAULT_EDITOR_MODE;
export const MODEL3D_NEXT_STAGE_ATTR = "data-model3d-next-stage";
export const MODEL3D_NEXT_MODE_ATTR = "data-model3d-next-mode";

export interface Model3DNextModeApplication {
  instanceId: string;
  message: ReturnType<typeof buildSetModeMessage>;
  mode: EditorMode;
  /** 专业模式才挂 three.js editor iframe。普通模式不露内核 UI。 */
  showHostedEditor: boolean;
}

export function applyModel3DNextMode(
  instanceId: string,
  mode: EditorMode,
): Model3DNextModeApplication {
  const message = buildSetModeMessage(instanceId, mode);
  const next = message.type === "set-mode" ? message.mode : mode;
  return {
    instanceId,
    message,
    mode: next,
    showHostedEditor: next === "pro",
  };
}

export function isModel3DNextPro(mode: EditorMode): boolean {
  return applyModel3DNextMode(MODEL3D_NEXT_INSTANCE_ID, mode).showHostedEditor;
}
