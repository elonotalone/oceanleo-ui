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
  // `tsv` 与 `csv` 是同一条纯文本路径（读取器自己认制表符）；
  // 后端转换服务的入口白名单里没有 `.tsv`，所以它只能在这里收。
  grid: ["csv", "tsv", "xlsx", "xls", "xlsm", "ods"],
  deck: ["pptx"],
  pdf: ["pdf"],
};

/**
 * 「先转一次才能编」的后缀 → 转成什么。转换只走后端 `/v1/convert/office`。
 *
 * **这张表照着后端的白名单写，并且用真文件实测过（2026-08-19）。**
 * 白名单的单一事实源是 `oceanleo/backend/app/convert/capabilities.py`：
 *   来源 doc/docx/odt/rtf/txt · xls/xlsx/ods/csv/tsv · ppt/pptx/odp · pdf；
 *   落地 pdf / docx / xlsx / pptx。
 * 实测补出一条白名单没写的规则：**跨家族转不了**——真 pptx 要 docx 会拿回 422
 * `no export filter`，而 rtf→docx、csv→xlsx、ppt/odp→pptx、任意→pdf 都是 200。
 * 白名单外的后缀（dotx / docm / wps / xlsb / xltx / pptm / potx / fodp…）
 * 送过去只会拿回 400，所以它们不进这张表，而是进 `DOC_FAMILY_KNOWN_REFUSALS`
 * ——给用户一句「另存成什么再上传」，而不是转一圈再失败。
 */
export const DOC_FAMILY_CONVERT_TARGETS: Readonly<
  Record<DocFamilyEditorId, Readonly<Record<string, string>>>
> = {
  richdoc: {
    doc: "docx",
    rtf: "docx",
    odt: "docx",
  },
  // 表格这一格是空的，而且是故意的：后端能读的表格格式（csv/tsv/xls/xlsx/ods）
  // 本机的读取器本来就全认，转一趟只会多花一次往返、还得先登录；
  // 后端也读不了的（xlsb/xltx/fods…）转过去同样是 400。
  grid: {},
  deck: {
    ppt: "pptx",
    odp: "pptx",
  },
  // PDF 路由的「编辑」就是把别的文件变成页码接进来，所以白名单里的都往 pdf 转。
  pdf: {
    doc: "pdf",
    docx: "pdf",
    odt: "pdf",
    rtf: "pdf",
    txt: "pdf",
    csv: "pdf",
    xls: "pdf",
    xlsx: "pdf",
    ods: "pdf",
    ppt: "pdf",
    odp: "pdf",
    pptx: "pdf",
  },
};

/**
 * 已知但确实打不开的后缀 → 给用户的那一句话。
 * 存在的意义是**不许静默留白**：这些格式过去要么被拒得没有理由，要么打开是空编辑器。
 */
export const DOC_FAMILY_KNOWN_REFUSALS: Readonly<Record<string, string>> = {
  docm: "带宏的 .docm 打不开；请在 Word 里另存为 .docx（宏不会保留）再上传。",
  dot: "这是 Word 的模板文件；请另存为 .docx 再上传。",
  dotx: "这是 Word 的模板文件；请另存为 .docx 再上传。",
  pptm: "带宏的 .pptm 打不开；请在 PowerPoint 里另存为 .pptx（宏不会保留）再上传。",
  pot: "这是 PowerPoint 的模板文件；请另存为 .pptx 再上传。",
  potx: "这是 PowerPoint 的模板文件；请另存为 .pptx 再上传。",
  potm: "这是带宏的 PowerPoint 模板；请另存为 .pptx 再上传。",
  xlsb: "Excel 的二进制格式 .xlsb 打不开；请另存为 .xlsx 再上传。",
  xlt: "这是 Excel 的模板文件；请另存为 .xlsx 再上传。",
  xltx: "这是 Excel 的模板文件；请另存为 .xlsx 再上传。",
  wps: "这是 WPS 文字的 .wps 格式；请另存为 .docx 或 .pdf 再上传。",
  et: "这是 WPS 表格的 .et 格式；请另存为 .xlsx 或 .csv 再上传。",
  dps: "这是 WPS 演示的 .dps 格式；请另存为 .pptx 再上传。",
  fodt: "平面 ODF 文档 .fodt 打不开；请另存为 .odt 或 .docx 再上传。",
  fods: "平面 ODF 表格 .fods 打不开；请另存为 .ods 或 .xlsx 再上传。",
  fodp: "平面 ODF 演示 .fodp 打不开；请另存为 .odp 或 .pptx 再上传。",
  numbers:
    "这是苹果 Numbers 的表格，平台还打不开；请在 Numbers 里导出成 Excel 或 CSV 再上传。",
  pages:
    "这是苹果 Pages 的文档，平台还打不开；请在 Pages 里导出成 Word 或 PDF 再上传。",
  key:
    "这是苹果 Keynote 的演示文稿，平台还打不开；请在 Keynote 里导出成 PowerPoint 或 PDF 再上传。",
  epub: "电子书 .epub 还打不开；请先转成 Word 或 PDF 再上传。",
  mht: "网页归档 .mht 还打不开；请另存成 .html 再上传。",
  wpd: "WordPerfect 的 .wpd 还打不开；请先转成 Word 或 PDF 再上传。",
};

/**
 * 后缀 → 它本来属于哪条路由。
 *
 * 用来分开两种「打不开」：**送错了门**（把表格拖进文档编辑器）和
 * **这条路真的不认**（把 .xlsb 拖进表格编辑器）。前者要指路，后者要给另存建议；
 * 混在一张按后缀查的表里，就会对着文档编辑器的用户说「请另存为 .xlsx」——
 * 而文档编辑器根本不开 .xlsx。
 */
const DOC_FAMILY_EXTENSION_OWNER: Readonly<Record<string, DocFamilyEditorId>> = {
  doc: "richdoc",
  docx: "richdoc",
  docm: "richdoc",
  dot: "richdoc",
  dotx: "richdoc",
  rtf: "richdoc",
  odt: "richdoc",
  fodt: "richdoc",
  wps: "richdoc",
  md: "richdoc",
  markdown: "richdoc",
  txt: "richdoc",
  html: "richdoc",
  htm: "richdoc",
  csv: "grid",
  tsv: "grid",
  xls: "grid",
  xlsx: "grid",
  xlsm: "grid",
  xlsb: "grid",
  xlt: "grid",
  xltx: "grid",
  ods: "grid",
  fods: "grid",
  et: "grid",
  numbers: "grid",
  ppt: "deck",
  pptx: "deck",
  pptm: "deck",
  pot: "deck",
  potx: "deck",
  potm: "deck",
  odp: "deck",
  fodp: "deck",
  dps: "deck",
  key: "deck",
  pages: "richdoc",
  pdf: "pdf",
};

const DOC_FAMILY_EDITOR_NAMES: Readonly<Record<DocFamilyEditorId, string>> = {
  richdoc: "文档编辑器",
  grid: "表格编辑器",
  deck: "演示编辑器",
  pdf: "PDF 编辑器",
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
  const owner = DOC_FAMILY_EXTENSION_OWNER[extension];
  if (owner && owner !== editorId) {
    return `.${extension} 是${DOC_FAMILY_EDITOR_NAMES[owner]}的文件，这里打不开；请在${
      DOC_FAMILY_EDITOR_NAMES[owner]
    }里打开它，或先转成${docFamilyPreferredFormatsText(editorId)}再上传。`;
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
