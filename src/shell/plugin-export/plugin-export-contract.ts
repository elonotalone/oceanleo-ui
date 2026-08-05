/**
 * 应用内功能件的导出契约 —— `oceanleo.plugin-export.v1`
 *
 * 口径出处：`docs/work-logs/2026-08/oceanleo-plugin-material-split/tasks/_COMMON.md`
 * §3.1（素材 = 可下载的成品；功能件 = 不可下载的软件）与 §3.3（导出）。
 * 四条规范逐条落成本文件里的类型与判据：
 *
 *   1. 谁能导出：两类功能件都能导出（`PluginSurfaceKind` 的两个取值都合法）。
 *   2. 导出什么：当前的用户数据 + 一个形态选择（`PluginExportForm`）。
 *      形态是一个闭集，取值与 W10 清册的 `exportKinds` 逐字一致：
 *      xlsx / csv / pdf / long-image / html / docx / srt / vtt
 *      （`scripts/data/oceanleo-plugin-registry.json`，派生视图的 `plugins` 目录）。
 *      逐工具支持哪几种，也由清册说了算，见 `export-catalog.ts`。
 *   3. 产物是什么：一件素材，进「我的库」，可下载。每种形态都必须映射到
 *      13 类可下载载体之一（`MATERIAL_ARTIFACT_TYPES`）。
 *   4. 软件本身：永不出现在库里、永不可下载。这条不是注释，是
 *      `libraryEntryIsDownloadableMaterial()` 这个机检，`MyLibrary.tsx`
 *      在组装 entries 前逐条过一遍。
 *
 * 载体分类出处：`_COMMON.md` §4.1 十三类载体、§4.2/§4.3 两类功能件。
 * `geo_map` 与 `interactive_doc` 是两个运行时内核的工程态，不在十三类载体里
 * （`workbench-capability-registry.ts:96-223` 的 15 个适配器减去这两个 = 13 个
 * 编辑类），所以它们永远不是可下载成品。
 */

import type { ArtifactType } from "../artifact-contract";
import { isDurableLibraryItem, type LibraryItem } from "../library-data";
import { PLUGIN_EXPORT_CATALOG } from "./export-catalog";

export const PLUGIN_EXPORT_SCHEMA = "oceanleo.plugin-export.v1";

/** 两类功能件都可以导出（§3.2 的表格两列）。 */
export type PluginSurfaceKind = "editor" | "standalone";

/** 形态闭集。取值与 W10 清册 `exportKinds` 一致，不许各自造词。 */
export type PluginExportFormId =
  | "xlsx"
  | "csv"
  | "pdf"
  | "long-image"
  | "html"
  | "docx"
  | "srt"
  | "vtt";

export interface PluginExportForm {
  id: PluginExportFormId;
  /** 面向用户的形态名。 */
  label: string;
  /** 产物落成哪一类载体素材。 */
  artifactType: ArtifactType;
  mediaType: string;
  extension: string;
  sourceFormat: string;
  /**
   * 本波能不能真的渲出字节。`false` 的形态由 `renderPluginExport()` 明确拒绝，
   * 不许退化成空文件或乱码文件蒙混过关。
   */
  renderable: boolean;
  /** `renderable: false` 时必须给出为什么，以及缺什么才能补齐。 */
  unavailableReason: string;
}

