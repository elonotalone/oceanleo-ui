"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { UITranslate } from "../../i18n/ui/useUI";
import { inspectPdf } from "./pdf-operations";
import type { PdfMutationResult } from "./use-pdf-annotations";
import type { PdfReaderMachine } from "./use-pdf-reader-machine";
import {
  appendPdfHistory,
  clamp,
  pdfErrorMessage,
  type PdfSnapshot,
} from "./pdf-workbench-utils";

export type PdfMutation = (bytes: Uint8Array) => Promise<PdfMutationResult>;

/**
 * The write path. Every edit that changes the PDF bytes — rotate, reorder,
 * delete, merge, annotate, fill a form field, sign, redact — goes through
 * these two callbacks, and only through them.
 *
 * `usePdfMutationRunner` is the one-way door forward: snapshot the current
 * bytes, run the mutation off to the side, re-count the pages, and only then
 * swap the bytes in and push the snapshot onto the undo stack.
 * `usePdfSnapshotRestore` is its exact inverse for undo, redo and draft
 * recovery: put a snapshot's bytes back and settle the same flags.
 *
 * Keeping both here rather than inline in `usePdfWorkbench` is what makes the
 * pairing visible: the two functions must agree on which flags an edit moves
 * (`dirty`, `canUndo`/`canRedo`, `savedUrl`, `documentRevision`), and they
 * only agree by being read side by side.
 */
export function usePdfMutationRunner({
  aliveRef,
  bytesRef,
  processingRef,
  processingTokenRef,
  redoRef,
  revisionRef,
  sourceGenerationRef,
  undoRef,
  pageCount,
  pageNumber,
  advance,
  setCanRedo,
  setCanUndo,
  setDirty,
  setDocumentRevision,
  setError,
  setNotice,
  setPageCount,
  setPageNumber,
  setProcessing,
  setSavedUrl,
  tt,
}: {
  aliveRef: MutableRefObject<boolean>;
  bytesRef: MutableRefObject<Uint8Array | null>;
  processingRef: MutableRefObject<boolean>;
  processingTokenRef: MutableRefObject<number>;
  redoRef: MutableRefObject<PdfSnapshot[]>;
  revisionRef: MutableRefObject<number>;
  sourceGenerationRef: MutableRefObject<number>;
  undoRef: MutableRefObject<PdfSnapshot[]>;
  pageCount: number;
  pageNumber: number;
  advance: PdfReaderMachine["advance"];
  setCanRedo: Dispatch<SetStateAction<boolean>>;
  setCanUndo: Dispatch<SetStateAction<boolean>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  setDocumentRevision: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setPageCount: Dispatch<SetStateAction<number>>;
  setPageNumber: Dispatch<SetStateAction<number>>;
  setProcessing: Dispatch<SetStateAction<boolean>>;
  setSavedUrl: Dispatch<SetStateAction<string>>;
  tt: UITranslate;
}) {
  return useCallback(
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
        advance("annotation-edited");
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
    [advance, pageCount, pageNumber, tt],
  );
}

export function usePdfSnapshotRestore({
  annotation,
  bytesRef,
  redoRef,
  revisionRef,
  undoRef,
  setCanRedo,
  setCanUndo,
  setDirty,
  setDocumentRevision,
  setError,
  setNotice,
  setPageCount,
  setPageNumber,
  setSavedUrl,
}: {
  annotation: { clearSelection: () => void };
  bytesRef: MutableRefObject<Uint8Array | null>;
  redoRef: MutableRefObject<PdfSnapshot[]>;
  revisionRef: MutableRefObject<number>;
  undoRef: MutableRefObject<PdfSnapshot[]>;
  setCanRedo: Dispatch<SetStateAction<boolean>>;
  setCanUndo: Dispatch<SetStateAction<boolean>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  setDocumentRevision: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setPageCount: Dispatch<SetStateAction<number>>;
  setPageNumber: Dispatch<SetStateAction<number>>;
  setSavedUrl: Dispatch<SetStateAction<string>>;
}) {
  return useCallback((snapshot: PdfSnapshot, noticeText: string) => {
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
    // Everything else in here is a ref or a `useState` setter, so `annotation`
    // is the only identity that can move.
  }, [annotation]);
}
