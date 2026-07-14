"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefCallback,
} from "react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";
import { useUI } from "../../i18n/ui/useUI";
import { saveWorks, uploadFile } from "../../lib/database";
import {
  fetchMediaBlob,
  importMediaUrl,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import type { LibraryItem } from "../library-data";
import {
  addBlankPdfPage,
  deletePdfPage,
  extractPdfPages,
  inspectPdf,
  mergePdfBytes,
  movePdfPage,
  rotatePdfPage,
} from "./pdf-operations";
import {
  appendPdfHistory,
  clamp,
  downloadPdfBytes,
  pdfErrorMessage,
  pdfFileStem,
  type PdfSnapshot,
} from "./pdf-workbench-utils";
const MAX_PDF_BYTES = 256 * 1024 * 1024;
const MIN_ZOOM = 25;
const MAX_ZOOM = 300;
type PdfMutation = (
  bytes: Uint8Array,
) => Promise<{ bytes: Uint8Array; pageNumber?: number; notice: string }>;
export interface PdfWorkbenchState {
  canvasRef: RefCallback<HTMLCanvasElement>;
  sourceUrl: string;
  pageNumber: number;
  pageCount: number;
  rotation: number;
  zoom: number;
  loading: boolean;
  rendering: boolean;
  processing: boolean;
  saving: boolean;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  error: string;
  notice: string;
  savedUrl: string;
  goToPage: (pageNumber: number) => void;
  previousPage: () => void;
  nextPage: () => void;
  setZoom: (percent: number) => void;
  zoomBy: (delta: number) => void;
  rotateCurrentPage: (direction?: 1 | -1) => Promise<void>;
  movePage: (fromPage: number, toPage: number) => Promise<void>;
  moveCurrentPage: (offset: 1 | -1) => Promise<void>;
  deleteCurrentPage: () => Promise<void>;
  addBlankPage: () => Promise<void>;
  mergePdf: (file: File, position?: "append" | "after-current") => Promise<void>;
  extractPages: (pageNumbers?: readonly number[]) => Promise<void>;
  undo: () => void;
  redo: () => void;
  download: () => void;
  saveCopy: () => Promise<string | null>;
}
export function usePdfWorkbench(
  item: LibraryItem,
  siteId = "",
  onSaved?: (url: string) => void,
): PdfWorkbenchState {
  const tt = useUI();
  const bytesRef = useRef<Uint8Array | null>(null);
  const pdfDocumentRef = useRef<PDFDocumentProxy | null>(null);
  const processingRef = useRef(false);
  const processingTokenRef = useRef(0);
  const savingRef = useRef(false);
  const savingTokenRef = useRef(0);
  const aliveRef = useRef(true);
  const sourceGenerationRef = useRef(0);
  const revisionRef = useRef(0);
  const undoRef = useRef<PdfSnapshot[]>([]);
  const redoRef = useRef<PdfSnapshot[]>([]);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoomState] = useState(100);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [documentRevision, setDocumentRevision] = useState(0);
  const [previewRevision, setPreviewRevision] = useState(0);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      sourceGenerationRef.current += 1;
      processingTokenRef.current += 1;
      savingTokenRef.current += 1;
    };
  }, []);

  const canvasRef = useCallback<RefCallback<HTMLCanvasElement>>((node) => {
    setCanvas(node);
  }, []);

  useEffect(() => {
    const source = item.url || item.previewUrl || "";
    const generation = ++sourceGenerationRef.current;
    const controller = new AbortController();
    processingTokenRef.current += 1;
    savingTokenRef.current += 1;
    processingRef.current = false;
    savingRef.current = false;
    bytesRef.current = null;
    revisionRef.current = 0;
    undoRef.current = [];
    redoRef.current = [];
    setDocumentRevision((value) => value + 1);
    setSourceUrl("");
    setSourceLoading(true);
    setPageNumber(1);
    setPageCount(0);
    setRotation(0);
    setProcessing(false);
    setSaving(false);
    setDirty(false);
    setCanUndo(false);
    setCanRedo(false);
    setSavedUrl("");
    setNotice("");
    setError("");
    if (!source) {
      setSourceLoading(false);
      setError(tt("没有可加载的 PDF 地址"));
      return () => controller.abort();
    }
    void (async () => {
      try {
        const durableUrl = isFirstPartyMediaUrl(source)
          ? source
          : await importMediaUrl(source, {
              kind: "file",
              siteId: siteId || "oceanleo",
              title: item.title,
              registerAsset: true,
            });
        if (controller.signal.aborted || generation !== sourceGenerationRef.current) return;
        const blob = await fetchMediaBlob(durableUrl, {
          maxBytes: MAX_PDF_BYTES,
          signal: controller.signal,
        });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const count = await inspectPdf(bytes);
        if (count < 1) throw new Error(tt("PDF 没有可显示的页面"));
        if (controller.signal.aborted || generation !== sourceGenerationRef.current) return;
        bytesRef.current = bytes;
        setSourceUrl(durableUrl);
        setPageCount(count);
        setDocumentRevision((value) => value + 1);
      } catch (caught) {
        if (!controller.signal.aborted && generation === sourceGenerationRef.current) {
          setError(pdfErrorMessage(caught, tt("PDF 加载失败")));
        }
      } finally {
        if (!controller.signal.aborted && generation === sourceGenerationRef.current) {
          setSourceLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [item.previewUrl, item.title, item.url, siteId, tt]);

  useEffect(() => {
    let disposed = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let loadedDocument: PDFDocumentProxy | null = null;
    const bytes = bytesRef.current;
    pdfDocumentRef.current = null;
    setPreviewRevision((value) => value + 1);
    if (!bytes) {
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.min.mjs",
            import.meta.url,
          ).toString();
        }
        if (disposed) return;
        loadingTask = pdfjs.getDocument({
          data: Uint8Array.from(bytes),
          stopAtErrors: true,
          isEvalSupported: false,
        });
        loadedDocument = await loadingTask.promise;
        if (disposed) {
          await loadedDocument.destroy();
          return;
        }
        pdfDocumentRef.current = loadedDocument;
        setPageCount(loadedDocument.numPages);
        setPageNumber((value) => clamp(value, 1, loadedDocument?.numPages || 1));
        setPreviewRevision((value) => value + 1);
      } catch (caught) {
        if (!disposed) setError(pdfErrorMessage(caught, tt("PDF 预览引擎加载失败")));
      } finally {
        if (!disposed) setPreviewLoading(false);
      }
    })();
    return () => {
      disposed = true;
      pdfDocumentRef.current = null;
      const destroying = loadingTask
        ? loadingTask.destroy()
        : loadedDocument
          ? loadedDocument.destroy()
          : null;
      void destroying?.catch(() => undefined);
    };
  }, [documentRevision, tt]);

  useEffect(() => {
    const documentProxy = pdfDocumentRef.current;
    if (!canvas || !documentProxy || pageCount < 1) {
      setRendering(false);
      return;
    }
    let disposed = false;
    let page: PDFPageProxy | null = null;
    let renderTask: RenderTask | null = null;
    setRendering(true);
    setError("");
    void (async () => {
      try {
        page = await documentProxy.getPage(clamp(pageNumber, 1, documentProxy.numPages));
        if (disposed) return;
        const viewport = page.getViewport({ scale: zoom / 100 });
        const pixelRatio = clamp(window.devicePixelRatio || 1, 1, 2);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error(tt("浏览器无法创建 PDF 画布"));
        canvas.width = Math.max(1, Math.floor(viewport.width * pixelRatio));
        canvas.height = Math.max(1, Math.floor(viewport.height * pixelRatio));
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
          background: "#ffffff",
        });
        await renderTask.promise;
        if (!disposed) setRotation(((page.rotate % 360) + 360) % 360);
      } catch (caught) {
        const name = caught instanceof Error ? caught.name : "";
        if (!disposed && name !== "RenderingCancelledException") {
          setError(pdfErrorMessage(caught, tt("PDF 页面渲染失败")));
        }
      } finally {
        if (!disposed) setRendering(false);
      }
    })();
    return () => {
      disposed = true;
      renderTask?.cancel();
      page?.cleanup();
    };
  }, [canvas, pageCount, pageNumber, previewRevision, tt, zoom]);

  const runMutation = useCallback(
    async (mutation: PdfMutation) => {
      const current = bytesRef.current;
      if (!current || processingRef.current) return;
      processingRef.current = true;
      const processingToken = ++processingTokenRef.current;
      setProcessing(true);
      setError("");
      setNotice("");
      const generation = sourceGenerationRef.current;
      const before: PdfSnapshot = {
        bytes: Uint8Array.from(current),
        pageNumber,
        pageCount,
      };
      try {
        const result = await mutation(Uint8Array.from(current));
        const count = await inspectPdf(result.bytes);
        if (!aliveRef.current || generation !== sourceGenerationRef.current) return;
        undoRef.current = appendPdfHistory(undoRef.current, before);
        redoRef.current = [];
        revisionRef.current += 1;
        bytesRef.current = result.bytes;
        setPageCount(count);
        setPageNumber(clamp(result.pageNumber || pageNumber, 1, count));
        setDirty(true);
        setCanUndo(undoRef.current.length > 0);
        setCanRedo(false);
        setSavedUrl("");
        setNotice(result.notice);
        setDocumentRevision((value) => value + 1);
      } catch (caught) {
        if (aliveRef.current && generation === sourceGenerationRef.current) {
          setError(pdfErrorMessage(caught, tt("PDF 处理失败")));
        }
      } finally {
        if (processingToken === processingTokenRef.current) {
          processingRef.current = false;
        }
        if (
          aliveRef.current &&
          generation === sourceGenerationRef.current &&
          processingToken === processingTokenRef.current
        ) {
          setProcessing(false);
        }
      }
    },
    [pageCount, pageNumber, tt],
  );

  const restoreSnapshot = useCallback((snapshot: PdfSnapshot, noticeText: string) => {
    bytesRef.current = snapshot.bytes;
    revisionRef.current += 1;
    setPageCount(snapshot.pageCount);
    setPageNumber(clamp(snapshot.pageNumber, 1, snapshot.pageCount));
    setDirty(true);
    setSavedUrl("");
    setError("");
    setNotice(noticeText);
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
    setDocumentRevision((value) => value + 1);
  }, []);

  const undo = useCallback(() => {
    const current = bytesRef.current;
    const previous = undoRef.current.pop();
    if (!current || !previous || processingRef.current) return;
    redoRef.current = appendPdfHistory(
      redoRef.current,
      {
        bytes: Uint8Array.from(current),
        pageNumber,
        pageCount,
      },
      undoRef.current,
    );
    restoreSnapshot(previous, tt("已撤销上一步"));
  }, [pageCount, pageNumber, restoreSnapshot, tt]);

  const redo = useCallback(() => {
    const current = bytesRef.current;
    const next = redoRef.current.pop();
    if (!current || !next || processingRef.current) return;
    undoRef.current = appendPdfHistory(
      undoRef.current,
      {
        bytes: Uint8Array.from(current),
        pageNumber,
        pageCount,
      },
      redoRef.current,
    );
    restoreSnapshot(next, tt("已重做"));
  }, [pageCount, pageNumber, restoreSnapshot, tt]);

  const goToPage = useCallback(
    (value: number) => setPageNumber(clamp(Math.round(value), 1, Math.max(1, pageCount))),
    [pageCount],
  );

  const rotateCurrentPage = useCallback(
    async (direction: 1 | -1 = 1) => {
      await runMutation(async (bytes) => ({
        bytes: await rotatePdfPage(bytes, pageNumber - 1, direction * 90),
        pageNumber,
        notice: tt("当前页已旋转"),
      }));
    },
    [pageNumber, runMutation, tt],
  );

  const movePage = useCallback(
    async (fromPage: number, toPage: number) => {
      await runMutation(async (bytes) => ({
        bytes: await movePdfPage(bytes, fromPage - 1, toPage - 1),
        pageNumber: toPage,
        notice: tt("页面顺序已更新"),
      }));
    },
    [runMutation, tt],
  );

  const deleteCurrentPage = useCallback(async () => {
    await runMutation(async (bytes) => ({
      bytes: await deletePdfPage(bytes, pageNumber - 1),
      pageNumber: Math.min(pageNumber, pageCount - 1),
      notice: tt("当前页已删除"),
    }));
  }, [pageCount, pageNumber, runMutation, tt]);

  const addBlankPage = useCallback(async () => {
    await runMutation(async (bytes) => ({
      bytes: await addBlankPdfPage(bytes, pageNumber - 1),
      pageNumber: pageNumber + 1,
      notice: tt("已在当前页后添加空白页"),
    }));
  }, [pageNumber, runMutation, tt]);

  const mergePdf = useCallback(
    async (file: File, position: "append" | "after-current" = "append") => {
      if (file.size > MAX_PDF_BYTES) {
        setError(tt("要合并的 PDF 过大，无法在浏览器内存中安全处理"));
        return;
      }
      await runMutation(async (bytes) => {
        const incoming = new Uint8Array(await file.arrayBuffer());
        const after = position === "after-current" ? pageNumber - 1 : undefined;
        const merged = await mergePdfBytes(bytes, incoming, after);
        return {
          bytes: merged.bytes,
          pageNumber:
            position === "after-current" ? pageNumber + 1 : pageNumber,
          notice: tt("已合并 {count} 页", { count: merged.insertedCount }),
        };
      });
    },
    [pageNumber, runMutation, tt],
  );

  const extractPages = useCallback(
    async (pageNumbers: readonly number[] = [pageNumber]) => {
      const current = bytesRef.current;
      if (!current || processingRef.current) return;
      processingRef.current = true;
      const processingToken = ++processingTokenRef.current;
      setProcessing(true);
      setError("");
      const generation = sourceGenerationRef.current;
      try {
        const extracted = await extractPdfPages(
          current,
          pageNumbers.map((value) => value - 1),
        );
        if (!aliveRef.current || generation !== sourceGenerationRef.current) return;
        const suffix =
          pageNumbers.length === 1
            ? `page-${pageNumbers[0]}`
            : `pages-${pageNumbers.join("-")}`;
        downloadPdfBytes(extracted, `${pdfFileStem(item.title)}-${suffix}.pdf`);
        setNotice(tt("所选页面已提取并下载"));
      } catch (caught) {
        if (aliveRef.current && generation === sourceGenerationRef.current) {
          setError(pdfErrorMessage(caught, tt("提取页面失败")));
        }
      } finally {
        if (processingToken === processingTokenRef.current) {
          processingRef.current = false;
          if (aliveRef.current) setProcessing(false);
        }
      }
    },
    [item.title, pageNumber, tt],
  );

  const download = useCallback(() => {
    if (bytesRef.current) {
      downloadPdfBytes(bytesRef.current, `${pdfFileStem(item.title)}-edited.pdf`);
    }
  }, [item.title]);
  const saveCopy = useCallback(async (): Promise<string | null> => {
    const bytes = bytesRef.current;
    if (!bytes || savingRef.current) return null;
    const generation = sourceGenerationRef.current;
    const savingRevision = revisionRef.current;
    const savingToken = ++savingTokenRef.current;
    savingRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const title = `${pdfFileStem(item.title)}-${tt("编辑版")}`;
      const file = new File([Uint8Array.from(bytes)], `${title}.pdf`, {
        type: "application/pdf",
      });
      const uploaded = await uploadFile(file, {
        siteId: siteId || "oceanleo",
        title,
      });
      const url = uploaded.data?.file?.url || "";
      if (!uploaded.ok || !url) throw new Error(uploaded.error || tt("PDF 上传失败"));
      const saved = await saveWorks(siteId || "oceanleo", [
        {
          url,
          media_type: "doc",
          title,
          kind: "pdf",
          meta: {
            parent_asset_id: item.id,
            editor: "pdf-native-v1",
            page_count: pageCount,
          },
        },
      ]);
      if (!saved.ok || Number(saved.data?.saved || 0) !== 1) {
        throw new Error(saved.error || tt("PDF 已上传，但登记到我的库失败"));
      }
      if (!aliveRef.current || generation !== sourceGenerationRef.current) return null;
      setSavedUrl(url);
      if (revisionRef.current === savingRevision) {
        setDirty(false);
        setNotice(tt("已保存到我的库"));
      } else {
        setNotice(tt("已保存一个版本；之后的修改仍未保存"));
      }
      onSaved?.(url);
      return url;
    } catch (caught) {
      if (aliveRef.current && generation === sourceGenerationRef.current) {
        setError(pdfErrorMessage(caught, tt("保存 PDF 副本失败")));
      }
      return null;
    } finally {
      if (savingToken === savingTokenRef.current) {
        savingRef.current = false;
        if (aliveRef.current) setSaving(false);
      }
    }
  }, [item.id, item.title, onSaved, pageCount, siteId, tt]);

  return {
    canvasRef,
    sourceUrl,
    pageNumber,
    pageCount,
    rotation,
    zoom,
    loading: sourceLoading || previewLoading,
    rendering,
    processing,
    saving,
    dirty,
    canUndo,
    canRedo,
    error,
    notice,
    savedUrl,
    goToPage,
    previousPage: () => goToPage(pageNumber - 1),
    nextPage: () => goToPage(pageNumber + 1),
    setZoom: (value) => setZoomState(clamp(Math.round(value), MIN_ZOOM, MAX_ZOOM)),
    zoomBy: (delta) =>
      setZoomState((value) => clamp(value + delta, MIN_ZOOM, MAX_ZOOM)),
    rotateCurrentPage,
    movePage,
    moveCurrentPage: async (offset) => {
      const target = clamp(pageNumber + offset, 1, pageCount);
      if (target !== pageNumber) await movePage(pageNumber, target);
    },
    deleteCurrentPage,
    addBlankPage,
    mergePdf,
    extractPages,
    undo,
    redo,
    download,
    saveCopy,
  };
}
