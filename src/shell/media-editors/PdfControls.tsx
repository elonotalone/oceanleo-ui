"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import {
  AdvancedEditorIcon,
  type WorkbenchIconName,
} from "../AdvancedEditorIcon";
import type { PdfWorkbenchState } from "./use-pdf-workbench";
import {
  PDF_READER_LAYOUT,
  PDF_READER_PALETTE,
} from "./pdf-workbench-utils";

/**
 * §2.4 SC 2.4.5 — the thumbnail rail, the second required way to locate a
 * page. F8 forbids substituting a designed cover, so each cell renders the
 * real page through the editor's pdf.js document.
 */
function PdfThumbnailRail({ editor }: { editor: PdfWorkbenchState }) {
  const tt = useUI();
  const pages = useMemo(
    () => Array.from({ length: editor.pageCount }, (_, index) => index + 1),
    [editor.pageCount],
  );
  return (
    <div
      data-pdf-thumbnail-rail
      className="space-y-3 overflow-y-auto"
      style={{
        width: `${PDF_READER_LAYOUT.thumbnailRailWidth}px`,
        maxHeight: "320px",
        rowGap: `${PDF_READER_LAYOUT.thumbnailGap}px`,
      }}
    >
      {pages.map((page) => (
        <button
          key={page}
          type="button"
          aria-current={page === editor.pageNumber}
          aria-label={tt("跳到第 {page} 页", { page })}
          onClick={() => editor.goToPage(page)}
          className="block w-full rounded-lg border p-1 text-left text-[10px] tabular-nums"
          style={{
            borderColor:
              page === editor.pageNumber
                ? PDF_READER_PALETTE["reader.accent"]
                : "var(--border,#e7e5e4)",
            minHeight: `${PDF_READER_LAYOUT.minimumHitTarget}px`,
          }}
        >
          <PdfThumbnail editor={editor} page={page} />
          <span className="block pt-1 text-center">{page}</span>
        </button>
      ))}
    </div>
  );
}

function PdfThumbnail({
  editor,
  page,
}: {
  editor: PdfWorkbenchState;
  page: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    void editor.renderPageThumbnail(page, canvas).catch(() => undefined);
    return () => {
      disposed = true;
      void disposed;
    };
  }, [editor, page]);
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="mx-auto block"
      style={{
        width: `${PDF_READER_LAYOUT.thumbnailPageWidth}px`,
        background: PDF_READER_PALETTE["reader.page"],
      }}
    />
  );
}

