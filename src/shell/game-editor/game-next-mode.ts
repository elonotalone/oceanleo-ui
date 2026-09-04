/**
 * 游戏新核的 L0 模式。普通模式是代码编辑器 + 沙箱预览；
 * 专业模式才把 microStudio iframe 露出来，并向它发契约 v2 的 `set-mode`。
 *
 * 去向由本函数一次性算完（A-53）：调用方不许再写一个 `if (mode === "pro")`
 * 决定挂不挂 iframe——绕过必须改返回值，闸盯得住。
 */
import {
  DEFAULT_EDITOR_MODE,
  buildSetModeMessage,
  type EditorMode,
} from "../hosted-editor/index";

export const GAME_NEXT_DEFAULT_MODE: EditorMode = DEFAULT_EDITOR_MODE;
export const GAME_NEXT_STAGE_ATTR = "data-game-next-stage";
export const GAME_NEXT_MODE_ATTR = "data-game-next-mode";

export interface GameNextModeApplication {
  instanceId: string;
  message: ReturnType<typeof buildSetModeMessage>;
  mode: EditorMode;
  /** 专业模式才挂 microStudio。普通模式不露第三方整站 UI。 */
  showHostedEditor: boolean;
}

export function applyGameNextMode(
  instanceId: string,
  mode: EditorMode,
): GameNextModeApplication {
  const message = buildSetModeMessage(instanceId, mode);
  const next = message.type === "set-mode" ? message.mode : mode;
  return {
    instanceId,
    message,
    mode: next,
    showHostedEditor: next === "pro",
  };
}

export function isGameNextPro(mode: EditorMode): boolean {
  return applyGameNextMode("oceanleo-game-next", mode).showHostedEditor;
}