export const PLUGIN_EXPORT_FORMS: readonly PluginExportForm[] = [
  {
    id: "xlsx",
    label: "Excel 表格",
    artifactType: "grid",
    mediaType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    sourceFormat: "xlsx",
    renderable: true,
    unavailableReason: "",
  },
  {
    id: "csv",
    label: "CSV 表格",
    // §4.2：表格编辑器编辑的就是用户上传的 xlsx/csv，两者同属一类载体。
    artifactType: "grid",
    mediaType: "text/csv",
    extension: "csv",
    sourceFormat: "csv",
    renderable: true,
    unavailableReason: "",
  },
  {
    id: "html",
    label: "网页",
    artifactType: "website",
    mediaType: "text/html",
    extension: "html",
    sourceFormat: "html",
    renderable: true,
    unavailableReason: "",
  },
  {
    id: "long-image",
    label: "图文长图",
    artifactType: "vector_image",
    mediaType: "image/svg+xml",
    extension: "svg",
    sourceFormat: "svg",
    renderable: true,
    unavailableReason: "",
  },
  {
    id: "docx",
    label: "Word 文档",
    artifactType: "document",
    mediaType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
    sourceFormat: "docx",
    renderable: true,
    unavailableReason: "",
  },
  {
    id: "pdf",
    label: "PDF",
    artifactType: "pdf",
    mediaType: "application/pdf",
    extension: "pdf",
    sourceFormat: "pdf",
    renderable: false,
    // 手写 PDF 只能用 WinAnsi 的十四款标准字体，中文一律渲成空白方块。
    // 交一份看不见中文的 PDF 比不交更糟，所以这一档明确拒绝；补齐条件
    // （一份可嵌入的中文字形子集）写在 signals/W15-request.md。
    // docx 与网页没有这个问题：字形由 Word 与浏览器自己选。
    unavailableReason:
      "PDF 形态还不能导出：缺少可嵌入的中文字形，现在生成的 PDF 会把中文渲成空白。",
  },
  {
    id: "srt",
    label: "SRT 字幕",
    artifactType: "document",
    mediaType: "application/x-subrip",
    extension: "srt",
    sourceFormat: "srt",
    renderable: false,
    // 字幕要的是时间轴（起止时间 + 台词），本文件的通用载荷只有列与行，
    // 没有时间轴；十三类载体里也没有字幕这一类，落哪个载体要先裁定。
    unavailableReason:
      "字幕形态还不能导出：口播脚本的时间轴还没有落盘，字幕文件归哪一类载体也未裁定。",
  },
  {
    id: "vtt",
    label: "WebVTT 字幕",
    artifactType: "document",
    mediaType: "text/vtt",
    extension: "vtt",
    sourceFormat: "vtt",
    renderable: false,
    unavailableReason:
      "字幕形态还不能导出：口播脚本的时间轴还没有落盘，字幕文件归哪一类载体也未裁定。",
  },
];

const FORM_BY_ID = new Map<PluginExportFormId, PluginExportForm>(
  PLUGIN_EXPORT_FORMS.map((form) => [form.id, form]),
);

export function pluginExportForm(
  id: PluginExportFormId,
): PluginExportForm | null {
  return FORM_BY_ID.get(id) || null;
}

/**
 * 这个工具允许导出哪几种形态。清册里没有的工具返回空数组——不是「随便导」，
 * 而是「还没决定」，`normalizePluginExportRequest()` 会据此拒绝。
 */
export function exportKindsForPlugin(
  pluginId: string,
): readonly PluginExportFormId[] {
  return PLUGIN_EXPORT_CATALOG[pluginId]?.exportKinds || [];
}

export function pluginSupportsForm(
  pluginId: string,
  form: PluginExportFormId,
): boolean {
  return exportKindsForPlugin(pluginId).includes(form);
}

/** 清册里已经可以真的导出的形态（去掉本波还渲不出字节的那几种）。 */
export function renderableExportKindsForPlugin(
  pluginId: string,
): readonly PluginExportFormId[] {
  return exportKindsForPlugin(pluginId).filter(
    (id) => pluginExportForm(id)?.renderable === true,
  );
}

/* -------------------------------------------------------------------------- *
 * 素材 / 软件的边界
 * -------------------------------------------------------------------------- */

/**
 * 两个运行时内核的工程态。用户在应用里打开它们来用，它们不是成品，
 * 没有份数、没有下载物（§3.1）。
 */
export const RUNTIME_STATE_ARTIFACT_TYPES: readonly ArtifactType[] = [
  "geo_map",
  "interactive_doc",
];

