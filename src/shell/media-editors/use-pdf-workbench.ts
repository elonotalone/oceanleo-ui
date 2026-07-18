"use client";
import { useCallback, useEffect, useRef, useState, type RefCallback } from "react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
} from "pdfjs-dist";
import { useUI } from "../../i18n/ui/useUI";
import type { LibraryItem } from "../library-data";
import { saveFileToLibrary, type PersistedEditorVersion } from "../doc-editors/doc-io";
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
  usePdfAnnotations,
  type PdfMutationResult,
} from "./use-pdf-annotations";
import { loadInitialPdfSource } from "./pdf-source";
import { capturePdfRecovery, decodePdfRecovery } from "./pdf-recovery";
import {
  appendPdfHistory,
  clamp,
  downloadPdfBytes,
  pdfErrorMessage,
  pdfFileStem,
  type PdfSnapshot,
} from "./pdf-workbench-utils";
import type { PdfWorkbenchState } from "./pdf-workbench-state";
export type { PdfWorkbenchState } from "./pdf-workbench-state";
import { usePdfPreviewRender } from "./use-pdf-preview-render";
const MAX_PDF_BYTES = 256 * 1024 * 1024;
const MIN_ZOOM = 25;
const MAX_ZOOM = 300;
type PdfMutation = (bytes: Uint8Array) => Promise<PdfMutationResult>;
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
  const zoomTimerRef = useRef<number | null>(null);
  const undoRef = useRef<PdfSnapshot[]>([]);
  const redoRef = useRef<PdfSnapshot[]>([]);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [zoom, setZoomState] = useState(100);
  const [rasterZoom, setRasterZoom] = useState(100);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
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
  const { rotation, rendering, renderedZoom, pageWidth, pageHeight } =
    usePdfPreviewRender({
      canvas,
      documentProxy: pdfDocumentRef.current,
      pageCount,
      pageNumber,
      revision: previewRevision,
      rasterZoom,
      translate: tt,
      setError,
    });

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      sourceGenerationRef.current += 1;
      processingTokenRef.current += 1;
      savingTokenRef.current += 1;
      if (zoomTimerRef.current !== null) {
        window.clearTimeout(zoomTimerRef.current);
      }
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
    setZoomState(100);
    setRasterZoom(100);
    setSourceUrl("");
    setSourceLoading(true);
    setPageNumber(1);
    setPageCount(0);
    setProcessing(false);
    setSaving(false);
    setDirty(false);
    setCanUndo(false);
    setCanRedo(false);
    setSavedUrl("");
    setNotice("");
    setError("");
    void (async () => {
      try {
        const loaded = await loadInitialPdfSource({
          source,
          siteId,
          title: item.title,
          signal: controller.signal,
        });
        if (loaded.pageCount < 1) throw new Error(tt("PDF 没有可显示的页面"));
        if (controller.signal.aborted || generation !== sourceGenerationRef.current) return;
        bytesRef.current = loaded.bytes;
        setSourceUrl(loaded.durableUrl);
        setPageCount(loaded.pageCount);
        if (loaded.blank) setNotice(tt("已创建一页空白 PDF"));
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
    if (zoomTimerRef.current !== null) {
      window.clearTimeout(zoomTimerRef.current);
    }
    zoomTimerRef.current = window.setTimeout(() => {
      zoomTimerRef.current = null;
      setRasterZoom(zoom);
    }, 180);
    return () => {
      if (zoomTimerRef.current !== null) {
        window.clearTimeout(zoomTimerRef.current);
        zoomTimerRef.current = null;
      }
    };
  }, [zoom]);

  const runMutation = useCallback(
    async (
      mutation: PdfMutation,
    ): Promise<PdfMutationResult | null> => {
      const current = bytesRef.current;
      if (!current || processingRef.current) return null;
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
        if (!aliveRef.current || generation !== sourceGenerationRef.current) {
          return null;
        }
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
        return result;
      } catch (caught) {
        if (aliveRef.current && generation === sourceGenerationRef.current) {
          setError(pdfErrorMessage(caught, tt("PDF 处理失败")));
        }
        return null;
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
  const annotation = usePdfAnnotations({
    bytesRef,
    pageNumber,
    pageCount,
    documentRevision,
    resetKey: `${item.id}:${item.url || item.previewUrl || ""}`,
    runMutation,
    setError,
    tt,
  });

  const restoreSnapshot = useCallback((snapshot: PdfSnapshot, noticeText: string) => {
    bytesRef.current = snapshot.bytes;
    revisionRef.current += 1;
    setPageCount(snapshot.pageCount);
    setPageNumber(clamp(snapshot.pageNumber, 1, snapshot.pageCount));
    setDirty(true);
    setSavedUrl("");
    setError("");
    setNotice(noticeText);
    annotation.clearSelection();
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
    setDocumentRevision((value) => value + 1);
  }, [annotation]);

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
  const saveCopy = useCallback(async (): Promise<PersistedEditorVersion | null> => {
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
      const saved = await saveFileToLibrary({
        item,
        siteId,
        fallbackSite: "oceanleo",
        file,
        title,
        mediaType: "doc",
        kind: "pdf",
        idempotencyKey: `pdf:${item.id}:${savingRevision}`,
        meta: {
          editor: "pdf-native-v1",
          page_count: pageCount,
        },
        deliveryProjectSchema: "pdf-binary@1",
      });
      if (!saved.ok) {
        throw new Error(saved.error || tt("PDF 已上传，但登记到我的库失败"));
      }
      if (!aliveRef.current || generation !== sourceGenerationRef.current) return null;
      setSavedUrl(saved.url);
      if (revisionRef.current === savingRevision) {
        setDirty(false);
      }
      setNotice("");
      onSaved?.(saved.url);
      return {
        url: saved.url,
        versionId: saved.versionId,
        projectUrl: saved.projectUrl,
        projectSchema: saved.projectSchema,
      };
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
  }, [item, onSaved, pageCount, siteId, tt]);

  const captureRecovery = useCallback(
    () => capturePdfRecovery(bytesRef.current),
    [],
  );
  const restoreRecovery = useCallback(
    async (payload: unknown): Promise<boolean> => {
      const recovered = await decodePdfRecovery(payload, MAX_PDF_BYTES);
      if (!recovered) return false;
      bytesRef.current = recovered.bytes;
      undoRef.current = [];
      redoRef.current = [];
      revisionRef.current += 1;
      setPageCount(recovered.pageCount);
      setPageNumber(1);
      setCanUndo(false);
      setCanRedo(false);
      setDirty(true);
      setSavedUrl("");
      annotation.clearSelection();
      setDocumentRevision((value) => value + 1);
      setNotice(tt("已恢复上次未同步的本地草稿"));
      return true;
    },
    [annotation, tt],
  );

  return {
    canvasRef,
    sourceUrl,
    pageNumber,
    pageCount,
    rotation,
    zoom,
    renderedZoom,
    pageWidth,
    pageHeight,
    loading: sourceLoading || previewLoading,
    rendering,
    processing,
    saving,
    dirty,
    editRevision: revisionRef.current,
    canUndo,
    canRedo,
    error,
    notice,
    savedUrl,
    annotationText: annotation.annotationText,
    annotations: annotation.annotations,
    selectedAnnotationId: annotation.selectedAnnotationId,
    selectedAnnotation: annotation.selectedAnnotation,
    annotationTool: annotation.annotationTool,
    setAnnotationText: annotation.setAnnotationText,
    setAnnotationTool: annotation.setAnnotationTool,
    selectAnnotation: annotation.selectAnnotation,
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
    addTextAnnotation: annotation.addTextAnnotation,
    addTextAnnotationAt: annotation.addTextAnnotationAt,
    addHighlightAnnotation: annotation.addHighlightAnnotation,
    moveAnnotation: annotation.moveAnnotation,
    updateSelectedAnnotation: annotation.updateSelectedAnnotation,
    deleteSelectedAnnotation: annotation.deleteSelectedAnnotation,
    undo,
    redo,
    download,
    saveCopy,
    captureRecovery,
    restoreRecovery,
  };
}
