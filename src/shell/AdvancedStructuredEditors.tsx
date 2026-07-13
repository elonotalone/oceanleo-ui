"use client";

import { useEffect, useMemo, useState } from "react";
import { saveWorks, uploadFile } from "../lib/database";
import { useUI } from "../i18n/ui/useUI";
import { Markdown } from "./Markdown";
import type { LibraryItem } from "./library-data";

function sourceUrl(item: LibraryItem): string {
  return item.url || item.previewUrl || "";
}

function download(name: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function saveTextVersion(
  item: LibraryItem,
  siteId: string,
  text: string,
  fileName: string,
  mime: string,
  kind: "document" | "sheet",
) {
  const uploaded = await uploadFile(new File([text], fileName, { type: mime }), {
    siteId: siteId || "oceanleo",
    title: `${item.title}-编辑版`,
  });
  const file = uploaded.data?.file;
  if (!uploaded.ok || !file?.url) {
    return { ok: false, error: uploaded.error || "上传失败" };
  }
  const saved = await saveWorks(siteId || "oceanleo", [
    {
      url: file.url,
      thumb_url: file.thumb_url || file.url,
      media_type: kind === "sheet" ? "sheet" : "doc",
      title: `${item.title}-编辑版`,
      kind,
      meta: {
        parent_asset_id: item.id,
        mime,
        editor: kind === "sheet" ? "table" : "text",
      },
    },
  ]);
  return saved.ok
    ? { ok: true, error: "" }
    : { ok: false, error: saved.error || "保存失败" };
}

function textFromItem(item: LibraryItem): string {
  if (item.content?.trim()) return item.content;
  for (const key of ["content", "text", "markdown", "source"]) {
    const value = item.meta[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function canFetchText(url: string): boolean {
  return /\.(?:txt|md|markdown|json|csv|html?|css|js|ts)(?:[?#]|$)/i.test(url);
}

export function useTextWorkbench(item: LibraryItem, siteId: string) {
  const [text, setText] = useState(() => textFromItem(item));
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });

  useEffect(() => {
    const local = textFromItem(item);
    setText(local);
    setStatus("");
    const url = sourceUrl(item);
    if (local || !url || !canFetchText(url)) return;
    let alive = true;
    setLoading(true);
    void fetch(url)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const value = await response.text();
        if (alive) setText(value.slice(0, 2_000_000));
      })
      .catch(() => {
        if (alive) setStatus("原文件无法直接读取，可在这里新建可编辑版本。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [item]);

  function wrap(before: string, after = before) {
    const start = Math.min(selection.start, text.length);
    const end = Math.min(selection.end, text.length);
    setText(`${text.slice(0, start)}${before}${text.slice(start, end)}${after}${text.slice(end)}`);
  }

  function replaceAll() {
    if (!find) return;
    setText(text.split(find).join(replace));
  }

  async function save() {
    setStatus("保存中…");
    const result = await saveTextVersion(
      item,
      siteId,
      text,
      `${item.title || "document"}.md`,
      "text/markdown;charset=utf-8",
      "document",
    );
    setStatus(result.ok ? "已保存新版本到我的库" : result.error);
  }

  return {
    text,
    setText,
    loading,
    status,
    mode,
    setMode,
    find,
    setFind,
    replace,
    setReplace,
    selection,
    setSelection,
    wrap,
    replaceAll,
    save,
    download: () =>
      download(`${item.title || "document"}.md`, text, "text/markdown;charset=utf-8"),
  };
}

export type TextWorkbench = ReturnType<typeof useTextWorkbench>;

export function TextWorkbenchControls({
  editor,
  accent,
}: {
  editor: TextWorkbench;
  accent: string;
}) {
  const tt = useUI();
  const stats = useMemo(() => {
    const compact = editor.text.trim();
    return {
      chars: editor.text.length,
      words: compact ? compact.split(/\s+/).length : 0,
      lines: editor.text.split("\n").length,
    };
  }, [editor.text]);
  return (
    <div className="h-full overflow-y-auto p-3 text-[12px]">
      <div className="grid grid-cols-3 gap-2">
        {[
          [tt("字符"), stats.chars],
          [tt("词数"), stats.words],
          [tt("行数"), stats.lines],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl bg-stone-50 p-2 text-center">
            <p className="font-semibold text-stone-700">{value}</p>
            <p className="text-[10px] text-stone-400">{label}</p>
          </div>
        ))}
      </div>
      <p className="mb-2 mt-4 font-semibold text-stone-700">{tt("格式")}</p>
      <div className="grid grid-cols-3 gap-1.5">
        <FormatButton label="H1" onClick={() => editor.wrap("# ", "")} />
        <FormatButton label="H2" onClick={() => editor.wrap("## ", "")} />
        <FormatButton label={tt("加粗")} onClick={() => editor.wrap("**")} />
        <FormatButton label={tt("斜体")} onClick={() => editor.wrap("_")} />
        <FormatButton label={tt("引用")} onClick={() => editor.wrap("> ", "")} />
        <FormatButton label={tt("列表")} onClick={() => editor.wrap("- ", "")} />
      </div>
      <p className="mb-2 mt-4 font-semibold text-stone-700">{tt("查找替换")}</p>
      <input
        value={editor.find}
        onChange={(event) => editor.setFind(event.target.value)}
        placeholder={tt("查找")}
        className="w-full rounded-lg border border-stone-200 px-2.5 py-2 outline-none"
      />
      <input
        value={editor.replace}
        onChange={(event) => editor.setReplace(event.target.value)}
        placeholder={tt("替换为")}
        className="mt-2 w-full rounded-lg border border-stone-200 px-2.5 py-2 outline-none"
      />
      <button
        type="button"
        onClick={editor.replaceAll}
        disabled={!editor.find}
        className="mt-2 w-full rounded-lg border border-stone-200 px-3 py-2 text-stone-600 disabled:opacity-40"
      >
        {tt("全部替换")}
      </button>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void editor.save()}
          className="rounded-xl px-3 py-2 font-semibold text-white"
          style={{ background: accent }}
        >
          {tt("保存新版本")}
        </button>
        <button
          type="button"
          onClick={editor.download}
          className="rounded-xl border border-stone-200 px-3 py-2 text-stone-600"
        >
          {tt("下载 Markdown")}
        </button>
      </div>
      {editor.status && <p className="mt-3 leading-relaxed text-stone-500">{tt(editor.status)}</p>}
    </div>
  );
}

function FormatButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-[11px] text-stone-600 hover:bg-stone-50"
    >
      {label}
    </button>
  );
}

export function TextWorkbenchCanvas({ editor }: { editor: TextWorkbench }) {
  const tt = useUI();
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-stone-200 px-3">
        <span className="text-[11px] text-stone-400">
          {editor.loading ? tt("正在读取…") : tt("文本与 Markdown 编辑器")}
        </span>
        <div className="rounded-lg bg-stone-100 p-0.5">
          {(["edit", "preview"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => editor.setMode(mode)}
              className={`rounded-md px-2.5 py-1 text-[10px] ${
                editor.mode === mode ? "bg-white text-stone-700 shadow-sm" : "text-stone-400"
              }`}
            >
              {tt(mode === "edit" ? "编辑" : "预览")}
            </button>
          ))}
        </div>
      </div>
      {editor.mode === "edit" ? (
        <textarea
          value={editor.text}
          onChange={(event) => editor.setText(event.target.value)}
          onSelect={(event) =>
            editor.setSelection({
              start: event.currentTarget.selectionStart,
              end: event.currentTarget.selectionEnd,
            })
          }
          spellCheck
          className="min-h-0 flex-1 resize-none bg-white p-6 font-mono text-[13px] leading-7 text-stone-700 outline-none"
          placeholder={tt("在这里编辑文字、Markdown、HTML 或代码文本…")}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-4xl">
            <Markdown>{editor.text || tt("暂无内容")}</Markdown>
          </div>
        </div>
      )}
    </div>
  );
}

function parseCsv(value: string): string[][] {
  if (!value.trim()) return Array.from({ length: 10 }, () => Array(6).fill(""));
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"' && quoted && value[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && value[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  const width = Math.max(1, ...rows.map((item) => item.length));
  return rows.map((item) => [...item, ...Array(width - item.length).fill("")]);
}

function csvValue(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\r\n");
}

export function useSheetWorkbench(item: LibraryItem, siteId: string) {
  const initial = textFromItem(item);
  const [rows, setRows] = useState<string[][]>(() => parseCsv(initial));
  const [status, setStatus] = useState("");

  useEffect(() => {
    const local = textFromItem(item);
    setRows(parseCsv(local));
    setStatus("");
    const url = sourceUrl(item);
    if (local || !/\.csv(?:[?#]|$)/i.test(url)) return;
    let alive = true;
    void fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error();
        return response.text();
      })
      .then((value) => {
        if (alive) setRows(parseCsv(value.slice(0, 2_000_000)));
      })
      .catch(() => {
        if (alive) setStatus("原表格无法直接读取，已打开空白可编辑副本。");
      });
    return () => {
      alive = false;
    };
  }, [item]);

  function setCell(rowIndex: number, columnIndex: number, value: string) {
    setRows((current) =>
      current.map((row, r) =>
        r === rowIndex ? row.map((cell, c) => (c === columnIndex ? value : cell)) : row,
      ),
    );
  }
  function addRow() {
    setRows((current) => [...current, Array(current[0]?.length || 1).fill("")]);
  }
  function addColumn() {
    setRows((current) => current.map((row) => [...row, ""]));
  }
  function removeRow() {
    setRows((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }
  function removeColumn() {
    setRows((current) =>
      (current[0]?.length || 0) > 1 ? current.map((row) => row.slice(0, -1)) : current,
    );
  }
  async function save() {
    setStatus("保存中…");
    const result = await saveTextVersion(
      item,
      siteId,
      csvValue(rows),
      `${item.title || "spreadsheet"}.csv`,
      "text/csv;charset=utf-8",
      "sheet",
    );
    setStatus(result.ok ? "已保存新版本到我的库" : result.error);
  }
  return {
    rows,
    setCell,
    addRow,
    addColumn,
    removeRow,
    removeColumn,
    save,
    status,
    download: () =>
      download(`${item.title || "spreadsheet"}.csv`, csvValue(rows), "text/csv;charset=utf-8"),
  };
}

export type SheetWorkbench = ReturnType<typeof useSheetWorkbench>;

export function SheetWorkbenchControls({
  editor,
  accent,
}: {
  editor: SheetWorkbench;
  accent: string;
}) {
  const tt = useUI();
  return (
    <div className="h-full space-y-3 overflow-y-auto p-3 text-[12px]">
      <div className="rounded-xl bg-stone-50 p-3 text-stone-600">
        {editor.rows.length} {tt("行")} × {editor.rows[0]?.length || 0} {tt("列")}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FormatButton label={tt("增加一行")} onClick={editor.addRow} />
        <FormatButton label={tt("增加一列")} onClick={editor.addColumn} />
        <FormatButton label={tt("删除末行")} onClick={editor.removeRow} />
        <FormatButton label={tt("删除末列")} onClick={editor.removeColumn} />
      </div>
      <button
        type="button"
        onClick={() => void editor.save()}
        className="w-full rounded-xl px-3 py-2 font-semibold text-white"
        style={{ background: accent }}
      >
        {tt("保存新版本")}
      </button>
      <button
        type="button"
        onClick={editor.download}
        className="w-full rounded-xl border border-stone-200 px-3 py-2 text-stone-600"
      >
        {tt("下载 CSV")}
      </button>
      {editor.status && <p className="leading-relaxed text-stone-500">{tt(editor.status)}</p>}
    </div>
  );
}

function columnLabel(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function SheetWorkbenchCanvas({ editor }: { editor: SheetWorkbench }) {
  return (
    <div className="h-full overflow-auto bg-white p-4">
      <table className="min-w-full border-separate border-spacing-0 text-[12px]">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="sticky left-0 z-20 h-8 w-10 border border-stone-200 bg-stone-100" />
            {(editor.rows[0] || []).map((_, index) => (
              <th
                key={index}
                className="min-w-28 border-y border-r border-stone-200 bg-stone-100 px-2 font-medium text-stone-500"
              >
                {columnLabel(index)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {editor.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              <th className="sticky left-0 border-x border-b border-stone-200 bg-stone-100 px-2 font-medium text-stone-400">
                {rowIndex + 1}
              </th>
              {row.map((cell, columnIndex) => (
                <td key={columnIndex} className="border-b border-r border-stone-200 p-0">
                  <input
                    value={cell}
                    onChange={(event) =>
                      editor.setCell(rowIndex, columnIndex, event.target.value)
                    }
                    className="h-9 w-full min-w-28 bg-white px-2 outline-none focus:bg-sky-50"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
