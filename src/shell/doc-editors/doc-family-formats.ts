/**
 * 文档家族（文档 / 表格 / 演示 / PDF）的**入口后缀与下载格式声明表**。
 *
 * 这一份表是四条路由的单一事实源：上传框的 `accept`、要不要先转一次、转成什么、
 * 转不了时给用户看的那句话、下载菜单里出现哪几个格式，全从这里读。
 * 拆成纯数据模块是为了能在 `node --test` 里直接断言，不用起 React。
 *
 * 合同：`docs/work-logs/2026-08/office-core-consolidation/00-dispatch-contract.md`
 * §3.3（上传归一化：转换一律走后端既有端点，前端不许塞新解析器）与 §3.4（下载多格式）。
 */

import type { EditorImportPlan } from "../import-normalize";

/** 文档家族的四条路由 id，与编辑栏适配器里的 id 逐字相同。 */
export type DocFamilyEditorId = "richdoc" | "grid" | "deck" | "pdf";

export const DOC_FAMILY_EDITOR_IDS: readonly DocFamilyEditorId[] = [
  "richdoc",
  "grid",
  "deck",
  "pdf",
];

export interface DocFamilyDownloadFormat {
  /** 下载菜单条目 id，前缀是路由 id。 */
  id: string;
  /** 用户看得懂的格式名，例如「Word 文档 (.docx)」。不许出现 MIME 串。 */
  label: string;
  /** 落地文件后缀。 */
  extension: string;
  /**
   * `local` = 浏览器本地就能出；`convert` = 走后端 `/v1/convert/office`。
   * 判据在交付说明里要逐条对得上，所以写在数据里而不是藏在分支里。
   */
  via: "local" | "convert";
}

/**
 * 每条路由的下载格式。顺序就是菜单顺序，第一条是各自的主交付物
 * （由适配器的 `directDownload` 呈现，因此不重复出现在 `actions` 里）。
 */
export const DOC_FAMILY_DOWNLOAD_FORMATS: Readonly<
  Record<DocFamilyEditorId, readonly DocFamilyDownloadFormat[]>
> = {
  richdoc: [
    { id: "richdoc.download.docx", label: "Word 文档 (.docx)", extension: "docx", via: "local" },
    { id: "richdoc.download.md", label: "Markdown 文本 (.md)", extension: "md", via: "local" },
    { id: "richdoc.download.html", label: "网页 (.html)", extension: "html", via: "local" },
    { id: "richdoc.download.pdf", label: "PDF 文件 (.pdf)", extension: "pdf", via: "convert" },
    { id: "richdoc.download.txt", label: "纯文本 (.txt)", extension: "txt", via: "local" },
    { id: "richdoc.download.json", label: "可继续编辑的工程文件 (.json)", extension: "json", via: "local" },
  ],
  grid: [
    { id: "grid.download.xlsx", label: "Excel 工作簿 (.xlsx)", extension: "xlsx", via: "local" },
    { id: "grid.download.csv", label: "当前工作表逗号分隔 (.csv)", extension: "csv", via: "local" },
    { id: "grid.download.pdf", label: "PDF 文件 (.pdf)", extension: "pdf", via: "convert" },
  ],
  deck: [
    { id: "deck.download.pptx", label: "PowerPoint 演示文稿 (.pptx)", extension: "pptx", via: "local" },
    { id: "deck.download.pdf", label: "PDF 文件 (.pdf)", extension: "pdf", via: "convert" },
    { id: "deck.download.json", label: "可继续编辑的工程文件 (.json)", extension: "json", via: "local" },
  ],
  pdf: [
    { id: "pdf.download.pdf", label: "PDF 文件 (.pdf)", extension: "pdf", via: "local" },
  ],
};

/**
 * 路由原生就能打开的后缀（不用转，一律不经过后端）。
 * 与各自的载入器逐条对齐：`rich-doc-model.ts:loadRichDocFile`、
 * `grid-model.ts:loadGridFile`、`pptx-deck-import.ts:importPptxDeck`、PDF 原生。
 */
export const DOC_FAMILY_NATIVE_EXTENSIONS: Readonly<
  Record<DocFamilyEditorId, readonly string[]>
