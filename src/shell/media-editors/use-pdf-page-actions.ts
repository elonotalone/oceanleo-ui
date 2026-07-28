"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { UITranslate } from "../../i18n/ui/useUI";
import {
  addBlankPdfPage,
  deletePdfPage,
  extractPdfPages,
  mergePdfBytes,
  movePdfPage,
  rotatePdfPage,
} from "./pdf-operations";
import {
  downloadPdfBytes,
  pdfErrorMessage,
  pdfFileStem,
} from "./pdf-workbench-utils";
import { assertBlobSource } from "./source-integrity.mjs";
import type { PdfMutationResult } from "./use-pdf-annotations";

const MAX_PDF_BYTES = 256 * 1024 * 1024;

type PdfMutation = (bytes: Uint8Array) => Promise<PdfMutationResult>;

interface PdfPageActionsOptions {
  bytesRef: MutableRefObject<Uint8Array | null>;
  processingRef: MutableRefObject<boolean>;
  processingTokenRef: MutableRefObject<number>;
  aliveRef: MutableRefObject<boolean>;
  sourceGenerationRef: MutableRefObject<number>;
  pageNumber: number;
  pageCount: number;
  itemTitle: string;
  runMutation: (mutation: PdfMutation) => Promise<PdfMutationResult | null>;
  setProcessing: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  tt: UITranslate;
}

export function usePdfPageActions({
  bytesRef,
  processingRef,
  processingTokenRef,
  aliveRef,
  sourceGenerationRef,
  pageNumber,
  pageCount,
  itemTitle,
  runMutation,
  setProcessing,
  setError,
  setNotice,
  tt,
}: PdfPageActionsOptions) {
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
        await assertBlobSource(file, "pdf");
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
    [pageNumber, runMutation, setError, tt],
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
        downloadPdfBytes(extracted, `${pdfFileStem(itemTitle)}-${suffix}.pdf`);
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
    [
      aliveRef,
      bytesRef,
      itemTitle,
      pageNumber,
      processingRef,
      processingTokenRef,
      setError,
      setNotice,
      setProcessing,
      sourceGenerationRef,
      tt,
    ],
  );

  const download = useCallback(() => {
    if (bytesRef.current) {
      downloadPdfBytes(bytesRef.current, `${pdfFileStem(itemTitle)}-edited.pdf`);
    }
  }, [bytesRef, itemTitle]);

  return {
    rotateCurrentPage,
    movePage,
    deleteCurrentPage,
    addBlankPage,
    mergePdf,
    extractPages,
    download,
  };
}
