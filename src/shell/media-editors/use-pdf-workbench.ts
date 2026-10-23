"use client";

/**
 * PDF 编辑器的状态（D4 / D11）：围着**唯一的**查看器实例转。
 *
 * - 源：库里那份 PDF 的字节，只在第一次（或换成别的文件时）载入；我们自己保存产生
 *   的新版本不触发重载——否则每存一次撤销栈就清空、画面闪一下。
 * - 撤销 / 重做：查看器自己的历史（批注、文字、表单）在上；页面整理（旋转写进文件、
 *   删页、排序）在下，每一步记「前 / 后」两份字节，撤销即换回前一份。
 * - 保存：查看器导出整份字节（标准 PDF 批注）→ 同一份 PDF 的新版本；每次成功后
 *   **基线换成服务器返回的那一版**，下一次保存的 CAS 基线才是对的（第 2 次保存
 *   失败、或再 fork 一份，都是基线没前移造成的）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { isDurableLibraryItem, type LibraryItem } from "../library-data";
import type { PersistedEditorVersion } from "../doc-editors/doc-io";
import { artifactSaveStepMessage } from "../doc-editors/artifact-save-contract";
import { savePdfBytesToLibrary } from "./pdf-library-save";
import { loadInitialPdfSource } from "./pdf-source";
import { decodePdfRecovery } from "./pdf-recovery";
import { deletePdfPage, movePdfPage, rotatePdfPage } from "./pdf-operations";
import { downloadPdfBytes, pdfErrorMessage, pdfFileStem } from "./pdf-workbench-utils";
import { PDF_SUBTYPE, type PdfAnnotationLike, type PdfViewerBridge } from "./pdf-viewer-bridge";
import type { PdfStageHandle } from "./PdfStage";
import { sourceFormatForBlob } from "./source-integrity.mjs";
import { recordUserMutation, userEditItemKey, userMutationGeneration } from "../user-edit-session";

const MAX_RECOVERY_BYTES = 96 * 1024 * 1024;

interface PageOpEntry {
  before: Uint8Array;
  after: Uint8Array;
  page: number;
}

export interface PdfPlacement {
  pageIndex?: number;
  x?: number;
  y?: number;
  clientX?: number;
  clientY?: number;
}

export type PdfUserEditReason = "local-annotation" | "page-edit" | "silent-replace" | "collab";

/**
 * 只有人的编辑记一次「真人改动」（自动保存只认这个信号）；重载别人存的新版本、
 * 协作推送进来的变化不记。
 */
export function applyPdfWorkbenchUserEditSession(
  item: { key?: string; id?: string; artifactId?: string },
  reason: PdfUserEditReason,
): number {
  const key = userEditItemKey(item);
  if (reason === "silent-replace" || reason === "collab") return userMutationGeneration(key);
  return recordUserMutation(key);
}

/**
 * 查看器导出的整份字节；有中日韩「加文字」时补上标准外观流（PDFium 自己生成的是空的，
 * 重开后文字会整个不见，`pdf-cjk-appearance.ts`）。没有就原样，不多走一遍 pdf-lib。
 */
async function exportPdf(bridge: PdfViewerBridge): Promise<Uint8Array> {
  const bytes = await bridge.exportBytes();
  if (!bridge.hasWideFreeText()) return bytes;
  const { fixPdfCjkFreeTextAppearances } = await import("./pdf-cjk-appearance");
  return (await fixPdfCjkFreeTextAppearances(bytes)).bytes;
}

/**
 * 打开时同样补外观流（只为显示，不保存、不标脏）：之前存下的中日韩「加文字」外观流是空的，
 * 不补的话打开看不见；用户下一次真改动保存时，导出会把补好的外观一并存进去。
 * 大文件跳过（pdf-lib 整份解析的代价），照原样显示。
 */
const DISPLAY_FIX_MAX_BYTES = 24 * 1024 * 1024;
async function displayablePdf(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.byteLength > DISPLAY_FIX_MAX_BYTES) return bytes;
  try {
    const { fixPdfCjkFreeTextAppearances } = await import("./pdf-cjk-appearance");
    return (await fixPdfCjkFreeTextAppearances(bytes)).bytes;
  } catch {
    return bytes;
  }
}

function sourceKeyOf(item: LibraryItem): string {
  return String(item.meta.editor_source_url || "").trim() || item.url || item.previewUrl || "";
}

async function imageSize(bytes: ArrayBuffer, mime: string): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mime }));
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return size;
  } catch {
    return { width: 200, height: 100 };
  }
}