> = {
  richdoc: ["docx", "md", "markdown", "txt", "html", "htm"],
  grid: ["csv", "xlsx", "xls", "xlsm", "ods"],
  deck: ["pptx"],
  pdf: ["pdf"],
};

/**
 * 「先转一次才能编」的后缀 → 转成什么。转换只走后端 `/v1/convert/office`
 * （LibreOffice headless），所以这里列的每一条都必须是 LibreOffice 真能读的格式。
 */
export const DOC_FAMILY_CONVERT_TARGETS: Readonly<
  Record<DocFamilyEditorId, Readonly<Record<string, string>>>
> = {
  richdoc: {
    doc: "docx",
    dot: "docx",
    dotx: "docx",
    docm: "docx",
    rtf: "docx",
    odt: "docx",
    fodt: "docx",
    wps: "docx",
  },
  grid: {
    tsv: "xlsx",
    xlsb: "xlsx",
    xlt: "xlsx",
    xltx: "xlsx",
    fods: "xlsx",
  },
  deck: {
    ppt: "pptx",
    pot: "pptx",
    potx: "pptx",
    potm: "pptx",
    pptm: "pptx",
    odp: "pptx",
    fodp: "pptx",
  },
  // PDF 路由的「编辑」就是把别的文件变成页码接进来，所以什么都往 pdf 转。
  pdf: {
    doc: "pdf",
    docx: "pdf",
    odt: "pdf",
    rtf: "pdf",
    txt: "pdf",
    md: "pdf",
    html: "pdf",
    htm: "pdf",
    xls: "pdf",
    xlsx: "pdf",
    csv: "pdf",
    ods: "pdf",
    ppt: "pdf",
    pptx: "pdf",
    odp: "pdf",
  },
};

/**
 * 已知但确实打不开的后缀 → 给用户的那一句话。
 * 存在的意义是**不许静默留白**：这些格式过去要么被拒得没有理由，要么打开是空编辑器。
 */
export const DOC_FAMILY_KNOWN_REFUSALS: Readonly<Record<string, string>> = {
  numbers:
    "这是苹果 Numbers 的表格，平台还打不开；请在 Numbers 里导出成 Excel 或 CSV 再上传。",
  pages:
    "这是苹果 Pages 的文档，平台还打不开；请在 Pages 里导出成 Word 或 PDF 再上传。",
  key:
    "这是苹果 Keynote 的演示文稿，平台还打不开；请在 Keynote 里导出成 PowerPoint 或 PDF 再上传。",
  epub: "电子书 .epub 还打不开；请先转成 Word 或 PDF 再上传。",
  mht: "网页归档 .mht 还打不开；请另存成 .html 再上传。",
  wpd: "WordPerfect 的 .wpd 还打不开；请先转成 Word 或 PDF 再上传。",
  pdf: "PDF 不能直接当文档编辑；请打开 PDF 编辑器，或先转成 Word 再上传。",
};

/** 文件名 / URL → 小写后缀（没有后缀给空串）。 */
export function docFamilyExtensionOf(fileName: string): string {
  const clean = String(fileName || "")
    .split(/[?#]/)[0]
    .trim()
    .toLowerCase();
  if (!clean.includes(".")) return "";
  return clean.split(".").pop() || "";
}

/** 这条路由能不能直接吃这个后缀（不用转）。 */
export function docFamilyAcceptsNatively(
  editorId: DocFamilyEditorId,
  fileName: string,
): boolean {
  const extension = docFamilyExtensionOf(fileName);
  return DOC_FAMILY_NATIVE_EXTENSIONS[editorId].includes(extension);
}

/**
 * 这个文件要转成什么才编得动；不需要转或转不了都给空串。
 * 原生能吃的一律给空串——不许为了「统一走一遍后端」白花一次转换。
 */
export function docFamilyConvertTarget(
  editorId: DocFamilyEditorId,
  fileName: string,
): string {
  const extension = docFamilyExtensionOf(fileName);
  if (!extension) return "";
  if (DOC_FAMILY_NATIVE_EXTENSIONS[editorId].includes(extension)) return "";
  return DOC_FAMILY_CONVERT_TARGETS[editorId][extension] || "";
}

/** 图片在文档/演示里是插图，不是「打不开的文档」，两条路由都单独放行。 */
const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
  "bmp",
  "avif",
]);

