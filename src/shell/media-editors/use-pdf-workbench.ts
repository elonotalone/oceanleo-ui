"use client";
import { useCallback, useEffect, useRef, useState, type RefCallback } from "react";
import { useUI, type UITranslate } from "../../i18n/ui/useUI";
import {
  isDurableLibraryItem,
  type LibraryItem,
} from "../library-data";
import { saveFileToLibrary, type PersistedEditorVersion } from "../doc-editors/doc-io";
import { artifactSaveStepMessage } from "../doc-editors/artifact-save-contract";
import { usePdfAnnotations } from "./use-pdf-annotations";
import { loadInitialPdfSource } from "./pdf-source";
import { capturePdfRecovery } from "./pdf-recovery";
import {
  PDF_ZOOM_STOPS,
  clamp,
  clampPdfZoom,
  fitPdfZoom,
  nextPdfZoomStop,
  pdfErrorMessage,
  pdfFileStem,
  type PdfSnapshot,
} from "./pdf-workbench-utils";
import { PDF_FAILURE_CODES } from "./pdf-manifest";
import type { PdfWorkbenchState } from "./pdf-workbench-state";
export type { PdfWorkbenchState } from "./pdf-workbench-state";
import { usePdfOffice } from "./pdf-form/use-pdf-office";
import type { PdfOfficeWorkbenchState } from "./pdf-form/types";
export type { PdfOfficeWorkbenchState } from "./pdf-form/types";
import {
  usePdfMutationRunner,
  usePdfSnapshotRestore,
} from "./use-pdf-edit-engine";
import { inspectPdf } from "./pdf-operations";
import { usePdfPageActions } from "./use-pdf-page-actions";
import { usePdfViewPipeline } from "./use-pdf-view-pipeline";
import {
  usePdfWorkbenchCollab,
  type PdfWorkbenchCollabHooks,
} from "./use-pdf-workbench-collab";
export type { PdfWorkbenchCollabHooks } from "./use-pdf-workbench-collab";

