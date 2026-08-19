"use client";

/**
 * 文档家族四条路由的**指令面**（合同 §3.1）。
 *
 * 这是文档 / 表格 / 演示 / PDF 第一次对外说清「我现在能做什么」：左栏的 agent 读
 * `describe()` 拿到当前可用的指令，读 `state()` 拿一份有界摘要，再用 `run()` 下一条指令。
 *
 * 三条纪律，写在这里而不是散在四条路由里：
 *   1. `run()` 只接受 `describe()` 此刻真的列出来的 id，越界 id、越界参数、超长参数
 *      一律 `{ ok:false }` 并说清为什么，不许静默兜底；
 *   2. 会改内容的指令 `mutates: true`，**确认框不在这里弹**（由 agent 侧负责）；
 *   3. `state()` 是有界摘要，序列化后不超过 4096 字节。
 *
 * 构造器全部是纯函数（拿到编辑器状态，返回一个指令面对象），所以能在 `node --test`
 * 里直接断言，不用起 React。
 */

import type { Editor } from "@tiptap/core";
import type {
  PluginCommandParam,
  PluginCommandResult,
  PluginCommandSpec,
  PluginCommandSurfaceInput,
} from "../plugin-command/types";
import { PLUGIN_COMMAND_PARAM_MAX_BYTES } from "../plugin-command/types";
import type { PdfWorkbenchState } from "../media-editors/pdf-workbench-state";
import { DECK_IR_LAYOUTS } from "./deck-layout-grid";
import type { DeckEditorState } from "./use-deck-editor";
import type { GridEditorState } from "./use-grid-editor";
import type { RichDocEditorState } from "./use-rich-doc-editor";
import {
  DOC_FAMILY_DOWNLOAD_FORMATS,
  type DocFamilyEditorId,
} from "./doc-family-formats";

/** `state()` 序列化后的字节上限（合同 §3.1）。 */
export const DOC_FAMILY_STATE_MAX_BYTES = 4096;

