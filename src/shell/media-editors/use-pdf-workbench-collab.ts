"use client";

import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { UITranslate } from "../../i18n/ui/useUI";
import { decodePdfRecovery } from "./pdf-recovery";
import {
  appendPdfHistory,
  pdfErrorMessage,
  type PdfSnapshot,
} from "./pdf-workbench-utils";

const MAX_PDF_BYTES = 256 * 1024 * 1024;

/**
 * 多人同改（work-chat F05）接进工作台的几个钩子。不在协同里就不传，工作台的行为一个字节不变。
 * 实现在 `collab/adapters/use-pdf-collab.ts`（对齐器 `pdf-collab-sync.ts`）。
 */
export interface PdfWorkbenchCollabHooks {
  /**
   * 载入（或别人保存了新页结构后重新载入）完成、字节落下之前：补页 id / 批注 id，
   * 重新载入时（`previous` 非空）把当前的批注按原样带到新字节上。返回要用的字节。
   */
  prepareLoaded?: (bytes: Uint8Array, previous: Uint8Array | null) => Promise<Uint8Array>;
  /** 撤销 / 重做拿到旧快照字节后：补回别人的批注，只撤自己的。 */
  adjustRestored?: (restored: Uint8Array, current: Uint8Array) => Promise<Uint8Array>;
  /** 保存之前：把共享文档里的批注并进字节（谁保存都包含双方的）。 */
  beforeSave?: () => Promise<void>;
  /** 区分各人保存的幂等键，免得两个人的「第 N 次编辑」撞上同一把键。 */
  saveKeySalt?: string;
}

/**
 * F05 接到工作台的协同钩子，以及撤销/重做、本地草稿恢复这些经这些钩子落下字节的路径。
 */
export function usePdfWorkbenchCollab({
  collabRef,
  restoreSnapshot,
  aliveRef,
  bytesRef,
  processingRef,
  sourceGenerationRef,
  undoRef,
  redoRef,
  revisionRef,
  pageCount,
  pageNumber,
  tt,
  annotation,
  setPageCount,
  setPageNumber,
  setCanUndo,
  setCanRedo,
  setDirty,
  setSavedUrl,
  setError,
  setNotice,
  setDocumentRevision,
}: {
  collabRef: MutableRefObject<PdfWorkbenchCollabHooks | undefined>;
  restoreSnapshot: (snapshot: PdfSnapshot, noticeText: string) => void;
  aliveRef: MutableRefObject<boolean>;
  bytesRef: MutableRefObject<Uint8Array | null>;
  processingRef: MutableRefObject<boolean>;
  sourceGenerationRef: MutableRefObject<number>;
  undoRef: MutableRefObject<PdfSnapshot[]>;
  redoRef: MutableRefObject<PdfSnapshot[]>;
  revisionRef: MutableRefObject<number>;
  pageCount: number;
  pageNumber: number;
  tt: UITranslate;
  annotation: { clearSelection: () => void };
  setPageCount: Dispatch<SetStateAction<number>>;
  setPageNumber: Dispatch<SetStateAction<number>>;
  setCanUndo: Dispatch<SetStateAction<boolean>>;
  setCanRedo: Dispatch<SetStateAction<boolean>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  setSavedUrl: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  setDocumentRevision: Dispatch<SetStateAction<number>>;
}) {
  /**
   * 撤销 / 重做落下旧快照。协同里先把别人的批注补回旧字节（本地撤销只撤自己的）；
   * 补的过程中字节被别人的改动静默换过就按新的当前字节再补一次。
   */
  const landSnapshot = useCallback(
    (snapshot: PdfSnapshot, noticeText: string, current: Uint8Array) => {
      const adjust = collabRef.current?.adjustRestored;
      if (!adjust) {
        restoreSnapshot(snapshot, noticeText);
        return;
      }
      processingRef.current = true;
      const generation = sourceGenerationRef.current;
      void (async () => {
        let base = current;
        let landed = snapshot.bytes;
        try {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            landed = await adjust(snapshot.bytes, base);
            if (bytesRef.current === base || !bytesRef.current) break;
            base = bytesRef.current;
          }
        } catch {
          landed = snapshot.bytes;
        } finally {
          processingRef.current = false;
        }
        if (!aliveRef.current || generation !== sourceGenerationRef.current) return;
        restoreSnapshot({ ...snapshot, bytes: landed }, noticeText);
      })();
    },
    [restoreSnapshot],
  );

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
    landSnapshot(previous, tt("已撤销上一步"), current);
  }, [landSnapshot, pageCount, pageNumber, tt]);

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
    landSnapshot(next, tt("已重做"), current);
  }, [landSnapshot, pageCount, pageNumber, tt]);

  const restoreRecovery = useCallback(
    async (payload: unknown): Promise<boolean> => {
      try {
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
        setError("");
        annotation.clearSelection();
        setDocumentRevision((value) => value + 1);
        setNotice(tt("已恢复上次未同步的本地草稿"));
        return true;
      } catch (caught) {
        setError(pdfErrorMessage(caught, tt("PDF 本地草稿恢复失败")));
        return false;
      }
    },
    [annotation, tt],
  );

  return {
    undo,
    redo,
    restoreRecovery,
  };
}
