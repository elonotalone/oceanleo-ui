// ============================================================================
// 旧核动作 → EmbedPDF 2.15.0 的命令映射（W06，editor-core-swap，flag=`next`）
//
// 规范 §2.1 第 6 条：「换核后 L1/L2 的按钮不变，按钮背后的适配器换成新核的 API」。
// 这张表就是那句话的可机检形态：**左边是今天 edit bar / 左侧操控台 / plugin-command
// 已经在用的 id，右边是它在新核上落到哪个 API**。
//
// 纯数据 + 纯函数，不 import `@embedpdf/*`：这样「有没有漏接一个按钮」在没有浏览器、
// 没有 WASM 的环境里也判得出来，而不必等到 V 位打开页面才发现某个按钮变成了死键。
//
// 表里的 `next.member` 全部是 2.15.0 的**实有成员**（读 `@embedpdf/models/dist/pdf.d.ts`
// 的 `PdfEngine` 与各插件 `dist/lib/types.d.ts` 的 `*Capability` 得到）。
// 三条 `unavailable` / `reduced` 不是懒得接，是 2.15.0 确实没有对应 API，
// 逐条写在 `note` 里，并由 `pdfNextCommandGaps()` 汇总给验收看。
// ============================================================================

/** 新核上由谁执行。`engine` = `PdfEngine`；其余是对应插件的 capability。 */
export type PdfNextExecutor =
  | "engine"
  | "annotation"
  | "redaction"
  | "form"
  | "search"
  | "history"
  | "scroll"
  | "zoom"
  | "none";

/**
 * 这个动作在新核上的成色。
 * - `ready`：新核有对等 API，行为不缩水。
 * - `reduced`：能做，但承诺要缩小（代价写在 `note`）。
 * - `unavailable`：2.15.0 没有对应 API，flag=`next` 下这个按钮必须置灰并说明原因，
 *   **不许静默变成死键**。
 */
export type PdfNextReadiness = "ready" | "reduced" | "unavailable";

export interface PdfNextCommandSpec {
  /** 与旧核**同一个 id**。改 id 就等于换了个按钮，规范 §7 判据 2 会红。 */
  id: string;
  /** 这个 id 今天挂在哪一层。 */
  layer: "L0" | "L1" | "L2" | "L4" | "command";
  /** 人话标签，用于置灰时的 title 与验收清单。 */
  label: string;
  /** 旧核（pdf.js / pdf-lib）走的函数，便于删除旧核时逐条对照。 */
  legacy: string;
  /** 新核执行者。 */
  executor: PdfNextExecutor;
  /** 新核上的实有成员名。`unavailable` 时为空串。 */
  member: string;
  readiness: PdfNextReadiness;
  note?: string;
}

