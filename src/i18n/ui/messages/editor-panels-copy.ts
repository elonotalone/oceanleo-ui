import type { Locale } from "../../config";
import {
  assembleEditorPanelsCopy,
  EDITOR_PANELS_COPY_KEYS,
} from "./editor-panels-copy-base";
import { EDITOR_PANELS_COPY_EASTERN } from "./editor-panels-copy-eastern";
import { EDITOR_PANELS_COPY_WESTERN } from "./editor-panels-copy-western";

export { EDITOR_PANELS_COPY_KEYS };

/**
 * 17 语言 × 编辑器内部面板文案，形状是 `useUI()` 要的「中文原文 → 译文」平表。
 * `assembleEditorPanelsCopy` 的入参类型是
 * `Record<Exclude<Locale, "zh">, EditorPanelsCopyMessages>`，
 * 所以少一个语种或少一条 key，tsc 就编不过——不必靠人记得补齐。
 */
export const EDITOR_PANELS_MESSAGES: Record<Locale, Record<string, string>> =
  assembleEditorPanelsCopy({
    ...EDITOR_PANELS_COPY_WESTERN,
    ...EDITOR_PANELS_COPY_EASTERN,
  });
