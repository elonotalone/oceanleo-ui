// ============================================================================
// PDF 的 L4 快捷动作 chips（W06，editor-core-swap，判据 5 后半）
//
// 八条照抄五层规范 §3「PDF（EmbedPDF）」那一行的 L4 列：
// 总结全文 / 提取表格 / 翻译选区 / 填表（识别字段）/ 合并·拆分 / OCR / 压缩 / 按章节切分。
//
// 类型与校验器**都来自宿主契约 v2 的唯一入口** `../hosted-editor`（`W01-interface.md` §1）：
// 本文件不自己定义 chip 形状、不自己写上限。上限（≤8）、id 唯一、kind 闭集、
// appliesTo 1–24 条、prompt ≤2000 全部由 `validAgentChips` 判，本地只负责内容。
//
// 选区 kind 取自 `PdfContextToolbar` 今天真在发的两种：`pdf-page` 与 `pdf-annotation`
// （`SelectionContext.kind`）。声明 `*` 的那几条在**没有选区**时也出现——
// 「总结全文」本来就不需要先选中什么。
// ============================================================================

import {
  CHIP_ANY_SELECTION,
  validAgentChips,
  type EditorAgentChip,
} from "../hosted-editor/index";

/** 这件编辑器会发出的选区 kind，与 `PdfContextToolbar` 的 `context.kind` 同源。 */
export const PDF_SELECTION_KIND_PAGE = "pdf-page";
export const PDF_SELECTION_KIND_ANNOTATION = "pdf-annotation";

export const PDF_AGENT_CHIPS: readonly EditorAgentChip[] = [
  {
    id: "pdf.chip.summarize",
    label: "总结全文",
    kind: "summarize",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "note",
    prompt:
      "请通读这份 PDF 并给出结构化摘要：一句话主旨、三到五条要点、以及每条要点对应的页码。文档内容：{document}",
  },
  {
    id: "pdf.chip.extract-tables",
    label: "提取表格",
    kind: "extract",
    appliesTo: [CHIP_ANY_SELECTION, PDF_SELECTION_KIND_PAGE],
    icon: "table",
    prompt:
      "把这份 PDF 里的表格提取成 CSV，每张表单独一段并注明它在第几页。识别不出表格结构时直说是哪一页认不出，不要编造数据。文档内容：{document}",
  },
  {
    id: "pdf.chip.translate-selection",
    label: "翻译选区",
    kind: "translate",
    appliesTo: [PDF_SELECTION_KIND_PAGE, PDF_SELECTION_KIND_ANNOTATION],
    icon: "text",
    prompt:
      "把选中的这段内容翻译成中文，保留原有的编号、术语与换行。选中内容：{selection}",
  },
  {
    id: "pdf.chip.fill-form",
    label: "填表（识别字段）",
    kind: "generate",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "select",
    prompt:
      "识别这份 PDF 的表单字段，列出每个字段的名称、类型与建议填写值，并说明你的依据来自文档哪一页。不确定的字段留空并写明为什么。文档内容：{document}",
  },
  {
    id: "pdf.chip.merge-split",
    label: "合并 / 拆分",
    kind: "export",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "pages",
    prompt:
      "根据我的要求把这份 PDF 合并或拆分：先复述你打算怎么切（哪些页归哪一份），等我确认后再执行。文档共有 {selection} 这些页。",
  },
  {
    id: "pdf.chip.ocr",
    label: "OCR 文字识别",
    kind: "extract",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "image",
    prompt:
      "这份 PDF 可能是扫描件、没有文字层。请对页面做文字识别并按页输出识别结果；做不到时直接说做不到，不要用猜测的内容顶上。文档内容：{document}",
  },
  {
    id: "pdf.chip.compress",
    label: "压缩体积",
    kind: "cleanup",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "download",
    prompt:
      "分析这份 PDF 体积大在哪里（图片分辨率、内嵌字体、重复资源），给出压缩方案与预计压到多少，并说明会损失什么。文档内容：{document}",
  },
  {
    id: "pdf.chip.split-by-chapter",
    label: "按章节切分",
    kind: "export",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "layers",
    prompt:
      "按这份 PDF 的目录或标题层级给出章节切分方案：每一章的标题、起止页码。没有目录时说明你是按什么判定的章节边界。文档内容：{document}",
  },
];

/**
 * `tools-manifest` v2 的载荷片段。
 *
 * `manifestVersion: 2` 与 `chips` 都是**可选**字段（契约 §3），但 v2 规定
 * 「只有给了 `manifestVersion`，`chips` 才会被读」——两个必须成对发出，
 * 只发 chips 等于什么都没发。
 */
export function pdfToolsManifestV2Fields(): {
  manifestVersion: 2;
  chips: EditorAgentChip[];
} {
  return { manifestVersion: 2, chips: PDF_AGENT_CHIPS.map((chip) => ({ ...chip })) };
}

/**
 * 自检：这八条过不过契约校验器。
 *
 * 放在产品代码里而不是只放在测试里，是因为**发出去之前**就该拦住：
 * 校验不过时宿主收到的是一条被丢掉的 manifest，编辑器侧一点提示都没有。
 */
export function pdfAgentChipsAreValid(): boolean {
  return validAgentChips(PDF_AGENT_CHIPS as unknown as EditorAgentChip[]);
}
