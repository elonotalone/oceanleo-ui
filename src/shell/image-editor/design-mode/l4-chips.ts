/**
 * L4 quick-action chips for the merged image·design editor (task criterion 7).
 *
 * The eight labels are transcribed verbatim from the five-layer spec §3, row 1
 * ("图片·设计（合并 Fabric）"). They are transcribed rather than paraphrased so
 * that a test can compare them against the spec text; the spec caps chips at 8
 * (§2 table, L4 row) and that cap is asserted too.
 *
 * The `tools-manifest` v2 field names are still W01's to define
 * (`signals/W01-interface.md` has not landed). Rather than guess at that
 * shape — §10 rule 10 forbids inventing another owner's interface — the chips
 * are declared here in their own terms, and `imageDesignChipManifestEntries`
 * is the single place that will map them once the contract exists.
 */

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
  },
  {
    id: "image.chip.outpaint-to-size",
    label: "扩图到尺寸",
    summary: "把画面补到目标尺寸，边缘由 AI 生成。",
    commandId: "image.ai.outpaint",
    mode: "both",
    billable: true,
  },
  {
    id: "image.chip.upscale",
    label: "超分",
    summary: "放大 2–4 倍并补细节。",
    commandId: "image.ai.upscale",
    mode: "both",
    billable: true,
  },
  {
    id: "image.chip.multi-size",
    label: "一键多尺寸",
    summary: "按常用画板尺寸各生成一块画板，版面自动适配。",
    commandId: "image.design.generate-sizes",
    mode: "design",
    billable: false,
  },
  {
    id: "image.chip.recolor",
    label: "换配色",
    summary: "只换皮肤轴：配色与装饰层替换，版面结构不动。",
    commandId: "image.design.apply-skin",
    mode: "design",
    billable: false,
  },
  {
    id: "image.chip.erase",
    label: "去水印/擦除",
    summary: "选中要去掉的区域，AI 补齐背景。",
    commandId: "image.ai.inpaint",
    mode: "both",
    billable: true,
  },
  {
    id: "image.chip.generate-similar",
    label: "生成同款",
    summary: "保留版面结构，换一套内容与配图。",
    commandId: "image.design.generate-similar",
    mode: "design",
    billable: true,
  },
  {
    id: "image.chip.export-all-sizes",
    label: "导出全部尺寸",
    summary: "把每块画板各导出一张图。",
    commandId: "image.design.export-artboards",
    mode: "design",
    billable: false,
  },
]);

export function chipsForMode(mode: "photo" | "design"): readonly L4Chip[] {
  return IMAGE_DESIGN_L4_CHIPS.filter(
    (chip) => chip.mode === "both" || chip.mode === mode,
  );
}

export interface L4ChipManifestEntry {
  id: string;
  label: string;
  summary: string;
  commandId: string;
  billable: boolean;
}

/**
 * The payload the chips contribute to `tools-manifest` v2.
 *
 * Deliberately shaped like the chips themselves: the wrapper exists so that
 * when W01 publishes the manifest schema, exactly one function changes rather
 * than every call site.
 */
export function imageDesignChipManifestEntries(
  mode: "photo" | "design",
): L4ChipManifestEntry[] {
  return chipsForMode(mode).map((chip) => ({
    id: chip.id,
    label: chip.label,
    summary: chip.summary,
    commandId: chip.commandId,
    billable: chip.billable,
  }));
}