export function docFamilyIsImage(fileName: string): boolean {
  return IMAGE_EXTENSIONS.has(docFamilyExtensionOf(fileName));
}

/**
 * 这条路由为什么打不开这个文件——**一句中文**，空串表示能打开。
 * 调用方必须把它显示出来（状态栏），不许换成空白编辑器。
 */
export function docFamilyRefusalReason(
  editorId: DocFamilyEditorId,
  fileName: string,
): string {
  const extension = docFamilyExtensionOf(fileName);
  if (!extension) {
    return "这个文件没有扩展名，认不出是什么格式；请补上扩展名再上传。";
  }
  if (DOC_FAMILY_NATIVE_EXTENSIONS[editorId].includes(extension)) return "";
  if (DOC_FAMILY_CONVERT_TARGETS[editorId][extension]) return "";
  if ((editorId === "richdoc" || editorId === "deck") && docFamilyIsImage(fileName)) {
    return "";
  }
  const known = DOC_FAMILY_KNOWN_REFUSALS[extension];
  if (known) return known;
  return `这里还打不开 .${extension} 文件；请先转成${docFamilyPreferredFormatsText(
    editorId,
  )}再上传。`;
}

function docFamilyPreferredFormatsText(editorId: DocFamilyEditorId): string {
  switch (editorId) {
    case "richdoc":
      return " Word（.docx）、Markdown 或纯文本";
    case "grid":
      return " Excel（.xlsx）或 CSV";
    case "deck":
      return " PowerPoint（.pptx）";
    default:
      return " PDF";
  }
}

/**
 * 上传框的 `accept`：原生 + 可转 + （文档/演示的）图片。
 * 从同一张表派生，才不会再出现「选得中、打开时被拒」那种事故
 * （P1 实测：`.tsv` 在表格上传框里选得中，`loadGridFile` 当场拒）。
 */
export function docFamilyAcceptAttribute(editorId: DocFamilyEditorId): string {
  const extensions = [
    ...DOC_FAMILY_NATIVE_EXTENSIONS[editorId],
    ...Object.keys(DOC_FAMILY_CONVERT_TARGETS[editorId]),
  ];
  const parts = extensions.map((extension) => `.${extension}`);
  if (editorId === "richdoc" || editorId === "deck") parts.push("image/*");
  return parts.join(",");
}

/**
 * 这条路由交给共享归一化助手（合同 §3.3）的声明表。
 * 同一张表既喂 `accept`、又喂归一化，两边永远不会各说一套。
 */
export function docFamilyImportPlan(
  editorId: DocFamilyEditorId,
): EditorImportPlan {
  const targets = DOC_FAMILY_CONVERT_TARGETS[editorId];
  const byTarget = new Map<string, string[]>();
  for (const [from, to] of Object.entries(targets)) {
    const list = byTarget.get(to) || [];
    list.push(from);
    byTarget.set(to, list);
  }
  return {
    editorId,
    accept: [...DOC_FAMILY_NATIVE_EXTENSIONS[editorId]],
    rules: [...byTarget.entries()].map(([to, from]) => ({
      from,
      to,
      endpoint: "office" as const,
    })),
  };
}

/**
 * 四条路由的声明表一次给全。
 *
 * 空件挂载那条路（拖一个文件进空框，还没有任何编辑器挂载）需要在编辑器之前就知道
 * 这些映射，所以这里给出一份**无副作用**的数组，由工作台入口在启动时注册。
 */
export const DOC_FAMILY_IMPORT_PLANS: readonly EditorImportPlan[] =
  DOC_FAMILY_EDITOR_IDS.map((editorId) => docFamilyImportPlan(editorId));

/** 转换失败时对用户说的话：带上后端给的原因，不许只说「失败」。 */
export function docFamilyConvertFailureMessage(
  fileName: string,
  target: string,
  detail: string,
): string {
  const extension = docFamilyExtensionOf(fileName) || "未知";
  const because = String(detail || "").trim();
  const tail = because ? `原因：${because}` : "转换服务没有给出原因。";
  return `.${extension} 转 ${target.toUpperCase()} 没成功，文件没有被打开。${tail}`;
}
