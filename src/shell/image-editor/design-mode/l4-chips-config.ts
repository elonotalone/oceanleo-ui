/**
 * L4 quick-action chips for the merged image / design editor (criterion 7).
 *
 * Five-layer spec §3 row 1 defines 8 chips for image·design:
 *   换背景、扩图到尺寸、超分、一键多尺寸、换配色、去水印/擦除、生成同款、导出全部尺寸
 *
 * These are stored as configuration constants — the actual `tools-manifest`
 * v2 field alignment waits for `signals/W01-interface.md`, but the chips
 * themselves are ready to wire.
 */

export interface L4ChipDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  commandId?: string;
  requiresSelection: boolean;
  mode?: "photo" | "design" | "both";
}

export const IMAGE_DESIGN_L4_CHIPS: readonly L4ChipDefinition[] = Object.freeze([
  {
    id: "chip-change-bg",
    label: "换背景",
    description: "AI 自动抠出主体，替换背景为纯色、渐变或场景图。",
    icon: "ai-bg",
    commandId: "image.change-background",
    requiresSelection: false,
    mode: "both",
  },
  {
    id: "chip-outpaint-size",
    label: "扩图到尺寸",
    description: "把画布扩展到目标尺寸，AI 填充新增区域。",
    icon: "ai-outpaint",
    commandId: "image.outpaint-to-size",
    requiresSelection: false,
    mode: "both",
  },
  {
    id: "chip-upscale",
    label: "超分",
    description: "AI 高清放大 2–4 倍，保持细节清晰。",
    icon: "ai-upscale",
    commandId: "image.upscale",
    requiresSelection: false,
    mode: "both",
  },
  {
    id: "chip-multi-size",
    label: "一键多尺寸",
    description: "为社媒方图、竖屏、横幅等同时生成多块画板。",
    icon: "artboard",
    commandId: "image.generate-multi-size",
    requiresSelection: false,
    mode: "design",
  },
  {
    id: "chip-recolor",
    label: "换配色",
    description: "AI 分析画面配色并替换为目标色系。",
    icon: "palette",
    commandId: "image.recolor",
    requiresSelection: false,
    mode: "design",
  },
  {
    id: "chip-remove-watermark",
    label: "去水印 / 擦除",
    description: "自动识别并擦除水印、多余文字或杂物。",
    icon: "ai-inpaint",
    commandId: "image.inpaint",
    requiresSelection: false,
    mode: "both",
  },
  {
    id: "chip-generate-similar",
    label: "生成同款",
    description: "以当前设计为参考，AI 生成风格相同但内容不同的变体。",
    icon: "ai-generate",
    commandId: "image.generate-similar",
    requiresSelection: false,
    mode: "design",
  },
  {
    id: "chip-export-all",
    label: "导出全部尺寸",
    description: "把全部画板按各自尺寸一次性导出为 PNG/JPG。",
    icon: "download",
    commandId: "image.export-all-artboards",
    requiresSelection: false,
    mode: "design",
  },
]);

/**
 * Filter chips by current editor mode.
 */
export function chipsForMode(
  mode: "photo" | "design",
): readonly L4ChipDefinition[] {
  return IMAGE_DESIGN_L4_CHIPS.filter(
    (c) => c.mode === "both" || c.mode === mode,
  );
}
