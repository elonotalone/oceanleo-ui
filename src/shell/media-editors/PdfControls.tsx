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
      <section className="space-y-2">
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
        </div>
      </section>

      <section className="space-y-2 border-t border-stone-100 pt-3">
        <p className="text-[11px] font-semibold text-stone-800">{tt("添加页面")}</p>
        <div className="grid grid-cols-1 gap-1.5">
          <ControlButton disabled={busy} onClick={() => void editor.addBlankPage()}>
            + {tt("添加空白页")}
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
          {tt("选择当前页后，旋转、排序、提取和删除会出现在页面上方。")}
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
