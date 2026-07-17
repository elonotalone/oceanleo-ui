"use client";

import { useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { PdfWorkbenchState } from "./use-pdf-workbench";

function editableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function PdfStage({
  editor,
  accent = "#4f46e5",
}: {
  editor: PdfWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (editableTarget(event.target)) return;
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        editor.previousPage();
      } else if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        editor.nextPage();
      } else if ((event.ctrlKey || event.metaKey) && event.key === "=") {
        event.preventDefault();
        editor.zoomBy(25);
      } else if ((event.ctrlKey || event.metaKey) && event.key === "-") {
        event.preventDefault();
        editor.zoomBy(-25);
      }
    },
    [editor],
  );
  const busyLabel = editor.processing
    ? tt("正在处理 PDF…")
    : editor.loading
      ? tt("正在加载 PDF…")
      : "";
  const visualScale = editor.zoom / Math.max(1, editor.renderedZoom);
  const visualWidth = editor.pageWidth * visualScale;
  const visualHeight = editor.pageHeight * visualScale;

  return (
    <div
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => event.currentTarget.focus()}
      className="flex h-full min-h-0 flex-col bg-[var(--surface,#f5f5f4)] outline-none"
    >
      <div className="flex min-h-0 flex-1 overflow-auto p-5">
        <div
          data-pdf-page-frame
          className="relative m-auto min-h-32 min-w-32"
          style={
            editor.pageWidth && editor.pageHeight
              ? {
                  width: `${visualWidth}px`,
                  height: `${visualHeight}px`,
                }
              : undefined
          }
        >
          <canvas
            ref={editor.canvasRef}
            aria-label={tt("PDF 第 {page} 页", { page: editor.pageNumber })}
            className="block max-w-none origin-top-left bg-white shadow-[0_8px_32px_rgba(28,25,23,.18)] transition-transform duration-75"
            style={{ transform: `scale(${visualScale})` }}
          />
          {busyLabel && (
            <div className="absolute inset-0 flex min-h-32 items-center justify-center bg-[var(--card,#fff)]/85 px-5 text-center text-[12px] text-[var(--muted,#78716c)] backdrop-blur-[1px]">
              {busyLabel}
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-4 py-2.5">
        <button
          type="button"
          disabled={editor.loading || editor.pageNumber <= 1}
          onClick={editor.previousPage}
          className="rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 py-1.5 text-[11px] text-[var(--fg-2,#57534e)] disabled:opacity-40"
        >
          ←
        </button>
        <span className="min-w-20 text-center text-[11px] tabular-nums text-[var(--fg-2,#57534e)]">
          {editor.pageNumber} / {editor.pageCount || "—"}
        </span>
        <button
          type="button"
          disabled={editor.loading || editor.pageNumber >= editor.pageCount}
          onClick={editor.nextPage}
          className="rounded-lg border border-[var(--border,#e7e5e4)] px-2.5 py-1.5 text-[11px] text-[var(--fg-2,#57534e)] disabled:opacity-40"
        >
          →
        </button>
        <span className="min-w-0 flex-1 truncate px-2 text-[11px]">
          {editor.error ? (
            <span className="text-red-600">{editor.error}</span>
          ) : editor.notice ? (
            <span className="text-emerald-600">{editor.notice}</span>
          ) : (
            <span className="text-[var(--muted,#78716c)]">
              {editor.dirty
                ? tt("有未保存的 PDF 修改")
                : tt("方向键翻页 · Ctrl + / − 缩放")}
            </span>
          )}
        </span>
        <span
          className="rounded-md px-2 py-1 text-[10px] font-medium tabular-nums"
          style={{ color: accent, background: `${accent}12` }}
        >
          {editor.zoom}%
        </span>
      </div>
    </div>
  );
}