/** §2.4 SC 2.4.5 — full-text search, required whenever a text layer exists. */
function PdfFullTextSearch({ editor }: { editor: PdfWorkbenchState }) {
  const tt = useUI();
  const [query, setQuery] = useState("");
  const hits = useMemo(
    () => (query.trim() ? editor.searchFullText(query) : []),
    [editor, query],
  );
  if (editor.readerState === "image-only") {
    return (
      <p className="text-[10px] text-[var(--muted,#78716c)]">
        {tt("此文档无文本层，无法全文检索。")}
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <input
        type="search"
        value={query}
        data-pdf-full-text-search
        onChange={(event) => setQuery(event.target.value)}
        placeholder={tt("全文检索")}
        aria-label={tt("全文检索")}
        className="w-full rounded-xl border border-[var(--border,#e7e5e4)] px-2.5 py-2 text-[11px] outline-none focus:border-[var(--accent,#7c3aed)]"
      />
      {query.trim() && hits.length === 0 ? (
        <p className="text-[10px] text-[var(--muted,#78716c)]">
          {tt("没有找到匹配的文字。")}
        </p>
      ) : null}
      <ul className="max-h-40 space-y-1 overflow-y-auto">
        {hits.slice(0, 40).map((hit) => (
          <li key={`${hit.pageNumber}:${hit.offset}`}>
            <button
              type="button"
              onClick={() => editor.goToPage(hit.pageNumber)}
              className="w-full rounded-lg px-2 py-1 text-left text-[10px] leading-relaxed hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
              style={{ minHeight: `${PDF_READER_LAYOUT.minimumHitTarget}px` }}
            >
              <span className="font-semibold tabular-nums">
                {tt("第 {page} 页", { page: hit.pageNumber })}
              </span>
              <span className="pl-1.5 text-[var(--muted,#78716c)]">
                {hit.excerpt}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ControlButton({
  children,
  icon,
  iconOnly = false,
  onClick,
  disabled,
  title,
  active = false,
}: {
  children?: ReactNode;
  icon?: WorkbenchIconName;
  iconOnly?: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active || undefined}
      className={`rounded-xl border bg-[var(--card,#fff)] text-[11px] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))] disabled:opacity-40 ${
        iconOnly ? "grid h-9 w-9 place-items-center p-0" : "px-2.5 py-2"
      } ${
        active
          ? "border-[var(--accent,#7c3aed)] text-[var(--accent,#7c3aed)]"
          : "border-[var(--border,#e7e5e4)] text-[var(--fg-2,#57534e)]"
      }`}
    >
      {icon ? <AdvancedEditorIcon name={icon} /> : children}
      {icon && children ? <span className="sr-only">{children}</span> : null}
    </button>
  );
}

export function PdfControls({
  editor,
}: {
  editor: PdfWorkbenchState;
}) {
  const tt = useUI();
  const mergeInputRef = useRef<HTMLInputElement | null>(null);
  const busy = editor.loading || editor.processing || editor.saving;

  return (
    <div className="min-h-full space-y-4 overflow-y-auto bg-[var(--card,#fff)] p-4">
      <section className="space-y-2">
        <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">
          {tt("页面")}
        </p>
        <div className="flex items-center gap-1.5">
          <ControlButton
            icon="add"
            iconOnly
            title={tt("添加空白页")}
            disabled={busy}
            onClick={() => void editor.addBlankPage()}
          >
            {tt("添加空白页")}
          </ControlButton>
          <ControlButton
            icon="pages"
            iconOnly
            title={tt("合并另一个 PDF 到末尾")}
            disabled={busy}
            onClick={() => mergeInputRef.current?.click()}
          >
            {tt("合并另一个 PDF 到末尾")}
          </ControlButton>
        </div>
        <input
          ref={mergeInputRef}
          type="file"
          accept="application/pdf,.pdf"
          aria-label={tt("合并另一个 PDF 到末尾")}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void editor.mergePdf(file, "append");
          }}
        />
        <p className="text-[10px] leading-relaxed text-[var(--muted,#78716c)]">
          {tt("选择当前页后，旋转、排序、提取和删除会出现在页面上方。")}
        </p>
        <label className="flex items-center gap-1.5 text-[10px] text-[var(--muted,#78716c)]">
          {tt("缩放")}
          <select
            value={editor.zoom}
            data-pdf-zoom-stops
            disabled={busy}
            onChange={(event) => editor.setZoom(Number(event.target.value))}
            className="rounded-lg border border-[var(--border,#e7e5e4)] px-1.5 py-1 text-[10px] tabular-nums"
          >
            {editor.zoomStops.map((stop) => (
              <option key={stop} value={stop}>
                {stop}%
              </option>
            ))}
            {editor.zoomStops.includes(editor.zoom) ? null : (
              <option value={editor.zoom}>{editor.zoom}%</option>
            )}
          </select>
        </label>
        <PdfThumbnailRail editor={editor} />
      </section>

      <section className="space-y-2 border-t border-[var(--border,#e7e5e4)] pt-3">
        <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">
          {tt("查找")}
        </p>
        <PdfFullTextSearch editor={editor} />
      </section>

      <section className="space-y-2 border-t border-[var(--border,#e7e5e4)] pt-3">
        <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">
          {tt("批注")}
        </p>
        <input
          type="text"
          value={editor.annotationText}
          disabled={busy}
          onChange={(event) => editor.setAnnotationText(event.target.value)}
          placeholder={tt("批注内容")}
          aria-label={tt("批注内容")}
          className="w-full rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-2.5 py-2 text-[11px] text-[var(--fg,#292524)] outline-none focus:border-[var(--accent,#7c3aed)] disabled:opacity-40"
        />
        <div className="flex items-center gap-1.5">
          <ControlButton
            icon="select"
            iconOnly
            title={tt("选择和移动批注")}
            active={editor.annotationTool === "select"}
            disabled={busy}
            onClick={() => editor.setAnnotationTool("select")}
          >
            {tt("选择和移动批注")}
          </ControlButton>
          <ControlButton
            icon="note"
            iconOnly
            title={tt("点画布放置文字批注")}
            active={editor.annotationTool === "text"}
            disabled={busy || !editor.annotationText.trim()}
            onClick={() => editor.setAnnotationTool("text")}
          >
            {tt("点画布放置文字批注")}
          </ControlButton>
          <ControlButton
            icon="draw"
            iconOnly
            title={tt("拖画高亮批注")}
            active={editor.annotationTool === "highlight"}
            disabled={busy}
            onClick={() => editor.setAnnotationTool("highlight")}
          >
            {tt("拖画高亮批注")}
          </ControlButton>
        </div>
        {/* §2.4 SC 2.1.1 — the fourth keyboard route: reach any annotation on
            the page by tabbing this list, no pointer required. */}
        <ul data-pdf-annotation-list className="space-y-1">
          {editor.annotations.map((annotation, index) => (
            <li key={annotation.id}>
              <button
                type="button"
                aria-pressed={annotation.id === editor.selectedAnnotationId}
                onClick={() => editor.selectAnnotation(annotation.id)}
                className="w-full truncate rounded-lg border px-2 py-1 text-left text-[10px]"
                style={{
                  minHeight: `${PDF_READER_LAYOUT.minimumHitTarget}px`,
                  borderColor:
                    annotation.id === editor.selectedAnnotationId
                      ? PDF_READER_PALETTE["annot.selected"]
                      : "var(--border,#e7e5e4)",
                }}
              >
                <span
                  aria-hidden
                  className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                  style={{
                    background:
                      annotation.kind === "highlight"
                        ? PDF_READER_PALETTE["annot.highlight"]
                        : PDF_READER_PALETTE["annot.text.marker"],
                  }}
                />
                {annotation.contents ||
                  tt(
                    annotation.kind === "highlight"
                      ? "高亮 {number}"
                      : "文字批注 {number}",
                    { number: index + 1 },
                  )}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
