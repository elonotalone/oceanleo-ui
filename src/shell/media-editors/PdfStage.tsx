"use client";

import {
  useCallback,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { PdfWorkbenchState } from "./use-pdf-workbench";
import {
  normalizedVisualRect,
  type PdfVisualPoint,
  type PdfVisualRect,
} from "./pdf-annotation-operations";

function editableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

interface PdfAnnotationDrag {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  originX: number;
  originY: number;
  rect: PdfVisualRect;
}

function movedAnnotationRect(
  drag: PdfAnnotationDrag,
  point: PdfVisualPoint,
): PdfVisualRect {
  return {
    ...drag.rect,
    x: Math.max(
      0,
      Math.min(1 - drag.rect.width, point.x - drag.offsetX),
    ),
    y: Math.max(
      0,
      Math.min(1 - drag.rect.height, point.y - drag.offsetY),
    ),
  };
}

export function PdfStage({
  editor,
  accent = "#4f46e5",
}: {
  editor: PdfWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const [highlightStart, setHighlightStart] =
    useState<PdfVisualPoint | null>(null);
  const [highlightPreview, setHighlightPreview] =
    useState<PdfVisualRect | null>(null);
  const [annotationDrag, setAnnotationDrag] =
    useState<PdfAnnotationDrag | null>(null);
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (editableTarget(event.target)) return;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
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
  const eventPoint = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): PdfVisualPoint => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  };

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
          {editor.pageWidth > 0 && editor.pageHeight > 0 && (
            <div
              data-pdf-annotation-layer
              className={`absolute inset-0 z-20 touch-none ${
                editor.annotationTool === "select"
                  ? "cursor-default"
                  : editor.annotationTool === "text"
                    ? "cursor-copy"
                    : "cursor-crosshair"
              }`}
              onPointerDown={(event) => {
                if (editor.processing || editor.loading) return;
                const point = eventPoint(event);
                const annotationElement =
                  event.target instanceof Element
                    ? event.target.closest<HTMLElement>(
                        "[data-pdf-annotation]",
                      )
                    : null;
                const annotation = editor.annotations.find(
                  (entry) =>
                    entry.id === annotationElement?.dataset.pdfAnnotation,
                );
                if (editor.annotationTool === "select" && annotation) {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  editor.selectAnnotation(annotation.id);
                  setAnnotationDrag({
                    id: annotation.id,
                    pointerId: event.pointerId,
                    offsetX: point.x - annotation.rect.x,
                    offsetY: point.y - annotation.rect.y,
                    originX: annotation.rect.x,
                    originY: annotation.rect.y,
                    rect: annotation.rect,
                  });
                  return;
                }
                if (editor.annotationTool === "text") {
                  void editor.addTextAnnotationAt(point);
                  return;
                }
                if (editor.annotationTool === "highlight") {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setHighlightStart(point);
                  setHighlightPreview({
                    x: point.x,
                    y: point.y,
                    width: 0,
                    height: 0,
                  });
                  return;
                }
                editor.selectAnnotation("");
              }}
              onPointerMove={(event) => {
                if (
                  annotationDrag &&
                  annotationDrag.pointerId === event.pointerId &&
                  editor.annotationTool === "select"
                ) {
                  const point = eventPoint(event);
                  setAnnotationDrag((current) =>
                    current && current.pointerId === event.pointerId
                      ? {
                          ...current,
                          rect: movedAnnotationRect(current, point),
                        }
                      : current,
                  );
                  return;
                }
                if (!highlightStart || editor.annotationTool !== "highlight") {
                  return;
                }
                setHighlightPreview(
                  normalizedVisualRect(highlightStart, eventPoint(event)),
                );
              }}
              onPointerUp={(event) => {
                if (
                  annotationDrag &&
                  annotationDrag.pointerId === event.pointerId
                ) {
                  const rect = movedAnnotationRect(
                    annotationDrag,
                    eventPoint(event),
                  );
                  setAnnotationDrag(null);
                  if (
                    Math.abs(rect.x - annotationDrag.originX) > 0.0001 ||
                    Math.abs(rect.y - annotationDrag.originY) > 0.0001
                  ) {
                    void editor.moveAnnotation(annotationDrag.id, rect);
                  }
                  return;
                }
                if (!highlightStart || editor.annotationTool !== "highlight") {
                  return;
                }
                const rect = normalizedVisualRect(
                  highlightStart,
                  eventPoint(event),
                );
                setHighlightStart(null);
                setHighlightPreview(null);
                if (rect.width >= 0.002 && rect.height >= 0.002) {
                  void editor.addHighlightAnnotation(rect);
                }
              }}
              onPointerCancel={() => {
                setAnnotationDrag(null);
                setHighlightStart(null);
                setHighlightPreview(null);
              }}
            >
              {editor.annotations.map((annotation) => {
                const selected =
                  annotation.id === editor.selectedAnnotationId;
                const rect =
                  annotationDrag?.id === annotation.id
                    ? annotationDrag.rect
                    : annotation.rect;
                return (
                  <button
                    key={annotation.id}
                    type="button"
                    data-pdf-annotation={annotation.id}
                    aria-label={
                      annotation.contents ||
                      (annotation.kind === "highlight"
                        ? tt("高亮批注")
                        : tt("文字批注"))
                    }
                    title={annotation.contents}
                    className={
                      annotation.kind === "highlight"
                        ? "absolute rounded-sm"
                        : "absolute grid min-h-5 min-w-5 place-items-center rounded-full text-[11px] font-bold text-amber-950 shadow-sm"
                    }
                    style={{
                      left: `${rect.x * 100}%`,
                      top: `${rect.y * 100}%`,
                      width: `${rect.width * 100}%`,
                      height: `${rect.height * 100}%`,
                      minWidth:
                        annotation.kind === "text" ? "20px" : undefined,
                      minHeight:
                        annotation.kind === "text" ? "20px" : undefined,
                      background:
                        annotation.kind === "highlight"
                          ? `${annotation.color}66`
                          : annotation.color,
                      boxShadow: selected
                        ? `0 0 0 2px ${accent}`
                        : annotation.kind === "highlight"
                          ? `inset 0 0 0 1px ${annotation.color}88`
                          : undefined,
                    }}
                  >
                    {annotation.kind === "text" ? "✦" : null}
                  </button>
                );
              })}
              {highlightPreview && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute border border-amber-500 bg-amber-300/35"
                  style={{
                    left: `${highlightPreview.x * 100}%`,
                    top: `${highlightPreview.y * 100}%`,
                    width: `${highlightPreview.width * 100}%`,
                    height: `${highlightPreview.height * 100}%`,
                  }}
                />
              )}
            </div>
          )}
          {busyLabel && (
            <div className="absolute inset-0 z-30 flex min-h-32 items-center justify-center bg-[var(--card,#fff)]/85 px-5 text-center text-[12px] text-[var(--muted,#78716c)] backdrop-blur-[1px]">
              {busyLabel}
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-4 py-2.5">
        <button
          type="button"
          aria-label={tt("上一页")}
          title={tt("上一页")}
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
          aria-label={tt("下一页")}
          title={tt("下一页")}
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
              {tt("方向键翻页 · Ctrl + / − 缩放 · Ctrl+Z 撤销")}
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
