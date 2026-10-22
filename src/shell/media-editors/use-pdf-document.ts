"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  openPdfEngineDocument,
  type PdfEngineDocument,
} from "./pdf-engine-host";
import type { UITranslate } from "../../i18n/ui/useUI";
import { clamp, pdfErrorMessage } from "./pdf-workbench-utils";

/**
 * Owns the PDFium (EmbedPDF) side of the document: one handle per revision of the bytes.
 * The proxy is state rather than a ref so that everything derived from it —
 * the stage render, the text-layer probe, the thumbnail rail — re-runs
 * together when the bytes change, instead of racing on a ref read during
 * render.
 *
 * §5.4: rendering goes through PDFium (wasm, no script evaluator), so a hostile
 * PDF never reaches a JavaScript engine. There is no pdf.js path.
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
  documentProxy: PdfEngineDocument | null;
  previewRevision: number;
  loading: boolean;
} {
  const [documentProxy, setDocumentProxy] = useState<PdfEngineDocument | null>(
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
    let loadedDocument: PdfEngineDocument | null = null;
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
        const opened = await openPdfEngineDocument(Uint8Array.from(bytes));
        if (disposed) {
          void opened.close();
          return;
        }
        loadedDocument = opened;
        setDocumentProxy(loadedDocument);
        onPageCount(opened.numPages);
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
      void loadedDocument?.close();
    };
    // `onPageCount` and `setError` are stable callbacks from the workbench.
  }, [bytesRef, documentRevision, onPageCount, setError, translate]);

  return { documentProxy, previewRevision, loading };
}
