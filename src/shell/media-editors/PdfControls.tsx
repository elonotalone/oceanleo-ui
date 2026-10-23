"use client";

/**
 * PDF 左侧页面栏（D4 页面整理）：每页一张真实缩略图（同一个查看器渲染，含批注）。
 * 鼠标移到一页上出现「旋转」「删除」；拖动缩略图即可排序。三件事都写进文件、都能
 * 撤销（`use-pdf-workbench` 的页面整理栈）。多人同改只读时整栏只能看、能跳页。
 */
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { AdvancedEditorIcon } from "../AdvancedEditorIcon";

export interface PdfPageRailProps {
  pageCount: number;
  currentPage: number;
  /** 页面内容变了（批注、整理、换文档）就加一，缩略图跟着重画。 */
  version: number;
  /** 每页的宽高比（高/宽），没有就按 A4。 */
  aspect: (pageIndex: number) => number;
  renderThumb: (pageIndex: number) => Promise<Blob>;
  readOnly: boolean;
  busy: boolean;
  onGoTo: (pageNumber: number) => void;
  onRotate: (pageIndex: number) => void;
  onDelete: (pageIndex: number) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
}

export const PDF_PAGE_RAIL_WIDTH = 132;

function Thumb({
  pageIndex,
  version,
  aspect,
  renderThumb,
}: {
  pageIndex: number;
  version: number;
  aspect: number;
  renderThumb: (pageIndex: number) => Promise<Blob>;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === "undefined");
  const [url, setUrl] = useState("");
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return undefined;
    let alive = true;
    let objectUrl = "";
    renderThumb(pageIndex)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pageIndex, renderThumb, version, visible]);
  return (
    <div
      ref={ref}
      className="w-full overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-[var(--awb-border)]"
      style={{ aspectRatio: `1 / ${aspect}` }}
    >
      {url ? <img src={url} alt="" draggable={false} className="h-full w-full object-contain" /> : null}
    </div>
  );
}

export function PdfControls({
  pageCount,
  currentPage,
  version,
  aspect,
  renderThumb,
  readOnly,
  busy,
  onGoTo,
  onRotate,
  onDelete,
  onMove,
}: PdfPageRailProps) {
  const tt = useUI();
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const locked = readOnly || busy;
  const drop = (event: DragEvent, index: number) => {
    event.preventDefault();
    const from = dragFrom;
    setDragFrom(null);
    setDropAt(null);
    if (from === null || locked || from === index) return;
    onMove(from, index);
  };
  return (
    <nav
      data-pdf-page-rail=""
      data-edit-bar-avoid=""
      aria-label={tt("页面")}
      className="flex h-full shrink-0 flex-col gap-3 overflow-y-auto border-r border-[var(--awb-border)] bg-[var(--awb-chrome-bg)] px-3 py-3"
      style={{ width: PDF_PAGE_RAIL_WIDTH }}
    >
      {Array.from({ length: pageCount }, (_, index) => {
        const page = index + 1;
        const current = page === currentPage;
        return (
          <div
            key={page}
            data-pdf-page-thumb={page}
            draggable={!locked}
            onDragStart={(event) => {
              if (locked) return;
              setDragFrom(index);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", String(page));
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDropAt(null);
            }}
            onDragOver={(event) => {
              if (dragFrom === null || locked) return;
              event.preventDefault();
              setDropAt(index);
            }}
            onDrop={(event) => drop(event, index)}
            className={`group relative rounded-lg p-1 transition ${
              dropAt === index && dragFrom !== index
                ? "ring-2 ring-[var(--awb-accent)]"
                : current
                  ? "ring-2 ring-[var(--awb-accent)]/60"
                  : ""
            } ${dragFrom === index ? "opacity-40" : ""}`}
          >
            <button
              type="button"
              aria-current={current ? "page" : undefined}
              aria-label={tt("跳到第 {page} 页", { page })}
              onClick={() => onGoTo(page)}
              className="block w-full cursor-pointer text-left"
            >
              <Thumb
                pageIndex={index}
                version={version}
                aspect={aspect(index)}
                renderThumb={renderThumb}
              />
              <span className="mt-1 block text-center text-[11px] tabular-nums text-[var(--awb-muted)]">
                {page}
              </span>
            </button>
            {!locked ? (
              <div className="pointer-events-none absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
                <button
                  type="button"
                  data-pdf-page-rotate={page}
                  aria-label={tt("旋转第 {page} 页", { page })}
                  title={tt("顺时针旋转 90°")}
                  onClick={() => onRotate(index)}
                  className="grid h-7 w-7 place-items-center rounded-md bg-[var(--awb-popover-bg)] text-[var(--awb-text)] shadow ring-1 ring-[var(--awb-border)] hover:bg-[var(--awb-hover)]"
                >
                  <AdvancedEditorIcon name="rotate" className="h-4 w-4" />
                </button>
                {pageCount > 1 ? (
                  <button
                    type="button"
                    data-pdf-page-delete={page}
                    aria-label={tt("删除第 {page} 页", { page })}
                    title={tt("删除这一页")}
                    onClick={() => onDelete(index)}
                    className="grid h-7 w-7 place-items-center rounded-md bg-[var(--awb-popover-bg)] text-[var(--awb-danger)] shadow ring-1 ring-[var(--awb-border)] hover:bg-[var(--awb-danger-soft)]"
                  >
                    <AdvancedEditorIcon name="delete" className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
