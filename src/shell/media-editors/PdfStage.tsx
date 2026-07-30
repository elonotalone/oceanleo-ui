"use client";

import {
  useCallback,
  useRef,
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
import {
  PDF_READER_LAYOUT,
  PDF_READER_PALETTE,
  viewportPointToVisual,
} from "./pdf-workbench-utils";

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
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [highlightStart, setHighlightStart] =
    useState<PdfVisualPoint | null>(null);
  const [highlightPreview, setHighlightPreview] =
    useState<PdfVisualRect | null>(null);
  const [annotationDrag, setAnnotationDrag] =
    useState<PdfAnnotationDrag | null>(null);
  const [pageInput, setPageInput] = useState("");
  const fit = useCallback(
    (mode: "width" | "page") => {
      const bounds = viewportRef.current?.getBoundingClientRect();
      if (!bounds) return;
      editor.fitZoom(mode, { width: bounds.width - 40, height: bounds.height - 40 });
    },
    [editor],
  );
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
      } else if (event.key === "Home") {
        event.preventDefault();
        editor.goToPage(1);
      } else if (event.key === "End") {
        event.preventDefault();
        editor.goToPage(editor.pageCount);
      } else if ((event.ctrlKey || event.metaKey) && event.key === "=") {
        event.preventDefault();
        editor.zoomBy(25);
      } else if ((event.ctrlKey || event.metaKey) && event.key === "-") {
        event.preventDefault();
        editor.zoomBy(-25);
      } else if ((event.ctrlKey || event.metaKey) && event.key === "0") {
        event.preventDefault();
        fit("page");
      }
    },
    [editor, fit],
  );
  const busyLabel = editor.processing
    ? tt("正在处理 PDF…")
    : editor.loading
      ? tt("正在加载 PDF…")
      : "";
  const visualScale = editor.zoom / Math.max(1, editor.renderedZoom);
  const visualWidth = editor.pageWidth * visualScale;
  const visualHeight = editor.pageHeight * visualScale;
  // §3.3: the only viewport→visual conversion on this surface. The frame is
  // what zoom scales, so the same glyph yields the same pair at 25 % and 400 %.
  const eventPoint = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): PdfVisualPoint =>
    viewportPointToVisual(
      { x: event.clientX, y: event.clientY },
      event.currentTarget.getBoundingClientRect(),
    );

  // §6: an unreadable document ends in `invalid` with a stated reason. A blank
  // stage with no explanation is the failure this branch exists to prevent.
  if (editor.readerState === "invalid") {
    return (
      <div
        data-pdf-reader-state="invalid"
        role="alert"
        className="flex h-full min-h-0 flex-col items-center justify-center gap-2 px-6 text-center"
        style={{ background: PDF_READER_PALETTE["reader.canvas"] }}
      >
        <p className="text-[13px] font-semibold text-white">
          {tt("这份 PDF 无法打开")}
        </p>
        <p
          className="max-w-md text-[11px] leading-relaxed text-white/75"
          data-pdf-failure-code={editor.failure?.code}
        >
          {editor.failure?.message || editor.error || tt("PDF 加载失败")}
        </p>
        <p className="text-[10px] text-white/50">
          {tt("加密或损坏的 PDF 不会进入可标注状态，你的既有批注没有被丢弃。")}
        </p>
      </div>
    );
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => event.currentTarget.focus()}
      data-pdf-reader-state={editor.readerState}
      className="flex h-full min-h-0 flex-col focus-visible:outline-2"
      style={{
        background: PDF_READER_PALETTE["reader.canvas"],
        outlineColor: accent,
      }}
    >
      {editor.readerState === "image-only" && (
        <p
          data-pdf-no-text-layer
          role="status"
          className="shrink-0 px-4 py-1.5 text-center text-[11px] text-white"
          style={{ background: PDF_READER_PALETTE["reader.chrome"] }}
        >
          {tt("此文档无文本层")}
          <span className="pl-2 text-white/60">
            {tt("只能按页浏览与标注，无法全文检索或复制文字。")}
          </span>
        </p>
      )}
      <div
        ref={viewportRef}
        className="flex min-h-0 flex-1 overflow-auto"
        style={{ padding: `${PDF_READER_LAYOUT.pageGap}px` }}
      >
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
            width={editor.pageCount > 0 ? undefined : 0}
            height={editor.pageCount > 0 ? undefined : 0}
            aria-label={tt("PDF 第 {page} 页", { page: editor.pageNumber })}
            className="block max-w-none origin-top-left transition-transform duration-75"
            style={{
              transform: `scale(${visualScale})`,
              background: PDF_READER_PALETTE["reader.page"],
              boxShadow: `0 ${PDF_READER_LAYOUT.pageShadowSpread * 2}px ${
                PDF_READER_LAYOUT.pageShadowSpread * 8
              }px rgba(0,0,0,.35)`,
            }}
            hidden={editor.pageCount < 1 && !editor.loading}
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
                        annotation.kind === "text"
                          ? `${PDF_READER_LAYOUT.minimumHitTarget}px`
                          : undefined,
                      minHeight:
                        annotation.kind === "text"
                          ? `${PDF_READER_LAYOUT.minimumHitTarget}px`
                          : undefined,
                      background:
                        annotation.kind === "highlight"
                          ? `${annotation.color}66`
                          : annotation.color,
                      boxShadow: selected
                        ? `0 0 0 2px ${PDF_READER_PALETTE["annot.selected"]}`
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
      <div
        className="flex shrink-0 items-center gap-2 px-4 text-white"
        style={{
          height: `${PDF_READER_LAYOUT.toolbarHeight}px`,
          background: PDF_READER_PALETTE["reader.chrome"],
        }}
      >
        <button
          type="button"
          aria-label={tt("上一页")}
          title={tt("上一页")}
          disabled={editor.loading || editor.pageNumber <= 1}
          onClick={editor.previousPage}
          className="rounded-lg border border-white/20 px-2.5 py-1.5 text-[11px] disabled:opacity-40"
        >
          ←
        </button>
        <span
          className="min-w-20 text-center text-[11px] tabular-nums"
          data-pdf-page-indicator
          data-pdf-page-number={editor.pageNumber > 0 ? editor.pageNumber : undefined}
          data-pdf-page-count={editor.pageCount > 0 ? editor.pageCount : undefined}
        >
          {editor.pageCount > 0
            ? `${editor.pageNumber} / ${editor.pageCount}`
            : editor.loading
              ? "…"
              : "—"}
        </span>
        <button
          type="button"
          aria-label={tt("下一页")}
          title={tt("下一页")}
          disabled={editor.loading || editor.pageNumber >= editor.pageCount}
          onClick={editor.nextPage}
          className="rounded-lg border border-white/20 px-2.5 py-1.5 text-[11px] disabled:opacity-40"
        >
          →
        </button>
        {/* §2.4 SC 2.1.1 / SC 2.4.5: page-number jump, the first of the two
            required ways to locate a page. The rail in PdfControls is the second. */}
        <form
          className="flex items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            const target = Number.parseInt(pageInput, 10);
            if (Number.isFinite(target)) editor.goToPage(target);
            setPageInput("");
          }}
        >
          <input
            type="number"
            min={1}
            max={Math.max(1, editor.pageCount)}
            value={pageInput}
            data-pdf-page-jump
            onChange={(event) => setPageInput(event.target.value)}
            placeholder={tt("跳页")}
            aria-label={tt("跳转到指定页")}
            className="w-16 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[11px] tabular-nums text-white placeholder:text-white/40"
          />
        </form>
        <span className="min-w-0 flex-1 truncate px-2 text-[11px]">
          {editor.error ? (
            <span className="text-red-300">{editor.error}</span>
          ) : editor.notice ? (
            <span className="text-emerald-300">{editor.notice}</span>
          ) : (
            <span className="text-white/60">
              {tt("方向键翻页 · Home/End 首末页 · Ctrl + / − 缩放 · Ctrl+Z 撤销")}
            </span>
          )}
        </span>
        <button
          type="button"
          onClick={() => fit("width")}
          className="rounded-lg border border-white/20 px-2 py-1 text-[10px]"
        >
          {tt("适宽")}
        </button>
        <button
          type="button"
          onClick={() => fit("page")}
          className="rounded-lg border border-white/20 px-2 py-1 text-[10px]"
        >
          {tt("适页")}
        </button>
        <span
          className="rounded-md px-2 py-1 text-[10px] font-medium tabular-nums"
          style={{
            color: PDF_READER_PALETTE["reader.accent"],
            background: `${PDF_READER_PALETTE["reader.accent"]}22`,
          }}
        >
          {editor.zoom}%
        </span>
      </div>
    </div>
  );
}