export function usePdfWorkbench(
  item: LibraryItem,
  siteId = "",
  options: { readOnly?: boolean } = {},
) {
  const tt = useUI();
  const readOnly = Boolean(options.readOnly);
  const [handle, setHandle] = useState<PdfStageHandle | null>(null);
  const handleRef = useRef<PdfStageHandle | null>(null);
  handleRef.current = handle;
  const [initialBytes, setInitialBytes] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [revision, setRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const [annotationVersion, setAnnotationVersion] = useState(0);
  const [thumbVersion, setThumbVersion] = useState(0);
  const [historyTick, setHistoryTick] = useState(0);
  const revisionRef = useRef(0);
  const undoOps = useRef<PageOpEntry[]>([]);
  const redoOps = useRef<PageOpEntry[]>([]);
  const navigating = useRef(false);
  const processingRef = useRef(false);
  const savingRef = useRef(false);
  /** 下一次保存的基线（每次成功保存后换成服务器返回的那一版）。 */
  const baseRef = useRef<LibraryItem>(item);
  /** 我们自己保存出去的源地址：item 换成它们时不重载。 */
  const ownSources = useRef(new Set<string>());
  const loadedKey = useRef("");

  const itemRef = useRef(item);
  itemRef.current = item;
  /** 本地编辑：记脏、并告诉外壳这是一次真人编辑（自动保存只认这个信号）。 */
  const bump = useCallback(() => {
    applyPdfWorkbenchUserEditSession(itemRef.current, "local-annotation");
    revisionRef.current += 1;
    setRevision(revisionRef.current);
    setThumbVersion((value) => value + 1);
  }, []);

  // ---- 源装载 ----
  const sourceKey = sourceKeyOf(item);
  const allowBlank =
    item.source === "creation" &&
    !isDurableLibraryItem(item) &&
    !String(item.meta.editor_project_schema || "").trim();
  useEffect(() => {
    if (ownSources.current.has(sourceKey) && loadedKey.current) {
      // 自己刚存出去的那一版回到了 props：只换基线，不重载。
      baseRef.current = { ...baseRef.current, ...item };
      return undefined;
    }
    baseRef.current = item;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const loaded = await loadInitialPdfSource({
          source: sourceKey,
          siteId,
          title: item.title,
          signal: controller.signal,
          allowBlank,
        });
        if (controller.signal.aborted) return;
        if (loaded.pageCount < 1) throw new Error(tt("PDF 没有可显示的页面"));
        const reloading = Boolean(loadedKey.current && handleRef.current);
        loadedKey.current = sourceKey;
        undoOps.current = [];
        redoOps.current = [];
        const shown = await displayablePdf(loaded.bytes);
        if (controller.signal.aborted) return;
        if (reloading) {
          await handleRef.current!.bridge.replaceDocument(shown);
          setSavedRevision(revisionRef.current);
        } else {
          setInitialBytes(shown);
        }
        setPageCount(loaded.pageCount);
        if (loaded.blank) setNotice(tt("已创建一页空白 PDF"));
      } catch (caught) {
        if (!controller.signal.aborted) setError(pdfErrorMessage(caught, tt("PDF 加载失败")));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, siteId, allowBlank]);

  // ---- 查看器事件 ----
  useEffect(() => {
    const bridge = handle?.bridge;
    if (!bridge) return undefined;
    bridge.setReadOnly(readOnly);
    const syncPages = () => {
      setPageCount(bridge.pages().length);
      setCurrentPage(bridge.currentPage());
      setZoom(bridge.zoomPercent());
    };
    syncPages();
    return bridge.subscribe({
      onEdit: () => {
        if (!navigating.current && !bridge.canRedo()) redoOps.current = [];
        bump();
        setHistoryTick((value) => value + 1);
      },
      onAnnotations: () => setAnnotationVersion((value) => value + 1),
      onZoom: setZoom,
      onPage: setCurrentPage,
      onDocument: () => {
        syncPages();
        setHistoryTick((value) => value + 1);
        setThumbVersion((value) => value + 1);
      },
      onThumbs: () => setThumbVersion((value) => value + 1),
    });
  }, [bump, handle, readOnly]);

  // ---- 页面整理（写进文件，可撤销）----
  const runPageOp = useCallback(
    async (page: number, transform: (bytes: Uint8Array) => Promise<Uint8Array>) => {
      const bridge = handleRef.current?.bridge;
      if (!bridge || readOnly || processingRef.current) return false;
      processingRef.current = true;
      setProcessing(true);
      setError("");
      try {
        const before = await exportPdf(bridge);
        const after = await transform(before);
        await bridge.replaceDocument(after, page);
        setPageCount(bridge.pages().length);
        undoOps.current.push({ before, after, page });
        redoOps.current = [];
        bump();
        setHistoryTick((value) => value + 1);
        return true;
      } catch (caught) {
        setError(pdfErrorMessage(caught, tt("页面没有调整成功")));
        return false;
      } finally {
        processingRef.current = false;
        setProcessing(false);
      }
    },
    [bump, readOnly, tt],
  );
  const rotatePage = useCallback(
    (pageIndex: number, clockwise = true) =>
      runPageOp(pageIndex + 1, (bytes) => rotatePdfPage(bytes, pageIndex, clockwise ? 90 : -90)),
    [runPageOp],
  );
  const deletePage = useCallback(
    (pageIndex: number) => {
      if (pageCount <= 1) {
        setError(tt("PDF 至少需要保留一页"));
        return Promise.resolve(false);
      }
      return runPageOp(Math.max(1, pageIndex), (bytes) => deletePdfPage(bytes, pageIndex));
    },
    [pageCount, runPageOp, tt],
  );
  const movePage = useCallback(
    (fromIndex: number, toIndex: number) =>
      runPageOp(toIndex + 1, (bytes) => movePdfPage(bytes, fromIndex, toIndex)),
    [runPageOp],
  );

  const swapTo = useCallback(
    async (bytes: Uint8Array, page: number) => {
      const bridge = handleRef.current?.bridge;
      if (!bridge) return;
      processingRef.current = true;
      setProcessing(true);
      try {
        await bridge.replaceDocument(bytes, page);
        setPageCount(bridge.pages().length);
        bump();
      } catch (caught) {
        setError(pdfErrorMessage(caught, tt("撤销没有成功")));
      } finally {
        processingRef.current = false;
        setProcessing(false);
        setHistoryTick((value) => value + 1);
      }
    },
    [bump, tt],
  );
  const undo = useCallback(() => {
    const bridge = handleRef.current?.bridge;
    if (!bridge || readOnly || processingRef.current) return;
    if (bridge.canUndo()) {
      navigating.current = true;
      bridge.undo();
      navigating.current = false;
      return;
    }
    const entry = undoOps.current.pop();
    if (!entry) return;
    redoOps.current.push(entry);
    void swapTo(entry.before, entry.page);
  }, [readOnly, swapTo]);
  const redo = useCallback(() => {
    const bridge = handleRef.current?.bridge;
    if (!bridge || readOnly || processingRef.current) return;
    if (bridge.canRedo()) {
      navigating.current = true;
      bridge.redo();
      navigating.current = false;
      return;
    }
    const entry = redoOps.current.pop();
    if (!entry) return;
    undoOps.current.push(entry);
    void swapTo(entry.after, entry.page);
  }, [readOnly, swapTo]);
  const bridgeNow = handle?.bridge;
  const canUndo = Boolean(!readOnly && (bridgeNow?.canUndo() || undoOps.current.length > 0));
  const canRedo = Boolean(!readOnly && (bridgeNow?.canRedo() || redoOps.current.length > 0));
  void historyTick;

  // ---- 保存 ----
  const save = useCallback(async (): Promise<
    { ok: true; version: PersistedEditorVersion } | { ok: false; error: string }
  > => {
    const bridge = handleRef.current?.bridge;
    if (!bridge) return { ok: false, error: tt("PDF 还没有载入，没有可保存的内容。") };
    if (savingRef.current) return { ok: false, error: tt("上一次保存还没结束，请稍后再试。") };
    savingRef.current = true;
    setSaving(true);
    setError("");
    const savingRevision = revisionRef.current;
    try {
      const bytes = await exportPdf(bridge);
      const saved = await savePdfBytesToLibrary({
        item: baseRef.current,
        siteId,
        bytes,
        savingRevision,
        pageCount: bridge.pages().length || pageCount,
      });
      if (!saved.ok) {
        throw new Error(saved.error || artifactSaveStepMessage("revision-publish", ""));
      }
      if (saved.url) ownSources.current.add(saved.url);
      if (saved.item) {
        ownSources.current.add(sourceKeyOf(saved.item));
        baseRef.current = { ...baseRef.current, ...saved.item, key: baseRef.current.key };
      }
      setSavedRevision(savingRevision);
      const version: PersistedEditorVersion = {
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
      return { ok: true, version };
    } catch (caught) {
      const message = pdfErrorMessage(caught, tt("PDF 保存失败"));
      setError(message);
      return { ok: false, error: message };
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [pageCount, siteId, tt]);

  const download = useCallback(async () => {
    const bridge = handleRef.current?.bridge;
    if (!bridge) return tt("PDF 还没有载入。");
    try {
      downloadPdfBytes(await exportPdf(bridge), `${pdfFileStem(item.title)}.pdf`);
      return "";
    } catch (caught) {
      return pdfErrorMessage(caught, tt("下载没有成功"));
    }
  }, [item.title, tt]);

  // ---- 恢复草稿 ----
  const captureRecovery = useCallback(async () => {
    const bridge = handleRef.current?.bridge;
    if (!bridge) return null;
    const bytes = await exportPdf(bridge);
    return new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
  }, []);
  const restoreRecovery = useCallback(
    async (payload: unknown) => {
      const bridge = handleRef.current?.bridge;
      if (!bridge) return false;
      try {
        const decoded = await decodePdfRecovery(payload, MAX_RECOVERY_BYTES);
        if (!decoded) return false;
        await bridge.replaceDocument(decoded.bytes);
      } catch (caught) {
        // 草稿坏了：留在服务器那一版上，并照实说，不许静默吞掉。
        void caught;
        setError(tt("PDF 本地草稿恢复失败"));
        return false;
      }
      undoOps.current = [];
      redoOps.current = [];
      bump();
      return true;
    },
    [bump, tt],
  );

  // ---- 图章（素材图片 / 签名）----
  const insertImage = useCallback(
    async (data: ArrayBuffer, declaredMime: string, placement: PdfPlacement = {}) => {
      let mime = declaredMime;
      const current = handleRef.current;
      const bridge = current?.bridge;
      if (!bridge || readOnly) throw new Error(tt("现在不能修改这份 PDF。"));
      const pages = bridge.pages();
      const dropped =
        placement.clientX !== undefined && placement.clientY !== undefined
          ? bridge.pagePointAt(placement.clientX, placement.clientY, current!.viewport())
          : null;
      const pageIndex = dropped?.pageIndex ?? placement.pageIndex ?? bridge.currentPage() - 1;
      const page = pages[pageIndex];
      if (!page) throw new Error(tt("找不到要放的那一页。"));
      // 按字节认格式，不信声明的 MIME：PDF 图章只收 PNG / JPEG。
      const format = await sourceFormatForBlob(new Blob([data]));
      if (format !== "png" && format !== "jpeg") {
        throw new Error(tt("只能放 PNG 或 JPEG 图片。"));
      }
      mime = format === "jpeg" ? "image/jpeg" : "image/png";
      const natural = await imageSize(data, mime);
      const maxWidth = page.size.width * 0.4;
      const scale = Math.min(1, maxWidth / natural.width, (page.size.height * 0.4) / natural.height);
      const width = natural.width * scale;
      const height = natural.height * scale;
      const cx = dropped?.x ?? placement.x ?? page.size.width / 2;
      const cy = dropped?.y ?? placement.y ?? page.size.height / 2;
      const left = Math.min(Math.max(cx - width / 2, 0), Math.max(0, page.size.width - width));
      const top = Math.min(Math.max(cy - height / 2, 0), Math.max(0, page.size.height - height));
      const ok = bridge.createAnnotation(
        pageIndex,
        {
          id: globalThis.crypto?.randomUUID?.() || `stamp-${Date.now().toString(36)}`,
          type: PDF_SUBTYPE.STAMP,
          pageIndex,
          rect: { origin: { x: left, y: top }, size: { width, height } },
          flags: ["print"],
          subject: "Stamp",
          created: new Date(),
        },
        { data, mimeType: mime },
      );
      if (!ok) throw new Error(tt("现在不能修改这份 PDF。"));
    },
    [readOnly, tt],
  );

  const selected: PdfAnnotationLike | null = useMemo(
    () => (handle ? handle.bridge.selected() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handle, annotationVersion],
  );

  return {
    attach: setHandle,
    bridge: handle?.bridge ?? null,
    viewport: () => handle?.viewport() ?? null,
    initialBytes,
    loading: loading || (!handle && !error),
    error,
    notice,
    setError,
    processing,
    saving,
    pageCount,
    currentPage,
    zoom,
    editRevision: revision,
    dirty: revision !== savedRevision,
    annotationVersion,
    thumbVersion,
    selected,
    canUndo,
    canRedo,
    undo,
    redo,
    rotatePage,
    deletePage,
    movePage,
    goToPage: (page: number) => handle?.bridge.goToPage(page),
    setZoom: (percent: number) => handle?.bridge.setZoomPercent(percent),
    fit: () => handle?.bridge.fitPage(),
    save,
    download,
    captureRecovery,
    restoreRecovery,
    insertImage,
    baseItem: () => baseRef.current,
  };
}

export type PdfWorkbenchState = ReturnType<typeof usePdfWorkbench>;
