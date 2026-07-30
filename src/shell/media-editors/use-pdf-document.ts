"use client";

import { useEffect, useState, type MutableRefObject } from "react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
} from "pdfjs-dist";
import { clamp, pdfErrorMessage } from "./pdf-workbench-utils";

/**
 * Owns the pdf.js side of the document: one proxy per revision of the bytes.
 * The proxy is state rather than a ref so that everything derived from it —
 * the stage render, the text-layer probe, the thumbnail rail — re-runs
 * together when the bytes change, instead of racing on a ref read during
 * render.
 *
 * §5.4: rendering goes through pdf.js canvas with `isEvalSupported: false`, so
 * a hostile PDF never reaches a script evaluator.
 */
export function usePdfDocument({
  bytesRef,
  documentRevision,
  translate,
  setError,
  onPageCount,
}: {
  bytesRef: MutableRefObject<Uint8Array | null>;
  documentRevision: number;
  translate: (value: string) => string;
  setError: (message: string) => void;
  onPageCount: (pageCount: number) => void;
}): {
  documentProxy: PDFDocumentProxy | null;
  previewRevision: number;
  loading: boolean;
} {
  const [documentProxy, setDocumentProxy] = useState<PDFDocumentProxy | null>(
    null,
  );
  const [previewRevision, setPreviewRevision] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let disposed = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let loadedDocument: PDFDocumentProxy | null = null;
    const bytes = bytesRef.current;
    setDocumentProxy(null);
    setPreviewRevision((value) => value + 1);
    if (!bytes) {
      setLoading(false);
      return;
    }
    setLoading(true);
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
        if (disposed) return;
        setDocumentProxy(loadedDocument);
        onPageCount(loadedDocument.numPages);
        setPreviewRevision((value) => value + 1);
      } catch (caught) {
        if (!disposed) {
          setError(pdfErrorMessage(caught, translate("PDF 预览引擎加载失败")));
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => {
      disposed = true;
      setDocumentProxy(null);
      const destroying = loadingTask
        ? loadingTask.destroy()
        : loadedDocument
          ? loadedDocument.destroy()
          : null;
      void destroying?.catch(() => undefined);
    };
    // `onPageCount` and `setError` are stable callbacks from the workbench.
  }, [bytesRef, documentRevision, onPageCount, setError, translate]);

  return { documentProxy, previewRevision, loading };
}
