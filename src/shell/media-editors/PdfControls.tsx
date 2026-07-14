"use client";

import { useRef } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { PdfWorkbenchState } from "./use-pdf-workbench";

function ControlButton({
  children,
  onClick,
  disabled,
  accent,
  primary = false,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  accent?: string;
  primary?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        primary
          ? "rounded-lg px-2 py-2 text-[11px] font-semibold text-white disabled:opacity-45"
          : "rounded-lg border border-stone-200 px-2 py-2 text-[11px] text-stone-600 hover:bg-stone-50 disabled:opacity-40"
      }
      style={primary ? { background: accent || "#4f46e5" } : undefined}
    >
      {children}
    </button>
  );
}

export function PdfControls({
  editor,
  accent = "#4f46e5",
}: {
  editor: PdfWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const mergeInputRef = useRef<HTMLInputElement | null>(null);
  const busy = editor.loading || editor.processing || editor.saving;

  return (
    <div className="space-y-4 overflow-y-auto p-3">
      <section>
        <p className="mb-2 text-[11px] font-semibold text-stone-800">{tt("页面")}</p>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
          <ControlButton
            disabled={busy || editor.pageNumber <= 1}
            onClick={editor.previousPage}
            title={tt("上一页")}
          >
            ← {tt("上一页")}
          </ControlButton>
          <label className="flex items-center gap-1 text-[10px] text-stone-400">
            <input
              type="number"
              min={1}
              max={Math.max(1, editor.pageCount)}
              value={editor.pageNumber}
              disabled={busy}
              onChange={(event) => editor.goToPage(Number(event.target.value))}
              className="w-12 rounded-lg border border-stone-200 px-1 py-2 text-center text-[11px] tabular-nums text-stone-700 outline-none"
            />
            / {editor.pageCount || "—"}
          </label>
          <ControlButton
            disabled={busy || editor.pageNumber >= editor.pageCount}
            onClick={editor.nextPage}
            title={tt("下一页")}
          >
            {tt("下一页")} →
          </ControlButton>
        </div>
      </section>

      <section className="space-y-2 border-t border-stone-100 pt-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-stone-800">{tt("视图")}</p>
          <span className="text-[10px] tabular-nums text-stone-400">
            {editor.zoom}% · {editor.rotation}°
          </span>
        </div>
        <input
          type="range"
          min={25}
          max={300}
          step={5}
          value={editor.zoom}
          disabled={editor.loading}
          onChange={(event) => editor.setZoom(Number(event.target.value))}
          className="w-full accent-stone-800"
        />
        <div className="grid grid-cols-2 gap-1.5">
          <ControlButton disabled={editor.loading} onClick={() => editor.zoomBy(-25)}>
            − {tt("缩小")}
          </ControlButton>
          <ControlButton disabled={editor.loading} onClick={() => editor.zoomBy(25)}>
            + {tt("放大")}
          </ControlButton>
          <ControlButton
            disabled={busy}
            onClick={() => void editor.rotateCurrentPage(-1)}
          >
            ↶ {tt("向左旋转")}
          </ControlButton>
          <ControlButton
            disabled={busy}
            onClick={() => void editor.rotateCurrentPage(1)}
          >
            ↷ {tt("向右旋转")}
          </ControlButton>
        </div>
      </section>

      <section className="space-y-2 border-t border-stone-100 pt-3">
        <p className="text-[11px] font-semibold text-stone-800">{tt("页面整理")}</p>
        <div className="grid grid-cols-2 gap-1.5">
          <ControlButton
            disabled={busy || editor.pageNumber <= 1}
            onClick={() => void editor.moveCurrentPage(-1)}
          >
            {tt("前移一页")}
          </ControlButton>
          <ControlButton
            disabled={busy || editor.pageNumber >= editor.pageCount}
            onClick={() => void editor.moveCurrentPage(1)}
          >
            {tt("后移一页")}
          </ControlButton>
          <ControlButton disabled={busy} onClick={() => void editor.addBlankPage()}>
            + {tt("添加空白页")}
          </ControlButton>
          <ControlButton
            disabled={busy || editor.pageCount <= 1}
            onClick={() => void editor.deleteCurrentPage()}
          >
            {tt("删除当前页")}
          </ControlButton>
        </div>
        <input
          ref={mergeInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void editor.mergePdf(file, "append");
          }}
        />
        <ControlButton
          disabled={busy}
          onClick={() => mergeInputRef.current?.click()}
        >
          {editor.processing ? tt("处理中…") : tt("合并另一个 PDF 到末尾")}
        </ControlButton>
        <p className="text-[10px] leading-relaxed text-stone-400">
          {tt("旋转、排序、删除、空白页和合并均创建编辑副本，不覆盖原文件。")}
        </p>
      </section>

      <section className="space-y-2 border-t border-stone-100 pt-3">
        <p className="text-[11px] font-semibold text-stone-800">{tt("历史")}</p>
        <div className="grid grid-cols-2 gap-1.5">
          <ControlButton disabled={busy || !editor.canUndo} onClick={editor.undo}>
            {tt("撤销")}
          </ControlButton>
          <ControlButton disabled={busy || !editor.canRedo} onClick={editor.redo}>
            {tt("重做")}
          </ControlButton>
        </div>
      </section>

      <section className="space-y-1.5 border-t border-stone-100 pt-3">
        <p className="mb-2 text-[11px] font-semibold text-stone-800">{tt("导出")}</p>
        <ControlButton
          disabled={busy}
          onClick={() => void editor.extractPages()}
        >
          {tt("提取当前页为 PDF")}
        </ControlButton>
        <ControlButton disabled={busy} onClick={editor.download}>
          {tt("下载编辑版 PDF")}
        </ControlButton>
        <ControlButton
          disabled={busy}
          primary
          accent={accent}
          onClick={() => void editor.saveCopy()}
        >
          {editor.saving ? tt("保存中…") : tt("保存副本到我的库")}
        </ControlButton>
        {editor.savedUrl && (
          <p className="break-all text-[10px] text-emerald-600">
            {tt("PDF 副本已保存到我的库")}
          </p>
        )}
      </section>
    </div>
  );
}
