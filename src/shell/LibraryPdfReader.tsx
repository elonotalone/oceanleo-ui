"use client";

/**
 * Library PDF preview: OceanLeo's own read-only reader on the EmbedPDF (PDFium)
 * engine.
 *
 * It replaces an iframe on the PDF URL that handed the file to the browser's
 * built-in viewer, whose annotate / draw / download tools never saved anything
 * back. Here the bytes are fetched through the media proxy, rendered page by
 * page into canvases, and nothing offers to edit, print or download — the
 * existing pencil button on the Library detail is the way into the editor.
 */
import { useEffect, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  openPdfEngineDocument,
  paintImageData,
  type PdfEngineDocument,
} from "./media-editors/pdf-engine-host";
import { pdfErrorMessage } from "./media-editors/pdf-workbench-utils";

const MAX_PAGE_CSS_WIDTH = 900;
const SIDE_PADDING = 32;

function PageCanvas({
  opened,
  index,
  cssWidth,
}: {
  opened: PdfEngineDocument;
  index: number;
  cssWidth: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);
  const page = opened.doc.pages[index];
  const height = Math.round((cssWidth * page.size.height) / page.size.width);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !canvas || cssWidth < 1) return;
    let disposed = false;
    const dpr = Math.min(
      typeof window === "undefined" ? 1 : window.devicePixelRatio || 1,
      2,
    );
    void opened.engine
      .renderPageRaw(opened.doc, page, {
        scaleFactor: cssWidth / page.size.width,
        dpr,
        withAnnotations: true,
      })
      .toPromise()
      .then((image) => {
        if (disposed) return;
        paintImageData(canvas, image);
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${height}px`;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [visible, opened, page, cssWidth, height]);

  return (
    <div
      ref={hostRef}
      data-pdf-reader-page={index + 1}
      className="mx-auto bg-white shadow-sm"
      style={{ width: cssWidth, height }}
    >
      {visible ? <canvas ref={canvasRef} className="block" /> : null}
    </div>
  );
}

export function LibraryPdfReader({
  title,
  loadBlob,
  onRetry,
}: {
  title: string;
  loadBlob: (signal: AbortSignal) => Promise<Blob>;
  onRetry?: () => void;
}) {
  const tt = useUI();
  const [opened, setOpened] = useState<PdfEngineDocument | null>(null);
  const [error, setError] = useState("");
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The loader closes over the item; only its identity-by-content matters.
  const loadRef = useRef(loadBlob);
  loadRef.current = loadBlob;

  useEffect(() => {
    let disposed = false;
    let current: PdfEngineDocument | null = null;
    const abort = new AbortController();
    setOpened(null);
    setError("");
    void (async () => {
      try {
        const blob = await loadRef.current(abort.signal);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const next = await openPdfEngineDocument(bytes);
        if (disposed) {
          void next.close();
          return;
        }
        current = next;
        setOpened(next);
      } catch (caught) {
        if (disposed) return;
        setError(pdfErrorMessage(caught, tt("这份 PDF 打不开。")) || tt("这份 PDF 打不开。"));
      }
    })();
    return () => {
      disposed = true;
      abort.abort();
      void current?.close();
    };
    // `tt` only words the fallback message.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [opened]);

  if (error) {
    return (
      <div
        role="alert"
        className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-4 text-center"
      >
        <p className="max-w-md text-[13px] leading-relaxed text-stone-500">
          {error}
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-[12px] text-stone-600 hover:bg-stone-50"
          >
            {tt("重试")}
          </button>
        ) : null}
      </div>
    );
  }
  if (!opened) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 p-4">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
        <p className="text-[13px] text-stone-400">{tt("正在打开这份素材…")}</p>
      </div>
    );
  }
  const cssWidth = Math.max(
    1,
    Math.min(MAX_PAGE_CSS_WIDTH, width - SIDE_PADDING),
  );
  return (
    <div
      ref={containerRef}
      data-library-pdf-reader=""
      aria-label={title}
      className="h-full min-h-[560px] w-full overflow-y-auto bg-stone-100 px-4 py-4"
    >
      <p className="sr-only">
        {tt("共 {count} 页", { count: String(opened.numPages) })}
      </p>
      <div className="flex flex-col gap-3">
        {width > 0
          ? opened.doc.pages.map((_, index) => (
              <PageCanvas
                key={index}
                opened={opened}
                index={index}
                cssWidth={cssWidth}
              />
            ))
          : null}
      </div>
    </div>
  );
}

export default LibraryPdfReader;