/** §4.1 的十三类载体，也就是「可下载的成品」的全集。 */
export const MATERIAL_ARTIFACT_TYPES: readonly ArtifactType[] = [
  "single_file_image",
  "vector_image",
  "video",
  "audio",
  "model_3d",
  "document",
  "deck",
  "composite_image",
  "pdf",
  "chart",
  "workflow",
  "website",
  "game",
  // 用户上传的 xlsx/csv 本身就是成品表格；台账的导出物也落在这一类。
  "grid",
];

const MATERIAL_TYPE_SET = new Set<string>(MATERIAL_ARTIFACT_TYPES);
const RUNTIME_TYPE_SET = new Set<string>(RUNTIME_STATE_ARTIFACT_TYPES);

export function isMaterialArtifactType(value: unknown): boolean {
  return MATERIAL_TYPE_SET.has(String(value || ""));
}

/**
 * 条目声称自己是「应用里打开来用的那个东西」而不是成品的全部信号。
 * 命中任意一条即不进库、不可下载。
 */
export function libraryEntryIsRuntimeSurface(item: LibraryItem): boolean {
  const meta = (item.meta || {}) as Record<string, unknown>;
  if (meta.oceanleo_surface === "runtime") return true;
  if (meta.library_source === "runtime") return true;
  if (meta.downloadable === false) return true;
  const type = item.artifactType || item.artifact?.artifactType;
  return RUNTIME_TYPE_SET.has(String(type || ""));
}

/**
 * 「我的库」的准入判据：只有可下载的成品能进。
 *
 * 这是 §3.3「库里显示的永远只有可下载的产物」的机检面。`MyLibrary.tsx`
 * 在 dedupe 的同一处调用它，所以运行时工程态既进不了列表，也拿不到
 * 卡片上的下载入口——下载入口是从列表条目上长出来的。
 */
export function libraryEntryIsDownloadableMaterial(
  item: LibraryItem,
): boolean {
  if (!isDurableLibraryItem(item)) return false;
  if (libraryEntryIsRuntimeSurface(item)) return false;
  return isMaterialArtifactType(
    item.artifactType || item.artifact.artifactType,
  );
}

/* -------------------------------------------------------------------------- *
 * 导出请求
 * -------------------------------------------------------------------------- */

export interface PluginExportColumn {
  key: string;
  label: string;
  type?: "text" | "number" | "currency" | "date";
}

export type PluginExportCell = string | number | null;

export interface PluginExportTotal {
  label: string;
  value: string | number;
}

/**
 * 导出载荷。刻意是「一张带列定义的记录表 + 若干合计 + 若干说明」这种
 * 与具体功能件无关的形状：台账、文献矩阵、自测卷的作答记录都能塞进来，
 * 各形态的渲染器只认这一种输入。字幕那两种形态之所以还渲不出来，
 * 正是因为它们要的时间轴不在这个形状里。
 */
export interface PluginExportData {
  columns: readonly PluginExportColumn[];
  rows: readonly (readonly PluginExportCell[])[];
  totals?: readonly PluginExportTotal[];
  notes?: readonly string[];
}

export interface PluginExportRequest {
  /** 内部标识（L3 族 id），不面向用户。 */
  sourceId: string;
  /** 面向用户的中文名，例如「台账」。 */
  sourceLabel: string;
  sourceKind: PluginSurfaceKind;
  form: PluginExportFormId;
  title: string;
  siteId: string;
  appId?: string;
  data: PluginExportData;
  /** 决定幂等键与文件名，缺省由运行时补当前时间。 */
  exportedAt?: string;
}

export interface NormalizedPluginExportRequest
  extends Omit<PluginExportRequest, "form"> {
  form: PluginExportForm;
  exportedAt: string;
}

