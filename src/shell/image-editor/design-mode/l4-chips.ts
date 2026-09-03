/**
 * L4 quick-action chips for the merged image·design editor (task criterion 7).
 *
 * The eight labels are transcribed verbatim from the five-layer spec §3, row 1
 * ("图片·设计（合并 Fabric）"). They are transcribed rather than paraphrased so
 * that a test can compare them against the spec text; the spec caps chips at 8
 * (§2 table, L4 row) and that cap is asserted too.
 *
 * `imageDesignChipManifestEntries` emits `EditorAgentChip` values for
 * `tools-manifest` v2, per the contract W01 published in
 * `signals/W01-interface.md` §3: `manifestVersion: 2` gates the `chips` field,
 * `kind` comes from a closed set, and `appliesTo` lists the selection kinds a
 * chip is offered for (`"*"` including no selection at all).
 */

import type {
  EditorAgentChip,
  EditorAgentChipKind,
} from "../../editor-protocol-types";

export type L4ChipMode = "photo" | "design" | "both";

export interface L4Chip {
  id: string;
  /** Verbatim from the five-layer spec §3 row 1. */
  label: string;
  summary: string;
  /** Command executed when the chip is pressed; one chip, one command. */
  commandId: string;
  mode: L4ChipMode;
  /** Spends a paid provider call, so the chip needs a confirmation step. */
  billable: boolean;
  /** Contract closed set; the host picks icon and grouping from it. */
  kind: EditorAgentChipKind;
  /** Selection kinds this chip applies to; `["*"]` includes no selection. */
  appliesTo: string[];
  /** Prompt template; the host substitutes `{selection}` / `{document}`. */
  prompt: string;
}

/** Five-layer spec §2: "chips ≤ 8". */
export const L4_CHIP_LIMIT = 8;

export const IMAGE_DESIGN_L4_CHIPS: readonly L4Chip[] = Object.freeze([
  {
    id: "image.chip.replace-background",
    label: "换背景",
    summary: "抠出主体后换一张背景，或换成纯色。",
    commandId: "image.ai.remove-bg",
    mode: "both",
    billable: true,
    kind: "generate",
    appliesTo: ["*"],
    prompt: "把 {document} 的主体抠出来，换一张与主体光线一致的新背景。",
  },
  {
    id: "image.chip.outpaint-to-size",
    label: "扩图到尺寸",
    summary: "把画面补到目标尺寸，边缘由 AI 生成。",
    commandId: "image.ai.outpaint",
    mode: "both",
    billable: true,
    kind: "generate",
    appliesTo: ["*"],
    prompt: "把 {document} 扩展到目标尺寸，新增区域顺着原画面补齐，主体不要变形。",
  },
  {
    id: "image.chip.upscale",
    label: "超分",
    summary: "放大 2–4 倍并补细节。",
    commandId: "image.ai.upscale",
    mode: "both",
    billable: true,
    kind: "generate",
    appliesTo: ["*"],
    prompt: "把 {document} 放大到 2 倍并补足细节，不要改变构图。",
  },
  {
    id: "image.chip.multi-size",
    label: "一键多尺寸",
    summary: "按常用画板尺寸各生成一块画板，版面自动适配。",
    commandId: "image.design.generate-sizes",
    mode: "design",
    billable: false,
    kind: "layout",
    appliesTo: ["*"],
    prompt: "按方图、竖屏、横幅三种尺寸各生成一块画板，{document} 的文字与主体都要完整可见。",
  },
  {
    id: "image.chip.recolor",
    label: "换配色",
    summary: "只换皮肤轴：配色与装饰层替换，版面结构不动。",
    commandId: "image.design.apply-skin",
    mode: "design",
    billable: false,
    kind: "restyle",
    appliesTo: ["*"],
    prompt: "只替换 {document} 的配色与装饰层，版面结构、文字内容与位置一律不动。",
  },
  {
    id: "image.chip.erase",
    label: "去水印/擦除",
    summary: "选中要去掉的区域，AI 补齐背景。",
    commandId: "image.ai.inpaint",
    mode: "both",
    billable: true,
    kind: "cleanup",
    appliesTo: ["image", "shape"],
    prompt: "擦掉 {selection} 覆盖的内容，用周围画面补齐，不要留下痕迹。",
  },
  {
    id: "image.chip.generate-similar",
    label: "生成同款",
    summary: "保留版面结构，换一套内容与配图。",
    commandId: "image.design.generate-similar",
    mode: "design",
    billable: true,
    kind: "generate",
    appliesTo: ["*"],
    prompt: "参照 {document} 的版面结构与风格，生成一版内容不同的同款设计。",
  },
  {
    id: "image.chip.export-all-sizes",
    label: "导出全部尺寸",
    summary: "把每块画板各导出一张图。",
    commandId: "image.design.export-artboards",
    mode: "design",
    billable: false,
    kind: "export",
    appliesTo: ["*"],
    prompt: "把 {document} 的每一块画板按其自身尺寸各导出一张图。",
  },
]);

export function chipsForMode(mode: "photo" | "design"): readonly L4Chip[] {
  return IMAGE_DESIGN_L4_CHIPS.filter(
    (chip) => chip.mode === "both" || chip.mode === mode,
  );
}

/**
 * The chips as `tools-manifest` v2 declares them.
 *
 * `summary`, `commandId`, `mode` and `billable` stay on this side of the
 * boundary: the contract has no room for them, and the host runs the chip by
 * `id`. Sending fields the validator does not know about would be rejected
 * wholesale, taking all eight chips down with it.
 */
export function imageDesignChipManifestEntries(
  mode: "photo" | "design",
): EditorAgentChip[] {
  return chipsForMode(mode).map((chip) => ({
    id: chip.id,
    label: chip.label,
    kind: chip.kind,
    appliesTo: [...chip.appliesTo],
    prompt: chip.prompt,
  }));
}

/** `manifestVersion` gates the `chips` field; without it the host ignores them. */
export const IMAGE_DESIGN_MANIFEST_VERSION = 2 as const;
