"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
} from "pdfjs-dist";
import type { UITranslate } from "../../i18n/ui/useUI";
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
  translate: providedTranslate,
  setError,
  onPageCount,
}: {
  bytesRef: MutableRefObject<Uint8Array | null>;
  documentRevision: number;
  translate: UITranslate;
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

  // `translate` 这个形参名不代表它是安全的：`use-pdf-workbench.ts` 过去把
  // `useUI()` 的裸 `tt` 直接当 `translate` 传了进来，于是下面这个 effect 的依赖里
  // 站着一个 provider 所有的函数。它写的 state 里有
  // `setPreviewRevision((value) => value + 1)`——每跑一次就必然触发下一次渲染，
  // 正是 W13 在 `dcc0a7d` 里治掉的那个自锁形状：pdf.js 文档会被反复销毁重建。
  // 语言切换与「这份字节要不要重新解析成 PDF 文档」无关，答案明确是不该重跑。
  // ref + 空依赖 `useCallback` 包出恒定身份（沿用 W13 的解法），并把 `vars` 一起
  // 转发；代价是解析失败的兜底文案停在报错当时那个语言。
  const translateRef = useRef(providedTranslate);
  useEffect(() => {
    translateRef.current = providedTranslate;
  }, [providedTranslate]);
  const translate = useCallback<UITranslate>(
    (zh, vars) => translateRef.current(zh, vars),
    [],
  );

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
