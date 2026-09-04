/**
 * 图片件的 L0 专业模式（W01 契约：`normal | pro`）。
 *
 * 顶栏开关是 W01 的面，已经做好了。这一份只做内核这一端：读记住的档位、
 * 收下 `setMode`、决定 Photopea 能不能挂。photo / design 是另一条轴
 * （两视图一份文件，见 `switchEditorMode`），不占这个槽。
 *
 * 去向写成纯函数，不写成 `ImageRoute` 里的 `if`：写成 `if` 的话，
 * `setMode: undefined` 或空转一句就能绕过，而「文件里出现过 setMode」
 * 形态的判据照样绿（A-48 / A-53）。
 */

import { DEFAULT_EDITOR_MODE, type EditorMode } from "../../hosted-editor/index";
import type { PluginThemeId } from "../../plugin-theme";
import { currentPluginMode } from "../../plugin-chrome/plugin-mode-store";

export const IMAGE_PLUGIN_ID: PluginThemeId = "image";

export interface ImageL0ModeApplication {
  mode: EditorMode;
  /** 专业模式才允许挂 Photopea。普通模式连 iframe 都不该存在。 */
  showPhotopea: boolean;
}

export function applyImageL0Mode(next: EditorMode): ImageL0ModeApplication {
  const mode: EditorMode = next === "pro" ? "pro" : DEFAULT_EDITOR_MODE;
  return { mode, showPhotopea: mode === "pro" };
}

/**
 * 打开编辑器时用记住的档位，不是一律普通模式。
 * 没存过就是 `normal`（R3）；读的是 W01 的 `currentPluginMode`，不另起小仓。
 */
export function rememberedImagePluginMode(
  read: (pluginId: PluginThemeId) => EditorMode = currentPluginMode,
): EditorMode {
  return applyImageL0Mode(read(IMAGE_PLUGIN_ID)).mode;
}

export function bindImageModeAdapter(
  current: EditorMode,
  setMode: ((mode: EditorMode) => void) | undefined,
): { current: EditorMode; setMode: (mode: EditorMode) => void } {
  if (typeof setMode !== "function") {
    throw new Error("图片编辑器声明了专业模式，就必须把 setMode 交给顶栏");
  }
  return { current, setMode };
}