const SPECS: readonly PdfNextCommandSpec[] = [
  // ── 注释（L1 高亮/下划线/批注 + L2 编辑所选批注）────────────────────────
  {
    id: "annotation-add-text",
    layer: "L1",
    label: "文字批注",
    legacy: "pdf-annotation-operations.addPdfTextAnnotationAt",
    executor: "annotation",
    member: "createAnnotation",
    readiness: "ready",
  },
  {
    id: "annotation-add-highlight",
    layer: "L1",
    label: "高亮",
    legacy: "pdf-annotation-operations.addPdfHighlightAnnotation",
    executor: "annotation",
    member: "createAnnotation",
    readiness: "ready",
  },
  {
    id: "annotation-add-underline",
    layer: "L1",
    label: "下划线",
    legacy: "pdf-annotation-operations.addPdfQuadAnnotation(underline)",
    executor: "annotation",
    member: "createAnnotation",
    readiness: "ready",
  },
  {
    id: "annotation-list",
    layer: "L2",
    label: "已有批注",
    legacy: "pdf-annotation-operations.listPdfAnnotations",
    executor: "annotation",
    member: "getPageAnnotations",
    readiness: "ready",
  },
  {
    id: "annotation-update",
    layer: "L2",
    label: "保存批注修改",
    legacy: "pdf-annotation-operations.updatePdfAnnotation",
    executor: "annotation",
    member: "updateAnnotation",
    readiness: "ready",
  },
  {
    id: "annotation-move",
    layer: "L1",
    label: "移动批注",
    legacy: "pdf-annotation-operations.movePdfAnnotation",
    executor: "annotation",
    member: "updateAnnotation",
    readiness: "ready",
  },
  {
    id: "annotation-delete",
    layer: "L2",
    label: "删除所选批注",
    legacy: "pdf-annotation-operations.deletePdfAnnotation",
    executor: "engine",
    member: "removePageAnnotation",
    readiness: "ready",
  },
  {
    id: "annotation-select",
    layer: "L1",
    label: "选中批注",
    legacy: "use-pdf-annotations.selectAnnotation",
    executor: "annotation",
    member: "selectAnnotation",
    readiness: "ready",
  },
  // ── 涂黑（L2 办公工具）──────────────────────────────────────────────────
  {
    id: "redaction-mark",
    layer: "L2",
    label: "标记涂黑区",
    legacy: "pdf-form/redaction.markPdfRedaction",
    executor: "redaction",
    member: "addPending",
    readiness: "ready",
  },
  {
    id: "redaction-apply",
    layer: "L2",
    label: "执行涂黑",
    legacy: "pdf-form/redaction.applyPdfRedactions",
    executor: "redaction",
    member: "commitAllPending",
    readiness: "ready",
    note: "上游 commitAllPending 落到 engine.applyAllRedactions；旧核是自己重写内容流，两条路都真删字节而不是盖黑块。",
  },
  // ── 表单填写（L2 办公工具）──────────────────────────────────────────────
  {
    id: "form-list-fields",
    layer: "L2",
    label: "识别表单字段",
    legacy: "pdf-form/acroform.readPdfFormFields",
    executor: "form",
    member: "getFormFields",
    readiness: "ready",
  },
  {
    id: "form-set-value",
    layer: "L2",
    label: "填写表单",
    legacy: "pdf-form/acroform.setPdfFormValues",
    executor: "form",
    member: "setFormValues",
    readiness: "ready",
  },
  {
    id: "form-flatten",
    layer: "L2",
    label: "填完压平",
    legacy: "pdf-form/acroform.flattenPdfForm",
    executor: "engine",
    member: "flattenPage",
    readiness: "ready",
  },
  // ── 签名（L2 办公工具）──────────────────────────────────────────────────
  {
    id: "signature-place",
    layer: "L2",
    label: "放置签名",
    legacy: "pdf-form/signature.placePdfSignature",
    executor: "annotation",
    member: "createAnnotation",
    readiness: "ready",
    note: "签名在 2.15.0 里是 STAMP 子类型的图片注释（@embedpdf/plugin-signature 不是本仓直接依赖，见 W01-deps §2.2 的 17 个包）。",
  },
  // ── 搜索（L1/L4）────────────────────────────────────────────────────────
  {
    id: "pdf.find-text",
    layer: "command",
    label: "全文搜索",
    legacy: "use-pdf-text-layer.searchFullText（pdfjs-dist 文字层）",
    executor: "search",
    member: "searchAllPages",
    readiness: "ready",
    note: "搜索改由 PDFium 出，不再需要 pdfjs-dist 的文字层；扫描件仍然搜不到，原因照旧说明。",
  },
  // ── 页面管理（L1 溢出区 + plugin-command）──────────────────────────────
  {
    id: "pdf.go-to-page",
    layer: "command",
    label: "跳页",
    legacy: "use-pdf-workbench.goToPage",
    executor: "scroll",
    member: "scrollToPage",
    readiness: "ready",
  },
  {
    id: "pdf.delete-page",
    layer: "command",
    label: "删除本页",
    legacy: "pdf-operations.deletePdfPage",
    executor: "engine",
    member: "deletePage",
    readiness: "ready",
  },
  {
    id: "pdf.extract-pages",
    layer: "command",
    label: "提取页",
    legacy: "pdf-operations.extractPdfPages",
    executor: "engine",
    member: "extractPages",
    readiness: "ready",
  },
  {
    id: "pdf.merge",
    layer: "command",
    label: "合并 PDF",
    legacy: "pdf-operations.mergePdfBytes",
    executor: "engine",
    member: "importPages",
    readiness: "ready",
  },
  {
    id: "pdf.move-page",
    layer: "command",
    label: "移动页",
    legacy: "pdf-operations.movePdfPage",
    executor: "engine",
    member: "mergePages",
    readiness: "reduced",
    note: "2.15.0 没有 movePage/reorderPage（`rg movePage` 的两处命中都是 removePageAnnotation 里的字串）。等价做法是 mergePages([{docId, pageIndices: 重排后的顺序}]) 整份重出，代价是文档对象会被换掉一次，注释与表单是否随行需在接线时逐项实测。",
  },
  {
    id: "pdf.rotate-page",
    layer: "command",
    label: "旋转页",
    legacy: "pdf-operations.rotatePdfPage（写进 /Rotate）",
    executor: "none",
    member: "",
    readiness: "unavailable",
    note: "2.15.0 只有视图旋转（plugin-rotate 的 RotateCapability.setRotation），没有把旋转写进文件的 API；`rg -i \"setPageRotation|pageRotation|rotatePage\" @embedpdf/models/dist/pdf.d.ts` 零命中（同文件 saveAsCopy 3 命中，证明正则有效）。flag=next 下这个按钮必须置灰并说明「本页旋转只影响预览，不会存进文件」。",
  },
  {
    id: "pdf.add-blank-page",
    layer: "command",
    label: "插入空白页",
    legacy: "pdf-operations.addBlankPdfPage",
    executor: "none",
    member: "",
    readiness: "unavailable",
    note: "2.15.0 只有 createDocument(id)「Create a new empty PDF document」，没有「在既有文档里插入一页指定尺寸的空白页」的 API。",
  },
  // ── 保存 / 导出 / 历史 ──────────────────────────────────────────────────
  {
    id: "pdf.save",
    layer: "command",
    label: "保存副本",
    legacy: "use-pdf-workbench.saveCopy（bytesRef → doc-io）",
    executor: "engine",
    member: "saveAsCopy",
    readiness: "ready",
    note: "两级持久化不变：saveAsCopy 出字节，仍旧走 doc-io.saveFileToLibrary 落 revision。",
  },
  {
    id: "pdf.export",
    layer: "command",
    label: "下载",
    legacy: "use-pdf-page-actions.download",
    executor: "engine",
    member: "saveAsCopy",
    readiness: "ready",
  },
  {
    id: "history-undo",
    layer: "L0",
    label: "撤销",
    legacy: "use-pdf-workbench.undo（整份字节快照）",
    executor: "history",
    member: "undo",
    readiness: "ready",
    note: "旧核每一步存一份整文档字节；新核的 plugin-history 是命令级历史，内存代价小一个量级。",
  },
  {
    id: "history-redo",
    layer: "L0",
    label: "重做",
    legacy: "use-pdf-workbench.redo",
    executor: "history",
    member: "redo",
    readiness: "ready",
  },
];

