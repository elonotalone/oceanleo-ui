"use client";

/**
 * PDF 的 agent 指令面（D4 之后的新能力）：跳页、查找、加高亮、加文字、打勾、
 * 旋转页、删页、下载、保存。旧的拆页 / 加空白页 / 合并已随旧编辑面删除。
 *
 * 规则同文档家族（`doc-editors/doc-family-commands.ts` 头注）：`run()` 只认
 * `describe()` 此刻列出的 id；参数越界一律拒绝并说清原因；`state()` 有界。
 */
import type {
  PluginAgentContext,
  PluginCommandResult,
  PluginCommandSpec,
  PluginCommandSurfaceInput,
} from "../plugin-command/types";
import { boundedCommandState, readCommandParams } from "../doc-editors/doc-family-commands";
import { pluginTargetForLibraryItem } from "../active-agent-file";
import type { LibraryItem } from "../library-data";
import { PDF_SUBTYPE, type PdfViewerBridge } from "./pdf-viewer-bridge";
import { pdfMarkAnnotation } from "./pdf-mark-tools";

export interface PdfCommandEditor {
  bridge: PdfViewerBridge | null;
  loading: boolean;
  processing: boolean;
  pageCount: number;
  currentPage: number;
  zoom: number;
  dirty: boolean;
  editRevision: number;
  error: string;
  rotatePage: (pageIndex: number, clockwise?: boolean) => Promise<boolean>;
  deletePage: (pageIndex: number) => Promise<boolean>;
}

export interface PdfCommandDeps {
  download: () => Promise<string>;
  save: () => Promise<PluginCommandResult>;
  item?: LibraryItem;
  /** 页面文字（已读到的才有），供 agent 读内容。 */
  pageText?: () => { pageNumber: number; text: string }[] | null;
}

const pageParam = (required: boolean) => ({
  key: "page",
  label: "第几页",
  type: "number" as const,
  required,
  hint: required ? "从 1 开始。" : "不给就是当前页。",
});

export const PDF_COMMAND_SPECS: readonly PluginCommandSpec[] = [
  {
    id: "pdf.go-to-page",
    label: "跳到某一页",
    summary: "只翻页，不改内容。",
    mutates: false,
    params: [pageParam(true)],
  },
  {
    id: "pdf.find-text",
    label: "全文查一个词",
    summary: "只读：在全文里找一个词，报出在第几页。",
    mutates: false,
    params: [{ key: "query", label: "要找的词", type: "string", required: true }],
  },
  {
    id: "pdf.add-highlight",
    label: "高亮一段文字",
    summary: "在全文里找到这段文字，给每一处加上高亮批注。",
    mutates: true,
    params: [
      { key: "text", label: "要高亮的文字", type: "string", required: true },
      { key: "color", label: "颜色", type: "string", hint: "#RRGGBB，不给就是黄色。" },
    ],
  },
  {
    id: "pdf.add-text",
    label: "在页面上加文字",
    summary: "在指定页的指定位置加一段文字（用来填表）。",
    mutates: true,
    params: [
      pageParam(false),
      { key: "text", label: "文字", type: "string", required: true },
      { key: "x", label: "左边距（点）", type: "number", hint: "从页面左上角量，不给就放在页面左上方。" },
      { key: "y", label: "上边距（点）", type: "number" },
    ],
  },
  {
    id: "pdf.add-check",
    label: "打勾",
    summary: "在指定页的指定位置放一个 ✓（标准批注）。",
    mutates: true,
    params: [
      pageParam(false),
      { key: "x", label: "左边距（点）", type: "number", required: true },
      { key: "y", label: "上边距（点）", type: "number", required: true },
    ],
  },
  {
    id: "pdf.rotate-page",
    label: "旋转一页",
    summary: "把一页顺时针或逆时针转 90 度，写进文件。",
    mutates: true,
    params: [
      pageParam(false),
      {
        key: "direction",
        label: "方向",
        type: "enum",
        enumValues: [
          { value: "cw", label: "顺时针" },
          { value: "ccw", label: "逆时针" },
        ],
        hint: "不给就顺时针。",
      },
    ],
  },
  {
    id: "pdf.delete-page",
    label: "删掉一页",
    summary: "删除指定的一页（至少保留一页）。",
    mutates: true,
    params: [pageParam(false)],
  },
  {
    id: "pdf.export",
    label: "下载 PDF",
    summary: "只读：把当前 PDF（含批注）下载下来。",
    mutates: false,
  },
  {
    id: "pdf.save",
    label: "保存",
    summary: "把当前改动存成这份 PDF 的新版本。",
    mutates: true,
  },
];

