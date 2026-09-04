/**
 * 画布内的结构 / 皮肤入口（photo | design）。
 *
 * 这不是 W01 的 L0「专业模式」。L0 闭集是 `normal | pro`，图片件上 pro 才挂
 * Photopea。结构 / 皮肤是同一份文件的两种视图，走已经改好的
 * `switchEditorMode` → `planEditorModeSwitch`。点了必须真切，切了不得碰文档。
 */

import {
  FABRIC_EDITOR_MODES,
  switchEditorMode,
  type DesignModeState,
  type EditorModeSwitch,
  type FabricEditorMode,
} from "./design-mode-state";

export const CANVAS_VIEW_LABELS = Object.freeze({
  photo: "结构",
  design: "皮肤",
} as const);

export function canvasViewChoices(current: FabricEditorMode): ReadonlyArray<{
  mode: FabricEditorMode;
  label: string;
  pressed: boolean;
}> {
  return FABRIC_EDITOR_MODES.map((mode) => ({
    mode,
    label: CANVAS_VIEW_LABELS[mode],
    pressed: current === mode,
  }));
}

/**
 * 用户点结构 / 皮肤时的唯一去向。必须调用 `switchEditorMode`：
 * 空转或改文档都会被闸看见。
 */
export function applyCanvasViewClick<TDocument>(
  state: DesignModeState,
  mode: FabricEditorMode,
  document: TDocument,
): EditorModeSwitch<TDocument> {
  return switchEditorMode(state, mode, document);
}