export const PDF_NEXT_COMMANDS: readonly PdfNextCommandSpec[] = SPECS;

export const PDF_NEXT_COMMAND_IDS: readonly string[] = SPECS.map(
  (spec) => spec.id,
);

/** 按 id 取一条。取不到返回 `null`，调用方据此置灰而不是渲染一个死键。 */
export function pdfNextCommandFor(id: string): PdfNextCommandSpec | null {
  return SPECS.find((spec) => spec.id === id) || null;
}

/**
 * flag=`next` 下这个 id 能不能点。
 *
 * 返回 `reason` 而不是只返回布尔：`PluginChromeView.unavailableReason` 那条先例
 * （契约 v2 §4 也照抄了）——「有个灰着的开关并告诉你为什么」和「按钮消失」
 * 对用户是两回事。
 */
export function pdfNextCommandAvailability(id: string): {
  enabled: boolean;
  reason: string;
} {
  const spec = pdfNextCommandFor(id);
  if (!spec) {
    return { enabled: false, reason: `新核没有登记 ${id} 这个动作。` };
  }
  if (spec.readiness === "unavailable") {
    return { enabled: false, reason: spec.note || `${spec.label}在新核上暂不可用。` };
  }
  return { enabled: true, reason: "" };
}

/**
 * L1 浮条上的控件 id → 上表里的动作 id。
 *
 * `PdfContextToolbar` 发出的是 `rotate-left` / `move-before` 这类**控件 id**，
 * 与 `plugin-command` 的 `pdf.rotate-page` 不是同一个字符串。规范 §7 判据 2
 * 要求「任一入口触发同一 commandId」，所以这条别名表必须存在且完整——
 * 少一条，就是换核后某个按钮点下去什么都不发生。
 */
export const PDF_L1_CONTROL_ALIASES: Readonly<Record<string, string>> = {
  "rotate-left": "pdf.rotate-page",
  "rotate-right": "pdf.rotate-page",
  "move-before": "pdf.move-page",
  "move-after": "pdf.move-page",
  extract: "pdf.extract-pages",
  delete: "pdf.delete-page",
  "annotation-text": "annotation-update",
  "annotation-select": "annotation-select",
  "annotation-update": "annotation-update",
  "annotation-delete": "annotation-delete",
};

/** 把控件 id 解成动作 id；不是别名就原样返回。 */
export function pdfNextResolveControlId(controlId: string): string {
  return PDF_L1_CONTROL_ALIASES[controlId] || controlId;
}

/** 汇总所有缩水与缺口，给交付说明与 V 位当清单用。 */
export function pdfNextCommandGaps(): PdfNextCommandSpec[] {
  return SPECS.filter((spec) => spec.readiness !== "ready");
}

/**
 * 旧核已有、但表里没登记的动作 —— 换核最容易掉东西的地方就是这里。
 * 调用方把旧核的 id 全集传进来，返回的非空数组就是「换核会丢掉的按钮」。
 */
export function pdfNextMissingCoverage(
  legacyIds: readonly string[],
): string[] {
  const known = new Set(PDF_NEXT_COMMAND_IDS);
  return legacyIds.filter((id) => !known.has(pdfNextResolveControlId(id)));
}