export interface DocFamilyCommandDeps {
  /**
   * 按后缀下载一份（`DOC_FAMILY_DOWNLOAD_FORMATS` 里的 `extension`）。
   * 返回空串表示成功，返回非空就是要显示给用户的那句原因。
   */
  download: (extension: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// 参数校验与有界摘要（四条路由共用）
// ---------------------------------------------------------------------------

function byteLength(value: string): number {
  try {
    return new TextEncoder().encode(value).length;
  } catch {
    return value.length * 3;
  }
}

function refuse(message: string): PluginCommandResult {
  return { ok: false, message };
}

type ParamValue = string | number | boolean;

interface ParsedParams {
  ok: true;
  values: Record<string, ParamValue>;
}

/**
 * 按 `spec.params` 逐条校验。任何一条不合规就拒，并说清是哪一条、为什么。
 * 没在 `params` 里声明的键一律视为越界。
 */
export function readCommandParams(
  spec: PluginCommandSpec,
  params?: Record<string, unknown>,
): ParsedParams | PluginCommandResult {
  const declared = spec.params || [];
  const incoming = params && typeof params === "object" ? params : {};
  const allowed = new Set(declared.map((entry) => entry.key));
  for (const key of Object.keys(incoming)) {
    if (!allowed.has(key)) {
      return refuse(
        `「${spec.label}」不接受参数 ${key}；可用的参数是${
          declared.length
            ? declared.map((entry) => entry.key).join("、")
            : "（这条指令不需要参数）"
        }。`,
      );
    }
  }
  const values: Record<string, ParamValue> = {};
  for (const param of declared) {
    const raw = incoming[param.key];
    const missing = raw === undefined || raw === null || raw === "";
    if (missing) {
      if (param.required) {
        return refuse(`「${spec.label}」缺少必填参数：${param.label}。`);
      }
      continue;
    }
    const parsed = parseParam(param, raw);
    if (typeof parsed === "string") return refuse(parsed);
    values[param.key] = parsed.value;
  }
  return { ok: true, values };
}

function parseParam(
  param: PluginCommandParam,
  raw: unknown,
): { value: ParamValue } | string {
  if (param.type === "number") {
    const value = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isFinite(value)) {
      return `参数 ${param.label} 要一个数字，收到的是「${String(raw).slice(0, 40)}」。`;
    }
    return { value };
  }
  if (param.type === "boolean") {
    if (typeof raw === "boolean") return { value: raw };
    const text = String(raw).trim().toLowerCase();
    if (text === "true" || text === "1" || text === "是") return { value: true };
    if (text === "false" || text === "0" || text === "否") return { value: false };
    return `参数 ${param.label} 要是或否，收到的是「${String(raw).slice(0, 40)}」。`;
  }
  const text = typeof raw === "string" ? raw : String(raw);
  if (byteLength(text) > PLUGIN_COMMAND_PARAM_MAX_BYTES) {
    return `参数 ${param.label} 太长了（上限 ${PLUGIN_COMMAND_PARAM_MAX_BYTES} 字节），这次没有执行。`;
  }
  if (param.type === "enum") {
    const choices = param.enumValues || [];
    if (!choices.some((choice) => choice.value === text)) {
      return `参数 ${param.label} 只能是：${choices
        .map((choice) => `${choice.value}（${choice.label}）`)
        .join("、")}。`;
    }
  }
  return { value: text };
}

/** 有界摘要：超过 4096 字节就逐个丢掉最长的字段，并留一句说明。 */
export function boundedCommandState(
  state: Record<string, unknown>,
): Record<string, unknown> {
  let current: Record<string, unknown> = { ...state };
  const serialized = () => {
    try {
      return JSON.stringify(current) || "{}";
    } catch {
      return "{}";
    }
  };
  if (byteLength(serialized()) <= DOC_FAMILY_STATE_MAX_BYTES) return current;
  const dropped: string[] = [];
  const byCost = Object.keys(current).sort(
    (left, right) =>
      byteLength(JSON.stringify(current[right] ?? null)) -
      byteLength(JSON.stringify(current[left] ?? null)),
  );
  for (const key of byCost) {
    if (byteLength(serialized()) <= DOC_FAMILY_STATE_MAX_BYTES) break;
    const { [key]: _removed, ...rest } = current;
    current = rest;
    dropped.push(key);
  }
  if (dropped.length) {
    current.omitted = `摘要超过 ${DOC_FAMILY_STATE_MAX_BYTES} 字节，已省略：${dropped.join(
      "、",
    )}`;
  }
  return current;
}

function clip(value: string, max = 120): string {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * 把一张 spec 表 + 一张实现表装成指令面。
 * `describe()` 只列此刻真能跑的；`run()` 只认 `describe()` 列出来的 id。
 */
function surfaceOf(
  editorId: DocFamilyEditorId,
  specs: readonly PluginCommandSpec[],
  handlers: Record<
    string,
    (values: Record<string, ParamValue>) => Promise<PluginCommandResult> | PluginCommandResult
  >,
  readState: () => Record<string, unknown>,
  revision: () => number,
): PluginCommandSurfaceInput {
  const describe = () => specs.filter((spec) => Boolean(handlers[spec.id]));
  return {
    editorId,
    describe,
    state: () => boundedCommandState(readState()),
    run: async (id, params) => {
      const available = describe();
      const spec = available.find((entry) => entry.id === id);
      if (!spec) {
        return refuse(
          `这个编辑器现在没有「${id}」这条指令；可用的是：${
            available.map((entry) => entry.id).join("、") || "（暂时没有）"
          }。`,
        );
      }
      const parsed = readCommandParams(spec, params);
      if (!("values" in parsed)) return parsed;
      try {
        const result = await handlers[spec.id](parsed.values);
        return result.revision === undefined
          ? { ...result, revision: revision() }
          : result;
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

function downloadParam(editorId: DocFamilyEditorId): PluginCommandParam {
  return {
    key: "format",
    label: "格式",
    type: "enum",
    required: true,
    enumValues: DOC_FAMILY_DOWNLOAD_FORMATS[editorId].map((format) => ({
      value: format.extension,
      label: format.label,
    })),
  };
}

// ---------------------------------------------------------------------------
// 文档（richdoc）
// ---------------------------------------------------------------------------

const RICHDOC_SPECS: readonly PluginCommandSpec[] = [
  {
    id: "richdoc.insert-heading",
    label: "在文末插入标题",
    summary: "在文档末尾加一行标题，层级由参数决定。",
    mutates: true,
    params: [
      { key: "text", label: "标题文字", type: "string", required: true },
      {
        key: "level",
        label: "标题层级",
        type: "enum",
        enumValues: [
          { value: "1", label: "一级标题" },
          { value: "2", label: "二级标题" },
          { value: "3", label: "三级标题" },
        ],
        hint: "不给就用二级标题。",
      },
    ],
  },
  {
    id: "richdoc.insert-paragraph",
    label: "在文末插入段落",
    summary: "在文档末尾加一段正文。",
    mutates: true,
    params: [{ key: "text", label: "段落文字", type: "string", required: true }],
  },
  {
    id: "richdoc.replace-all",
    label: "全文替换某个词",
    summary: "把全文里出现的某个词全部换成另一个词，会改文档内容。",
    mutates: true,
    params: [
      { key: "from", label: "要被替换的词", type: "string", required: true },
      { key: "to", label: "替换成", type: "string", required: true },
    ],
  },
  {
    id: "richdoc.set-heading-level",
    label: "改当前段落的标题层级",
    summary: "把光标所在段落改成某一级标题，或改回正文。",
    mutates: true,
    params: [
      {
        key: "level",
        label: "层级",
        type: "enum",
        required: true,
        enumValues: [
          { value: "0", label: "正文" },
          { value: "1", label: "一级标题" },
          { value: "2", label: "二级标题" },
          { value: "3", label: "三级标题" },
        ],
      },
    ],
  },
  {
    id: "richdoc.set-font-size",
    label: "改选中文字的字号",
    summary: "把当前选中的文字换成指定字号（磅值）。",
    mutates: true,
    params: [
      {
        key: "size",
        label: "字号",
        type: "number",
        required: true,
        hint: "8–96 之间的磅值。",
      },
    ],
  },
  {
    id: "richdoc.read-outline",
    label: "读文档大纲",
    summary: "只读：列出文档里的标题，不改任何内容。",
    mutates: false,
  },
  {
    id: "richdoc.export",
    label: "导出成某个格式",
    summary: "只读：把当前文档下载成指定格式。",
    mutates: false,
    params: [downloadParam("richdoc")],
  },
  {
    id: "richdoc.save",
    label: "保存到我的库",
    summary: "把当前文档存成素材库里的新版本。",
    mutates: true,
  },
];

/** tiptap 的文末插入点。 */
function docEnd(editor: Editor): number {
  return editor.state.doc.content.size;
}

function replaceEveryOccurrence(
  editor: Editor,
  from: string,
  to: string,
): number {
  const matches: { start: number; end: number }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    let index = node.text.indexOf(from);
    while (index >= 0) {
      matches.push({ start: pos + index, end: pos + index + from.length });
      index = node.text.indexOf(from, index + from.length);
    }
  });
  if (!matches.length) return 0;
  const transaction = editor.state.tr;
  // 从后往前改，前面的位置就不会被前一次替换的长度差挪走。
  for (const match of [...matches].reverse()) {
    transaction.insertText(to, match.start, match.end);
  }
  editor.view.dispatch(transaction);
  return matches.length;
}

function richDocOutline(editor: Editor): { level: number; text: string }[] {
  const headings: { level: number; text: string }[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "heading") return;
    headings.push({
      level: Number(node.attrs.level) || 1,
      text: clip(node.textContent, 60),
    });
  });
  return headings.slice(0, 40);
}

export function buildRichDocCommandSurface(
  editor: RichDocEditorState,
  deps: DocFamilyCommandDeps,
): PluginCommandSurfaceInput {
  const instance = editor.editor;
  const ready = Boolean(instance) && !editor.loading && editor.sourceReady;
  const handlers: Record<
    string,
    (values: Record<string, ParamValue>) => Promise<PluginCommandResult> | PluginCommandResult
  > = {};
  if (ready && instance) {
    handlers["richdoc.insert-heading"] = (values) => {
      const level = Number(values.level || 2);
      const text = String(values.text);
      const ok = instance
        .chain()
        .focus()
        .insertContentAt(docEnd(instance), {
          type: "heading",
          attrs: { level },
          content: [{ type: "text", text }],
        })
        .run();
      return ok
        ? { ok: true, message: `已在文末插入 ${level} 级标题「${clip(text, 30)}」。` }
        : refuse("标题没有插进去，文档可能处于只读状态。");
    };
    handlers["richdoc.insert-paragraph"] = (values) => {
      const text = String(values.text);
      const ok = instance
        .chain()
        .focus()
        .insertContentAt(docEnd(instance), {
          type: "paragraph",
          content: [{ type: "text", text }],
        })
        .run();
      return ok
        ? { ok: true, message: `已在文末插入一段，共 ${text.length} 个字。` }
        : refuse("段落没有插进去，文档可能处于只读状态。");
    };
    handlers["richdoc.replace-all"] = (values) => {
      const from = String(values.from);
      const to = String(values.to);
      if (!from) return refuse("要被替换的词不能是空的。");
      const count = replaceEveryOccurrence(instance, from, to);
      return count
        ? { ok: true, message: `已把「${clip(from, 20)}」替换成「${clip(to, 20)}」，共 ${count} 处。` }
        : { ok: false, message: `全文里没有找到「${clip(from, 20)}」，没有改动。` };
    };
    handlers["richdoc.set-heading-level"] = (values) => {
      const level = Number(values.level);
      const ok =
        level === 0
          ? instance.chain().focus().setParagraph().run()
          : instance
              .chain()
              .focus()
              .setHeading({ level: level as 1 | 2 | 3 })
              .run();
      return ok
        ? {
            ok: true,
            message: level === 0 ? "已改回正文。" : `已改成 ${level} 级标题。`,
          }
        : refuse("这一段改不了层级，可能光标不在可编辑的段落里。");
    };
    handlers["richdoc.set-font-size"] = (values) => {
      const size = Math.round(Number(values.size));
      if (size < 8 || size > 96) {
        return refuse("字号要在 8 到 96 之间。");
      }
      const ok = instance.chain().focus().setFontSize(`${size}px`).run();
      return ok
        ? { ok: true, message: `选中的文字已改成 ${size} 号。` }
        : refuse("没有选中任何文字，字号没有改。");
    };
    handlers["richdoc.read-outline"] = () => {
      const outline = richDocOutline(instance);
      return {
        ok: true,
        message: outline.length
          ? `文档有 ${outline.length} 个标题：${outline
              .map((entry) => `${"#".repeat(entry.level)} ${entry.text}`)
              .join(" / ")}`
          : "这份文档里还没有任何标题。",
      };
    };
    handlers["richdoc.save"] = async () => {
      const saved = await editor.save();
      return saved
        ? { ok: true, message: "已保存成素材库里的新版本。" }
        : refuse(editor.error || "保存没有成功，文档还没有写进库里。");
    };
  }
  handlers["richdoc.export"] = async (values) => {
    const failure = await deps.download(String(values.format));
    return failure
      ? refuse(failure)
      : { ok: true, message: `已导出 ${String(values.format).toUpperCase()}。` };
  };
  return surfaceOf(
    "richdoc",
    RICHDOC_SPECS,
    handlers,
    () => ({
      title: clip(editor.item.title || "", 60),
      ready,
      loading: editor.loading,
      dirty: editor.dirty,
      words: editor.words,
      chars: editor.chars,
      source: editor.source,
      outline: instance ? richDocOutline(instance).slice(0, 12) : [],
      error: clip(editor.error || "", 120),
    }),
    () => editor.editRevision,
  );
}

// ---------------------------------------------------------------------------
// 表格（grid）
// ---------------------------------------------------------------------------

const GRID_SPECS: readonly PluginCommandSpec[] = [
  {
    id: "grid.set-cell",
    label: "写一个单元格",
    summary: "把某行某列的内容改成指定值，会改工作簿。",
    mutates: true,
    params: [
      { key: "row", label: "行号", type: "number", required: true, hint: "从 1 开始。" },
      { key: "column", label: "列号", type: "number", required: true, hint: "从 1 开始。" },
      { key: "value", label: "内容", type: "string", required: true },
    ],
  },
  {
    id: "grid.insert-row",
    label: "插入一行",
    summary: "在当前选中行的上面或下面插入一行空行。",
    mutates: true,
    params: [
      {
        key: "side",
        label: "插在哪边",
        type: "enum",
        enumValues: [
          { value: "before", label: "上面" },
          { value: "after", label: "下面" },
        ],
        hint: "不给就插在下面。",
      },
    ],
  },
  {
    id: "grid.insert-column",
    label: "插入一列",
    summary: "在当前选中列的左边或右边插入一列空列。",
    mutates: true,
    params: [
      {
        key: "side",
        label: "插在哪边",
        type: "enum",
        enumValues: [
          { value: "before", label: "左边" },
          { value: "after", label: "右边" },
        ],
        hint: "不给就插在右边。",
      },
    ],
  },
  {
    id: "grid.sort-column",
    label: "按某一列排序",
    summary: "按指定列升序或降序重排数据行，会改工作簿。",
    mutates: true,
    params: [
      { key: "column", label: "列号", type: "number", required: true, hint: "从 1 开始。" },
      {
        key: "direction",
        label: "顺序",
        type: "enum",
        required: true,
        enumValues: [
          { value: "asc", label: "升序" },
          { value: "desc", label: "降序" },
        ],
      },
    ],
  },
  {
    id: "grid.add-sheet",
    label: "新建工作表",
    summary: "在工作簿里加一张新表，可同时命名。",
    mutates: true,
    params: [{ key: "name", label: "表名", type: "string" }],
  },
  {
    id: "grid.read-cell",
    label: "读一个单元格",
    summary: "只读：读出某行某列现在的内容。",
    mutates: false,
    params: [
      { key: "row", label: "行号", type: "number", required: true, hint: "从 1 开始。" },
      { key: "column", label: "列号", type: "number", required: true, hint: "从 1 开始。" },
    ],
  },
  {
    id: "grid.select-cell",
    label: "选中一个单元格",
    summary: "只挪动选中位置，不改内容。",
    mutates: false,
    params: [
      { key: "row", label: "行号", type: "number", required: true, hint: "从 1 开始。" },
      { key: "column", label: "列号", type: "number", required: true, hint: "从 1 开始。" },
    ],
  },
  {
    id: "grid.export",
    label: "导出成某个格式",
    summary: "只读：把当前工作簿下载成指定格式。",
    mutates: false,
    params: [downloadParam("grid")],
  },
  {
    id: "grid.save",
    label: "保存到我的库",
    summary: "把当前工作簿存成素材库里的新版本。",
    mutates: true,
  },
];

function gridBounds(editor: GridEditorState): { rows: number; columns: number } {
  const rows = editor.activeSheet?.rows || [];
  return {
    rows: rows.length,
    columns: rows.reduce((widest, row) => Math.max(widest, row.length), 0),
  };
}

export function buildGridCommandSurface(
  editor: GridEditorState,
  deps: DocFamilyCommandDeps,
): PluginCommandSurfaceInput {
  const ready = !editor.loading;
  const bounds = gridBounds(editor);
  const inBounds = (row: number, column: number): string => {
    if (!Number.isInteger(row) || !Number.isInteger(column)) {
      return "行号和列号要是整数。";
    }
    if (row < 1 || column < 1) return "行号和列号都从 1 开始。";
    if (row > bounds.rows) {
      return `这张表只有 ${bounds.rows} 行，第 ${row} 行不存在。`;
    }
    if (column > bounds.columns) {
      return `这张表只有 ${bounds.columns} 列，第 ${column} 列不存在。`;
    }
    return "";
  };
  const handlers: Record<
    string,
    (values: Record<string, ParamValue>) => Promise<PluginCommandResult> | PluginCommandResult
  > = {};
  if (ready) {
    handlers["grid.set-cell"] = (values) => {
      const row = Number(values.row);
      const column = Number(values.column);
      const problem = inBounds(row, column);
      if (problem) return refuse(problem);
      editor.setCell(row - 1, column - 1, String(values.value));
      return {
        ok: true,
        message: `已把第 ${row} 行第 ${column} 列写成「${clip(String(values.value), 40)}」。`,
      };
    };
    handlers["grid.insert-row"] = (values) => {
      const side = (values.side as "before" | "after") || "after";
      editor.insertRow(side);
      return { ok: true, message: `已在选中行${side === "before" ? "上" : "下"}方插入一行。` };
    };
    handlers["grid.insert-column"] = (values) => {
      const side = (values.side as "before" | "after") || "after";
      editor.insertColumn(side);
      return {
        ok: true,
        message: `已在选中列${side === "before" ? "左" : "右"}侧插入一列。`,
      };
    };
    handlers["grid.sort-column"] = (values) => {
      const column = Number(values.column);
      const problem = inBounds(1, column);
      if (problem) return refuse(problem);
      const direction = values.direction as "asc" | "desc";
      editor.selectCell({ row: editor.headerRow ? 1 : 0, col: column - 1 });
      editor.sort(direction);
      return {
        ok: true,
        message: `已按第 ${column} 列${direction === "asc" ? "升序" : "降序"}重排。`,
      };
    };
    handlers["grid.add-sheet"] = (values) => {
      editor.addSheet();
      const name = values.name ? String(values.name) : "";
      if (name) editor.renameSheet(name);
      return { ok: true, message: name ? `已新建工作表「${clip(name, 30)}」。` : "已新建一张工作表。" };
    };
    handlers["grid.read-cell"] = (values) => {
      const row = Number(values.row);
      const column = Number(values.column);
      const problem = inBounds(row, column);
      if (problem) return refuse(problem);
      const value = editor.activeSheet.rows[row - 1]?.[column - 1] ?? "";
      return {
        ok: true,
        message: value
          ? `第 ${row} 行第 ${column} 列现在是「${clip(value, 200)}」。`
          : `第 ${row} 行第 ${column} 列是空的。`,
      };
    };
    handlers["grid.select-cell"] = (values) => {
      const row = Number(values.row);
      const column = Number(values.column);
      const problem = inBounds(row, column);
      if (problem) return refuse(problem);
      editor.selectCell({ row: row - 1, col: column - 1 });
      return { ok: true, message: `已选中第 ${row} 行第 ${column} 列。` };
    };
    handlers["grid.save"] = async () => {
      const saved = await editor.save();
      return saved
        ? { ok: true, message: "已保存成素材库里的新版本。" }
        : refuse(editor.error || "保存没有成功，工作簿还没有写进库里。");
    };
  }
  handlers["grid.export"] = async (values) => {
    const failure = await deps.download(String(values.format));
    return failure
      ? refuse(failure)
      : { ok: true, message: `已导出 ${String(values.format).toUpperCase()}。` };
  };
  return surfaceOf(
    "grid",
    GRID_SPECS,
    handlers,
    () => ({
      title: clip(editor.item.title || "", 60),
      sheetName: clip(editor.activeSheet?.name || "", 40),
      sheetCount: editor.sheets.length,
      rows: bounds.rows,
      columns: bounds.columns,
      headerRow: editor.headerRow,
      selectedRow: editor.selection.focus.row + 1,
      selectedColumn: editor.selection.focus.col + 1,
      selectedValue: clip(editor.selectedValue || "", 120),
      loading: editor.loading,
      dirty: editor.dirty,
      error: clip(editor.error || "", 120),
    }),
    () => editor.editRevision,
  );
}

// ---------------------------------------------------------------------------
// 演示（deck）
// ---------------------------------------------------------------------------

const DECK_LAYOUT_LABELS: Readonly<Record<string, string>> = {
  title: "封面",
  section: "章节页",
  bullets: "要点列表",
  "two-column": "双栏",
  "data-table": "数据表",
  "image-full": "满幅图",
  "image-left": "左图右文",
  "image-right": "左文右图",
  "image-grid": "图片宫格",
  "chart-focus": "图表主视觉",
  "chart-with-notes": "图表加要点",
  "kpi-row": "指标卡",
  comparison: "左右对比",
  timeline: "时间轴",
  quote: "引文",
  "mixed-triptych": "图文数三联",
};

const DECK_LAYOUT_CHOICES = DECK_IR_LAYOUTS.map((layout) => ({
  value: layout,
  label: DECK_LAYOUT_LABELS[layout] || layout,
}));

const DECK_SPECS: readonly PluginCommandSpec[] = [
  {
    id: "deck.add-slide",
    label: "加一页",
    summary: "在当前页后面加一页新幻灯片。",
    mutates: true,
  },
  {
    id: "deck.set-slide-title",
    label: "改某一页的标题",
    summary: "把指定页（不给就是当前页）的标题改掉。",
    mutates: true,
    params: [
      { key: "title", label: "标题", type: "string", required: true },
      { key: "page", label: "第几页", type: "number", hint: "从 1 开始，不给就是当前页。" },
    ],
  },
  {
    id: "deck.apply-layout",
    label: "换当前页的版式",
    summary: "把当前页换成指定版式，元素会按新版式重排。",
    mutates: true,
    params: [
      {
        key: "layout",
        label: "版式",
        type: "enum",
        required: true,
        enumValues: DECK_LAYOUT_CHOICES,
      },
    ],
  },
  {
    id: "deck.add-text",
    label: "在当前页加一段文字",
    summary: "在当前页插入一个文本框。",
    mutates: true,
    params: [{ key: "text", label: "文字", type: "string", required: true }],
  },
  {
    id: "deck.delete-slide",
    label: "删掉当前页",
    summary: "删除当前这一页幻灯片。",
    mutates: true,
  },
  {
    id: "deck.go-to-slide",
    label: "跳到某一页",
    summary: "只切换当前页，不改内容。",
    mutates: false,
    params: [
      { key: "page", label: "第几页", type: "number", required: true, hint: "从 1 开始。" },
    ],
  },
  {
    id: "deck.read-outline",
    label: "读每页标题",
    summary: "只读：按顺序列出每一页的标题与版式。",
    mutates: false,
  },
  {
    id: "deck.export",
    label: "导出成某个格式",
    summary: "只读：把当前演示文稿下载成指定格式。",
    mutates: false,
    params: [downloadParam("deck")],
  },
  {
    id: "deck.save",
    label: "保存到我的库",
    summary: "把当前演示文稿存成素材库里的新版本。",
    mutates: true,
  },
];

export function buildDeckCommandSurface(
  editor: DeckEditorState,
  deps: DocFamilyCommandDeps,
): PluginCommandSurfaceInput {
  const ready = !editor.loading;
  const slides = editor.deck?.slides || [];
  const pageProblem = (page: number): string => {
    if (!Number.isInteger(page)) return "页码要是整数。";
    if (page < 1 || page > slides.length) {
      return `这份演示文稿只有 ${slides.length} 页，第 ${page} 页不存在。`;
    }
    return "";
  };
  const handlers: Record<
    string,
    (values: Record<string, ParamValue>) => Promise<PluginCommandResult> | PluginCommandResult
  > = {};
  if (ready) {
    handlers["deck.add-slide"] = () => {
      editor.addSlide();
      return { ok: true, message: `已加一页，现在共 ${slides.length + 1} 页。` };
    };
    handlers["deck.set-slide-title"] = (values) => {
      const title = String(values.title);
      if (values.page === undefined) {
        // `patchSlide` 打的是当前页（读的是 hook 里的 activeRef）。
        editor.patchSlide({ title });
        return {
          ok: true,
          message: `已把第 ${editor.activeIndex + 1} 页标题改成「${clip(title, 40)}」。`,
        };
      }
      const page = Number(values.page);
      const problem = pageProblem(page);
      if (problem) return refuse(problem);
      // `selectSlide` 同步改 activeRef，紧接着的 `patchSlide` 打到的就是这一页。
      editor.selectSlide(slides[page - 1].id);
      editor.patchSlide({ title });
      return { ok: true, message: `已把第 ${page} 页标题改成「${clip(title, 40)}」。` };
    };
    handlers["deck.apply-layout"] = (values) => {
      const layout = String(values.layout);
      editor.applySlideLayout(layout as (typeof DECK_IR_LAYOUTS)[number]);
      return {
        ok: true,
        message: `当前页已换成「${DECK_LAYOUT_LABELS[layout] || layout}」版式。`,
      };
    };
    handlers["deck.add-text"] = (values) => {
      const text = String(values.text);
      editor.addTextElement({ text });
      return { ok: true, message: `已在当前页加入文字「${clip(text, 40)}」。` };
    };
    handlers["deck.delete-slide"] = () => {
      if (slides.length <= 1) {
        return refuse("只剩一页了，删掉就没有内容了；请先加一页再删。");
      }
      editor.deleteSlide();
      return { ok: true, message: `已删掉当前页，现在共 ${slides.length - 1} 页。` };
    };
    handlers["deck.go-to-slide"] = (values) => {
      const page = Number(values.page);
      const problem = pageProblem(page);
      if (problem) return refuse(problem);
      editor.selectSlide(slides[page - 1].id);
      return { ok: true, message: `已跳到第 ${page} 页。` };
    };
    handlers["deck.read-outline"] = () => ({
      ok: true,
      message: slides.length
        ? slides
            .slice(0, 60)
            .map(
              (slide, index) =>
                `第 ${index + 1} 页：${clip(slide.title || "（无标题）", 40)}（${
                  DECK_LAYOUT_LABELS[String(slide.layout)] || slide.layout
                }）`,
            )
            .join("；")
        : "这份演示文稿还没有任何页。",
    });
    handlers["deck.save"] = async () => {
      const saved = await editor.save();
      return saved
        ? { ok: true, message: "已保存成素材库里的新版本。" }
        : refuse(editor.error || "保存没有成功，演示文稿还没有写进库里。");
    };
  }
  handlers["deck.export"] = async (values) => {
    const failure = await deps.download(String(values.format));
    return failure
      ? refuse(failure)
      : { ok: true, message: `已导出 ${String(values.format).toUpperCase()}。` };
  };
  return surfaceOf(
    "deck",
    DECK_SPECS,
    handlers,
    () => ({
      title: clip(editor.deck?.title || "", 60),
      slideCount: slides.length,
      activePage: editor.activeIndex + 1,
      activeTitle: clip(editor.activeSlide?.title || "", 60),
      activeLayout: String(editor.activeSlide?.layout || ""),
      elementCount: editor.activeSlide?.elements?.length || 0,
      selectedElementId: editor.selectedElementId || "",
      aspect: editor.deck?.aspect || "",
      theme: editor.deck?.theme || "",
      loading: editor.loading,
      dirty: editor.dirty,
      error: clip(editor.error || "", 120),
    }),
    () => editor.editRevision,
  );
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

const PDF_SPECS: readonly PluginCommandSpec[] = [
  {
    id: "pdf.go-to-page",
    label: "跳到某一页",
    summary: "只翻页，不改内容。",
    mutates: false,
    params: [
      { key: "page", label: "第几页", type: "number", required: true, hint: "从 1 开始。" },
    ],
  },
  {
    id: "pdf.find-text",
    label: "全文查一个词",
    summary: "只读：在全文里找一个词，报出在第几页、上下文是什么。",
    mutates: false,
    params: [{ key: "query", label: "要找的词", type: "string", required: true }],
  },
  {
    id: "pdf.extract-pages",
    label: "拆出指定页",
    summary: "只留下指定的那些页，其余页会被拆掉。",
    mutates: true,
    params: [
      {
        key: "pages",
        label: "页码",
        type: "string",
        required: true,
        hint: "像 1,3,5-8 这样写，从 1 开始。",
      },
    ],
  },
  {
    id: "pdf.delete-page",
    label: "删掉当前页",
    summary: "删除当前显示的这一页。",
    mutates: true,
  },
  {
    id: "pdf.rotate-page",
    label: "旋转当前页",
    summary: "把当前页顺时针或逆时针转 90 度。",
    mutates: true,
    params: [
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
    id: "pdf.add-blank-page",
    label: "加一页空白页",
    summary: "在当前页后面插入一页空白页。",
    mutates: true,
  },
  {
    id: "pdf.move-page",
    label: "把某一页挪到别处",
    summary: "调整页序，把某一页移动到指定位置。",
    mutates: true,
    params: [
      { key: "from", label: "原来第几页", type: "number", required: true },
      { key: "to", label: "移到第几页", type: "number", required: true },
    ],
  },
  {
    id: "pdf.export",
    label: "导出成某个格式",
    summary: "只读：把当前 PDF 下载下来。",
    mutates: false,
    params: [downloadParam("pdf")],
  },
  {
    id: "pdf.save",
    label: "另存到我的库",
    summary: "把当前改动存成素材库里的一份新 PDF。",
    mutates: true,
  },
];

/** `1,3,5-8` → `[1,3,5,6,7,8]`；写错给空数组。 */
export function parsePageList(text: string, pageCount: number): number[] {
  const pages = new Set<number>();
  for (const chunk of String(text || "").split(/[,，\s]+/)) {
    if (!chunk) continue;
    const range = chunk.match(/^(\d+)\s*[-–~]\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (!start || !end || start > end) return [];
      for (let page = start; page <= end; page += 1) {
        if (page < 1 || page > pageCount) return [];
        pages.add(page);
      }
      continue;
    }
    if (!/^\d+$/.test(chunk)) return [];
    const page = Number(chunk);
    if (page < 1 || page > pageCount) return [];
    pages.add(page);
  }
  return [...pages].sort((left, right) => left - right);
}

export function buildPdfCommandSurface(
  editor: PdfWorkbenchState,
  deps: DocFamilyCommandDeps,
): PluginCommandSurfaceInput {
  const ready = !editor.loading && !editor.processing && editor.pageCount > 0;
  const pageProblem = (page: number): string => {
    if (!Number.isInteger(page)) return "页码要是整数。";
    if (page < 1 || page > editor.pageCount) {
      return `这份 PDF 只有 ${editor.pageCount} 页，第 ${page} 页不存在。`;
    }
    return "";
  };
  const handlers: Record<
    string,
    (values: Record<string, ParamValue>) => Promise<PluginCommandResult> | PluginCommandResult
  > = {};
  if (ready) {
    handlers["pdf.go-to-page"] = (values) => {
      const page = Number(values.page);
      const problem = pageProblem(page);
      if (problem) return refuse(problem);
      editor.goToPage(page);
      return { ok: true, message: `已跳到第 ${page} 页。` };
    };
    handlers["pdf.find-text"] = (values) => {
      if (!editor.textLayer.present) {
        return refuse(
          "这份 PDF 是扫描件，没有可搜索的文字层；可以先做一次文字识别再来找。",
        );
      }
      const hits = editor.searchFullText(String(values.query));
      return hits.length
        ? {
            ok: true,
            message: `找到 ${hits.length} 处：${hits
              .slice(0, 10)
              .map((hit) => `第 ${hit.pageNumber} 页「${clip(hit.excerpt, 60)}」`)
              .join("；")}`,
          }
        : { ok: false, message: `全文里没有找到「${clip(String(values.query), 30)}」。` };
    };
    handlers["pdf.extract-pages"] = async (values) => {
      const pages = parsePageList(String(values.pages), editor.pageCount);
      if (!pages.length) {
        return refuse(
          `页码写法认不出，或者超出了 1–${editor.pageCount} 的范围；像 1,3,5-8 这样写。`,
        );
      }
      if (pages.length === editor.pageCount) {
        return refuse("选中的是全部页，拆出来和原件一样，没有执行。");
      }
      await editor.extractPages(pages);
      return { ok: true, message: `已只保留第 ${pages.join("、")} 页。` };
    };
    handlers["pdf.delete-page"] = async () => {
      if (editor.pageCount <= 1) {
        return refuse("只剩一页了，删掉就没有内容了。");
      }
      await editor.deleteCurrentPage();
      return { ok: true, message: `已删掉第 ${editor.pageNumber} 页。` };
    };
    handlers["pdf.rotate-page"] = async (values) => {
      const direction = (values.direction as "cw" | "ccw") || "cw";
      await editor.rotateCurrentPage(direction === "ccw" ? -1 : 1);
      return {
        ok: true,
        message: `第 ${editor.pageNumber} 页已${direction === "ccw" ? "逆" : "顺"}时针转 90 度。`,
      };
    };
    handlers["pdf.add-blank-page"] = async () => {
      await editor.addBlankPage();
      return { ok: true, message: "已插入一页空白页。" };
    };
    handlers["pdf.move-page"] = async (values) => {
      const from = Number(values.from);
      const to = Number(values.to);
      const problem = pageProblem(from) || pageProblem(to);
      if (problem) return refuse(problem);
      if (from === to) return refuse("原位置和目标位置一样，没有执行。");
      await editor.movePage(from, to);
      return { ok: true, message: `已把第 ${from} 页移到第 ${to} 页。` };
    };
    handlers["pdf.save"] = async () => {
      const saved = await editor.saveCopy();
      return saved
        ? { ok: true, message: "已另存成素材库里的一份新 PDF。" }
        : refuse(editor.error || "另存没有成功，改动还没有写进库里。");
    };
  }
  handlers["pdf.export"] = async (values) => {
    const failure = await deps.download(String(values.format));
    return failure
      ? refuse(failure)
      : { ok: true, message: `已导出 ${String(values.format).toUpperCase()}。` };
  };
  return surfaceOf(
    "pdf",
    PDF_SPECS,
    handlers,
    () => ({
      page: editor.pageNumber,
      pageCount: editor.pageCount,
      zoom: editor.zoom,
      rotation: editor.rotation,
      readerState: editor.readerState,
      textSearchable: editor.textLayer.present,
      annotationCount: editor.annotations.length,
      loading: editor.loading,
      processing: editor.processing,
      dirty: editor.dirty,
      error: clip(editor.error || editor.failure?.message || "", 120),
    }),
    () => editor.editRevision,
  );
}

/** 四条路由的指令面构造器，按 editorId 索引（测试与文档用同一张表）。 */
export const DOC_FAMILY_COMMAND_SPECS: Readonly<
  Record<DocFamilyEditorId, readonly PluginCommandSpec[]>
> = {
  richdoc: RICHDOC_SPECS,
  grid: GRID_SPECS,
  deck: DECK_SPECS,
  pdf: PDF_SPECS,
};