export type PluginExportRejection = {
  ok: false;
  code:
    | "unknown-form"
    | "form-not-declared"
    | "form-not-renderable"
    | "empty-payload"
    | "invalid-request"
    | "not-a-material";
  error: string;
};

export function normalizePluginExportRequest(
  request: PluginExportRequest,
):
  | { ok: true; request: NormalizedPluginExportRequest }
  | PluginExportRejection {
  const form = pluginExportForm(request.form);
  if (!form) {
    return {
      ok: false,
      code: "unknown-form",
      error: `不认识的导出形态：${String(request.form)}。`,
    };
  }
  if (!isMaterialArtifactType(form.artifactType)) {
    // 形态表写错了才会走到这里：导出物必须是十三类载体之一，否则这条链
    // 就在往库里塞一个不可下载的东西。
    return {
      ok: false,
      code: "not-a-material",
      error: `${form.label}没有映射到可下载的成品载体，已拒绝导出。`,
    };
  }
  const title = String(request.title || "").trim();
  const sourceId = String(request.sourceId || "").trim();
  // 逐工具的形态清单由清册说了算：台账导 srt、换算器导 docx 都是越界，
  // 在这里拒掉，而不是渲出一份没人认领的文件。
  const declared = exportKindsForPlugin(sourceId);
  if (declared.length && !declared.includes(form.id)) {
    return {
      ok: false,
      code: "form-not-declared",
      error: `${PLUGIN_EXPORT_CATALOG[sourceId]?.label || sourceId}没有声明${
        form.label
      }这种导出形态。`,
    };
  }
  if (!form.renderable) {
    return {
      ok: false,
      code: "form-not-renderable",
      error: form.unavailableReason,
    };
  }
  const sourceLabel = String(request.sourceLabel || "").trim();
  if (!title || !sourceId || !sourceLabel) {
    return {
      ok: false,
      code: "invalid-request",
      error: "导出请求缺少标题或来源标识，已拒绝生成无主的产物。",
    };
  }
  if (
    request.sourceKind !== "editor" &&
    request.sourceKind !== "standalone"
  ) {
    return {
      ok: false,
      code: "invalid-request",
      error: "导出请求没有声明来源类别。",
    };
  }
  const columns = request.data?.columns || [];
  const rows = request.data?.rows || [];
  if (!columns.length || !rows.length) {
    return {
      ok: false,
      code: "empty-payload",
      error: "当前还没有可导出的数据，先记录一条再导出。",
    };
  }
  return {
    ok: true,
    request: {
      ...request,
      title,
      sourceId,
      sourceLabel,
      siteId: String(request.siteId || "").trim(),
      form,
      exportedAt: String(request.exportedAt || "").trim() ||
        new Date().toISOString(),
    },
  };
}

/** 产物在库里的显示标题：带上形态，用户一眼看出这是哪一份导出。 */
export function pluginExportTitle(
  request: NormalizedPluginExportRequest,
): string {
  return `${request.title}（${request.form.label}）`;
}

export function pluginExportFilename(
  request: NormalizedPluginExportRequest,
): string {
  const safe = request.title
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${safe || "export"}.${request.form.extension}`;
}

/**
 * 产物的来源证据。库表与 revision 表都没有「这件素材是谁导出的」这一列
 * （`_COMMON.md` §5.2 已核实），所以来源全部写进 ensure 的 `provenance`
 * 自由字段，加上标题里的形态后缀，本波先这样表达；需要独立列的结论写在
 * `signals/W15-request.md`。
 */
export function pluginExportProvenance(
  request: NormalizedPluginExportRequest,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    source_kind: "app_surface_export",
    export_schema: PLUGIN_EXPORT_SCHEMA,
    export_form: request.form.id,
    export_media_type: request.form.mediaType,
    export_source_id: request.sourceId,
    export_source_label: request.sourceLabel,
    export_source_kind: request.sourceKind,
    exported_at: request.exportedAt,
    app_id: request.appId || "",
    rights_attested: true,
    ...extra,
  };
}
