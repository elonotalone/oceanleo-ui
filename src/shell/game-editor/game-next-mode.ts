/**
 * 游戏编辑器的 L0 模式。专业编辑不可用：计划永远不挂第三方整站。
 *
 * 去向由本函数一次性算完：调用方不许再写一个 `if (mode === "pro")`
 * 决定挂不挂托管框——绕过必须改返回值，闸盯得住。
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
  /** 专业编辑已拿掉；恒为 false。 */
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
    showHostedEditor: false,
  };
}

export function isGameNextPro(mode: EditorMode): boolean {
  return applyGameNextMode("oceanleo-game-next", mode).showHostedEditor;
}