function refuse(message: string): PluginCommandResult {
  return { ok: false, message };
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() || `pdf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildPdfCommandSurface(
  editor: PdfCommandEditor,
  deps: PdfCommandDeps,
): PluginCommandSurfaceInput {
  const bridge = editor.bridge;
  const ready = Boolean(bridge) && !editor.loading && !editor.processing && editor.pageCount > 0;
  const pageOf = (value: unknown): number | string => {
    if (value === undefined || value === null || value === "") return editor.currentPage;
    const page = Number(value);
    if (!Number.isInteger(page)) return "页码要是整数。";
    if (page < 1 || page > editor.pageCount) {
      return `这份 PDF 只有 ${editor.pageCount} 页，第 ${page} 页不存在。`;
    }
    return page;
  };
  type Handler = (values: Record<string, unknown>) => Promise<PluginCommandResult> | PluginCommandResult;
  const handlers: Record<string, Handler> = {};
  if (ready && bridge) {
    handlers["pdf.go-to-page"] = (values) => {
      const page = pageOf(values.page);
      if (typeof page === "string") return refuse(page);
      bridge.goToPage(page);
      return { ok: true, message: `已跳到第 ${page} 页。` };
    };
    handlers["pdf.find-text"] = async (values) => {
      const hits = await bridge.searchHits(String(values.query));
      if (!hits.length) return { ok: false, message: `全文里没有找到「${String(values.query).slice(0, 30)}」。` };
      const pages = [...new Set(hits.map((hit) => hit.pageIndex + 1))];
      bridge.revealHit(hits[0]);
      return { ok: true, message: `找到 ${hits.length} 处，在第 ${pages.slice(0, 20).join("、")} 页。` };
    };
    handlers["pdf.add-highlight"] = async (values) => {
      const color = /^#[0-9a-f]{6}$/i.test(String(values.color || "")) ? String(values.color) : "#FFCD45";
      const hits = await bridge.searchHits(String(values.text));
      if (!hits.length) return refuse(`全文里没有找到「${String(values.text).slice(0, 30)}」，没有加高亮。`);
      for (const hit of hits.slice(0, 50)) {
        const xs = hit.rects.flatMap((r) => [r.origin.x, r.origin.x + r.size.width]);
        const ys = hit.rects.flatMap((r) => [r.origin.y, r.origin.y + r.size.height]);
        bridge.createAnnotation(hit.pageIndex, {
          id: newId(),
          type: PDF_SUBTYPE.HIGHLIGHT,
          pageIndex: hit.pageIndex,
          rect: {
            origin: { x: Math.min(...xs), y: Math.min(...ys) },
            size: { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
          },
          segmentRects: hit.rects,
          strokeColor: color,
          color,
          opacity: 1,
          blendMode: 1,
          flags: ["print"],
          created: new Date(),
        });
      }
      return { ok: true, message: `已高亮 ${Math.min(hits.length, 50)} 处。` };
    };
    handlers["pdf.add-text"] = (values) => {
      const page = pageOf(values.page);
      if (typeof page === "string") return refuse(page);
      const text = String(values.text || "").trim();
      if (!text) return refuse("文字不能为空。");
      const size = bridge.pages()[page - 1]?.size;
      const x = Number.isFinite(Number(values.x)) ? Number(values.x) : 48;
      const y = Number.isFinite(Number(values.y)) ? Number(values.y) : 48;
      if (size && (x < 0 || y < 0 || x > size.width || y > size.height)) {
        return refuse(`位置超出了页面（宽 ${Math.round(size.width)}、高 ${Math.round(size.height)} 点）。`);
      }
      const width = Math.min(Math.max(80, text.length * 8), (size?.width ?? 600) - x);
      bridge.createAnnotation(page - 1, {
        id: newId(),
        type: PDF_SUBTYPE.FREETEXT,
        pageIndex: page - 1,
        rect: { origin: { x, y }, size: { width, height: 22 } },
        contents: text,
        fontFamily: 4,
        fontSize: 14,
        fontColor: "#000000",
        textAlign: 0,
        verticalAlign: 0,
        opacity: 1,
        flags: ["print"],
        created: new Date(),
      });
      return { ok: true, message: `已在第 ${page} 页加上文字。` };
    };
    handlers["pdf.add-check"] = (values) => {
      const page = pageOf(values.page);
      if (typeof page === "string") return refuse(page);
      const size = bridge.pages()[page - 1]?.size;
      const x = Number(values.x);
      const y = Number(values.y);
      if (!size || x < 0 || y < 0 || x > size.width || y > size.height) {
        return refuse("位置超出了页面。");
      }
      bridge.createAnnotation(page - 1, pdfMarkAnnotation("check", page - 1, { x, y }, { pageSize: size }));
      return { ok: true, message: `已在第 ${page} 页打勾。` };
    };
    handlers["pdf.rotate-page"] = async (values) => {
      const page = pageOf(values.page);
      if (typeof page === "string") return refuse(page);
      const clockwise = values.direction !== "ccw";
      const ok = await editor.rotatePage(page - 1, clockwise);
      return ok
        ? { ok: true, message: `第 ${page} 页已${clockwise ? "顺" : "逆"}时针转 90 度。` }
        : refuse(editor.error || "页面没有转成功。");
    };
    handlers["pdf.delete-page"] = async (values) => {
      const page = pageOf(values.page);
      if (typeof page === "string") return refuse(page);
      if (editor.pageCount <= 1) return refuse("只剩一页了，删掉就没有内容了。");
      const ok = await editor.deletePage(page - 1);
      return ok ? { ok: true, message: `已删掉第 ${page} 页。` } : refuse(editor.error || "没有删成功。");
    };
    handlers["pdf.save"] = () => deps.save();
  }
  handlers["pdf.export"] = async () => {
    const failure = await deps.download();
    return failure ? refuse(failure) : { ok: true, message: "已下载 PDF。" };
  };
  const describe = () => PDF_COMMAND_SPECS.filter((spec) => Boolean(handlers[spec.id]));
  return {
    editorId: "pdf",
    describe,
    state: () =>
      boundedCommandState({
        page: editor.currentPage,
        pageCount: editor.pageCount,
        zoom: editor.zoom,
        annotationCount: bridge?.annotationCount() ?? 0,
        loading: editor.loading,
        processing: editor.processing,
        dirty: editor.dirty,
        error: String(editor.error || "").slice(0, 120),
      }),
    agentContext: (): PluginAgentContext => {
      const pages = deps.pageText?.();
      if (!ready || !pages) return { ready: false, reason: "PDF 文字还没读出来。" };
      const text = pages.map((page) => `【第 ${page.pageNumber} 页】\n${page.text}`).join("\n\n");
      if (!text.trim()) {
        return { ready: false, reason: "这是一份扫描 / 图片型 PDF，没有文字层，不能声称读到了页面文字。" };
      }
      return {
        ready: true,
        kind: "text",
        content: { pageCount: editor.pageCount, currentPage: editor.currentPage, text: text.slice(0, 60_000) },
        truncated: text.length > 60_000,
      };
    },
    ...(deps.item ? { target: () => pluginTargetForLibraryItem(deps.item!, "pdf", editor.editRevision) } : {}),
    run: async (id, params) => {
      const available = describe();
      const spec = available.find((entry) => entry.id === id);
      if (!spec) {
        return refuse(
          `这个编辑器现在没有「${id}」这条指令；可用的是：${available.map((entry) => entry.id).join("、") || "（暂时没有）"}。`,
        );
      }
      const parsed = readCommandParams(spec, params);
      if (!("values" in parsed)) return parsed;
      try {
        const result = await handlers[spec.id](parsed.values as Record<string, unknown>);
        return result.revision === undefined ? { ...result, revision: editor.editRevision } : result;
      } catch (caught) {
        return refuse(
          caught instanceof Error && caught.message
            ? `「${spec.label}」没有执行成功：${caught.message}`
            : `「${spec.label}」没有执行成功。`,
        );
      }
    },
  };
}