export function usePdfWorkbench(
  item: LibraryItem,
  siteId = "",
  onSaved?: (url: string) => void,
  collabHooks?: PdfWorkbenchCollabHooks,
): PdfOfficeWorkbenchState {
  const tt = useUI();
  const collabRef = useRef<PdfWorkbenchCollabHooks | undefined>(collabHooks);
  collabRef.current = collabHooks;
  // `tt` 是 i18n provider 所有的函数，进 effect 依赖就是 W13 在 `dcc0a7d` 里治掉的
  // 自锁引信。本文件有两笔账要一起还：
  //   1) 下面那个源装载 effect（`[…, tt]`）体里写了一整屏 state，`tt` 一换身份就把
  //      整份 PDF 重新拉一遍、`setSourceLoading(false)` 轮不到；
  //   2) 它把裸 `tt` 当 `translate` 传给了 `usePdfDocument` 与 `usePdfPreviewRender`,
  //      等于把同一个引信装进那两个子 hook 的依赖里（W20 在 signals 里点名的那两处）。
  // 语言切换与「这份 PDF 要不要重下重解析、这一页要不要重画」都无关，答案一律是不该
  // 重跑。所以这里只包一次恒定身份，自己的 effect 用它，也把它传给两个子 hook。
  // `vars` 一并转发；代价是装载期文案停在产生时那个语言（`error` / `notice` 由不在
  // 本 owner 面上的 `PdfStage` / `PdfRoute` 原样渲染，改不成渲染时再翻）。
  const translateRef = useRef(tt);
  useEffect(() => {
    translateRef.current = tt;
  }, [tt]);
  const translate = useCallback<UITranslate>(
    (zh, vars) => translateRef.current(zh, vars),
    [],
  );
  const bytesRef = useRef<Uint8Array | null>(null);
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
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [documentRevision, setDocumentRevision] = useState(0);
  const allowBlankSource =
    item.source === "creation" &&
    !isDurableLibraryItem(item) &&
    !String(item.meta.editor_project_schema || "").trim();
  const onPageCount = useCallback((count: number) => {
    setPageCount(count);
    setPageNumber((value) => clamp(value, 1, count || 1));
  }, []);
  const {
    previewLoading,
    rotation,
    rendering,
    renderedZoom,
    pageWidth,
    pageHeight,
    renderThumbnail,
    textLayer,
    machine,
  } = usePdfViewPipeline({
    bytesRef,
    canvas,
    documentRevision,
    item,
    pageCount,
    pageNumber,
    rasterZoom,
    translate,
    onPageCount,
    setError,
  });
  const { advance, reportFailure, clearFailure } = machine;

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
    const source =
      String(item.meta.editor_source_url || "").trim() ||
      item.url ||
      item.previewUrl ||
      "";
    const generation = ++sourceGenerationRef.current;
    const controller = new AbortController();
    processingTokenRef.current += 1;
    savingTokenRef.current += 1;
    processingRef.current = false;
    savingRef.current = false;
    const previousBytes = bytesRef.current;
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
    clearFailure();
    advance("reset");
    advance("source-received");
    void (async () => {
      try {
        const loaded = await loadInitialPdfSource({
          source,
          siteId,
          title: item.title,
          signal: controller.signal,
          allowBlank: allowBlankSource,
        });
        if (loaded.pageCount < 1) {
          throw new Error(translate("PDF 没有可显示的页面"));
        }
        if (controller.signal.aborted || generation !== sourceGenerationRef.current) return;
        let landed = loaded.bytes;
        const prepare = collabRef.current?.prepareLoaded;
        if (prepare) {
          try {
            landed = await prepare(loaded.bytes, previousBytes);
          } catch {
            landed = loaded.bytes;
          }
          if (controller.signal.aborted || generation !== sourceGenerationRef.current) return;
        }
        bytesRef.current = landed;
        setSourceUrl(loaded.durableUrl);
        setPageCount(loaded.pageCount);
        if (loaded.blank) setNotice(translate("已创建一页空白 PDF"));
        advance("pages-resolved");
        setDocumentRevision((value) => value + 1);
      } catch (caught) {
        if (!controller.signal.aborted && generation === sourceGenerationRef.current) {
          const message = pdfErrorMessage(caught, translate("PDF 加载失败"));
          setError(message);
          advance("parse-failed");
          reportFailure(
            /encrypt|密码|加密/i.test(message)
              ? PDF_FAILURE_CODES.F3_encrypted
              : PDF_FAILURE_CODES.invalidSource,
            message,
          );
        }
      } finally {
        if (!controller.signal.aborted && generation === sourceGenerationRef.current) {
          setSourceLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [
    advance,
    allowBlankSource,
    clearFailure,
    item.meta.editor_source_url,
    item.previewUrl,
    item.title,
    item.url,
    reportFailure,
    siteId,
    translate,
  ]);

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

  const runMutation = usePdfMutationRunner({
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
  });
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

  // AcroForm filling, image signatures and redaction. Kept in its own hook so
  // the office surface can grow without widening this file's state machine.
  const office = usePdfOffice({
    bytesRef,
    pageNumber,
    pageCount,
    documentRevision,
    runMutation,
    setError,
    setNotice,
    tt,
  });

  const restoreSnapshot = usePdfSnapshotRestore({
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
  });

  const { undo, redo, restoreRecovery } = usePdfWorkbenchCollab({
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
  });

  /**
   * 多人同改：把别人的改动静默并进当前字节。不进撤销栈、不清选区、不动页码；
   * 本地正有一次编辑在跑或字节在这期间被换过就返回 "busy"，调用方稍后重来。
   */
  const replaceBytesSilently = useCallback(
    async (
      transform: (current: Uint8Array) => Promise<Uint8Array | null>,
      replaceOptions?: { markDirty?: boolean },
    ): Promise<"applied" | "unchanged" | "busy"> => {
      const current = bytesRef.current;
      if (!current || processingRef.current) return "busy";
      const generation = sourceGenerationRef.current;
      const next = await transform(Uint8Array.from(current));
      if (!aliveRef.current || generation !== sourceGenerationRef.current) return "unchanged";
      if (processingRef.current || bytesRef.current !== current) return "busy";
      if (!next) return "unchanged";
      const count = await inspectPdf(next);
      if (processingRef.current || bytesRef.current !== current) return "busy";
      bytesRef.current = next;
      revisionRef.current += 1;
      setPageCount(count);
      setPageNumber((value) => clamp(value, 1, count));
      if (replaceOptions?.markDirty !== false) {
        setDirty(true);
        setSavedUrl("");
      }
      setDocumentRevision((value) => value + 1);
      return "applied";
    },
    [],
  );

  const goToPage = useCallback(
    (value: number) => setPageNumber(clamp(Math.round(value), 1, Math.max(1, pageCount))),
    [pageCount],
  );

  const {
    rotateCurrentPage,
    movePage,
    deleteCurrentPage,
    addBlankPage,
    mergePdf,
    extractPages,
    download,
  } = usePdfPageActions({
    bytesRef,
    processingRef,
    processingTokenRef,
    aliveRef,
    sourceGenerationRef,
    pageNumber,
    pageCount,
    itemTitle: item.title,
    runMutation,
    setProcessing,
    setError,
    setNotice,
    tt,
  });

  const saveCopy = useCallback(async (): Promise<PersistedEditorVersion | null> => {
    if (!bytesRef.current || savingRef.current) return null;
    // 多人同改：保存前先把共享文档里的批注并进字节，写出去的一份包含双方的。
    const beforeSave = collabRef.current?.beforeSave;
    if (beforeSave) {
      try {
        await beforeSave();
      } catch {
        /* 对齐失败不拦保存：字节里至少有本地已经收到的 */
      }
    }
    const bytes = bytesRef.current;
    if (!bytes || savingRef.current) return null;
    const generation = sourceGenerationRef.current;
    const savingRevision = revisionRef.current;
    const savingToken = ++savingTokenRef.current;
    savingRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    advance("commit-started");
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
        sourceFormat: "pdf",
        sourceMediaType: "application/pdf",
        title,
        mediaType: "doc",
        kind: "pdf",
        idempotencyKey: `pdf:${item.id}:${savingRevision}${collabRef.current?.saveKeySalt ? `:${collabRef.current.saveKeySalt}` : ""}`,
        meta: {
          editor: "pdf-native-v1",
          editor_capability: "pdf-editor",
          page_count: pageCount,
        },
        deliveryProjectSchema: "pdf-binary@1",
        // The edited PDF bytes are the artifact source and are themselves a
        // displayable primary (matrix §3.2 row 8). This editor keeps no project
        // sidecar, which is why it never reached createArtifactRevision before.
        artifactRevision: {
          artifactType: "pdf",
          editor: "pdf-native-v1",
          provenance: {
            editorRevision: savingRevision,
            pageCount,
          },
        },
      });
      if (!saved.ok) {
        throw new Error(
          saved.error ||
            artifactSaveStepMessage("revision-publish", ""),
        );
      }
      if (!aliveRef.current || generation !== sourceGenerationRef.current) return null;
      setSavedUrl(saved.url);
      if (revisionRef.current === savingRevision) {
        setDirty(false);
      }
      setNotice("");
      advance("commit-succeeded");
      onSaved?.(saved.url);
      return {
        url: saved.url,
        versionId: saved.versionId,
        projectUrl: saved.projectUrl,
        projectSchema: saved.projectSchema,
        sourceFormat: saved.sourceFormat,
        sourceMediaType: saved.sourceMediaType,
        artifactId: saved.artifactId,
        revisionId: saved.revisionId,
        previousRevisionId: saved.previousRevisionId,
        item: saved.item,
      };
    } catch (caught) {
      // F5 / §5.3: the edited bytes stay in `bytesRef`, and the machine falls
      // back to `annotating` — the one legal failure path out of `saving`.
      if (aliveRef.current && generation === sourceGenerationRef.current) {
        const message = pdfErrorMessage(caught, tt("保存 PDF 副本失败"));
        setError(message);
        advance("commit-conflicted");
        reportFailure(PDF_FAILURE_CODES.F5_annotationLost, message);
      }
      return null;
    } finally {
      if (savingToken === savingTokenRef.current) {
        savingRef.current = false;
        if (aliveRef.current) setSaving(false);
      }
    }
  }, [advance, item, onSaved, pageCount, reportFailure, siteId, tt]);

  const captureRecovery = useCallback(
    () => capturePdfRecovery(bytesRef.current),
    [],
  );

  return {
    readerState: machine.readerState,
    failure: machine.failure,
    textLayer,
    manifest: machine.manifest,
    searchFullText: textLayer.searchFullText,
    renderPageThumbnail: renderThumbnail,
    zoomStops: PDF_ZOOM_STOPS,
    fitZoom: (mode, container) => {
      const scale = Math.max(0.01, renderedZoom / 100);
      setZoomState(
        fitPdfZoom(mode, container, {
          width: pageWidth / scale,
          height: pageHeight / scale,
        }),
      );
    },
    canvasRef,
    currentBytes: () => bytesRef.current,
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
    documentVersion: documentRevision,
    replaceBytesSilently,
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
    setZoom: (value) => setZoomState(clampPdfZoom(value)),
    zoomBy: (delta) =>
      setZoomState((value) => nextPdfZoomStop(value, delta >= 0 ? 1 : -1)),
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
    ...office,
  };
}
