"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { FabricImage } from "fabric";
import { aiEditImage } from "../../lib/image-ai-edit";
import {
  canvasSafeUrl,
  importMediaUrl,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import type { LibraryItem } from "../library-data";
import { loadImageObject, type FabricNS } from "./editor-objects";
import { exportDocBlob } from "./editor-objects";
import {
  downloadImageBlob,
  persistImageBlob,
} from "./editor-persistence";
import { FabricEditorController } from "./fabric-controller";
import type { FabricControllerView } from "./fabric-controller-core";
import {
  INITIAL_FILTERS,
  type FabricImageEditorOptions,
  type FabricImageEditorState,
} from "./types";

const INITIAL_VIEW: FabricControllerView = {
  doc: { width: 1080, height: 1080 },
  canvasBackground: "#ffffff",
  zoom: 1,
  activeTool: "select",
  brush: { color: "#1c1917", width: 12 },
  layers: [],
  selected: null,
  transformInfo: null,
  filterInfo: { scope: "background", settings: { ...INITIAL_FILTERS } },
  cropping: false,
  cropRatio: "free",
  canUndo: false,
  canRedo: false,
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function imageDocumentSize(image: FabricImage): {
  width: number;
  height: number;
} {
  const width = Math.max(1, Number(image.width) || 1080);
  const height = Math.max(1, Number(image.height) || 1080);
  const scale = Math.min(1, 8192 / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  };
}

async function canvasImageUrl(
  source: string,
  siteId: string,
  title: string,
): Promise<string> {
  if (source.startsWith("data:") || source.startsWith("blob:")) return source;
  const durable = isFirstPartyMediaUrl(source)
    ? source
    : await importMediaUrl(source, {
        kind: "image",
        siteId: siteId || "image",
        title,
        registerAsset: false,
      });
  return canvasSafeUrl(durable);
}

export function useFabricImageEditor(
  item: LibraryItem,
  siteId = "",
  options: FabricImageEditorOptions = {},
): FabricImageEditorState {
  const [canvasElement, setCanvasElement] =
    useState<HTMLCanvasElement | null>(null);
  const [view, setView] = useState<FabricControllerView>(INITIAL_VIEW);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [exportFormat, setExportFormat] =
    useState<FabricImageEditorState["exportFormat"]>("png");
  const [exportQuality, setExportQualityState] = useState(92);
  const [exportScale, setExportScaleState] = useState(1);
  const [aiPrompt, setAiPrompt] = useState("");

  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<FabricEditorController | null>(null);
  const fabricRef = useRef<FabricNS | null>(null);
  const optionsRef = useRef(options);
  const viewRef = useRef(view);
  const aliveRef = useRef(true);
  const savingRef = useRef(false);
  const revisionRef = useRef(0);
  const aiBusyRef = useRef(false);
  const pendingAborts = useRef(new Set<AbortController>());
  const objectUrls = useRef(new Set<string>());
  optionsRef.current = options;
  viewRef.current = view;

  const stageCanvasRef = useCallback((element: HTMLCanvasElement | null) => {
    setCanvasElement(element);
  }, []);

  const makeAbort = useCallback(() => {
    const abort = new AbortController();
    pendingAborts.current.add(abort);
    return abort;
  }, []);

  const finishAbort = useCallback((abort: AbortController) => {
    pendingAborts.current.delete(abort);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      pendingAborts.current.forEach((abort) => abort.abort());
      pendingAborts.current.clear();
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current.clear();
    };
  }, []);

  const sourceUrl =
    item.kind === "image" || item.kind === "xhs" || item.kind === "file"
      ? item.url || item.previewUrl || ""
      : "";

  useEffect(() => {
    if (!canvasElement || typeof window === "undefined") return;
    let cancelled = false;
    const abort = makeAbort();
    setLoading(true);
    setError("");
    setNotice("");
    setSavedUrl("");
    setDirty(false);
    revisionRef.current = 0;
    let controller: FabricEditorController | null = null;
    void (async () => {
      try {
        const fabric = await import("fabric");
        if (cancelled || abort.signal.aborted) return;
        fabricRef.current = fabric;
        controller = new FabricEditorController(
          fabric,
          canvasElement,
          stageContainerRef.current,
          {
            onChange: (next) => {
              if (!cancelled) setView(next);
            },
            onDocumentChange: () => {
              if (cancelled) return;
              revisionRef.current += 1;
              setDirty(true);
              setSavedUrl("");
            },
            onError: (message) => {
              if (!cancelled) setError(message);
            },
          },
        );
        controllerRef.current = controller;
        if (sourceUrl) {
          const safeUrl = await canvasImageUrl(sourceUrl, siteId, item.title);
          if (cancelled || abort.signal.aborted) return;
          const image = await loadImageObject(fabric, safeUrl, abort.signal);
          if (cancelled || abort.signal.aborted) {
            image.dispose();
            return;
          }
          controller.setInitialBackground(image, imageDocumentSize(image));
        }
      } catch (caught) {
        if (!cancelled && !isAbortError(caught)) {
          setError(
            caught instanceof Error ? caught.message : "图片画布初始化失败",
          );
        }
      } finally {
        finishAbort(abort);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      abort.abort();
      finishAbort(abort);
      if (controllerRef.current === controller) controllerRef.current = null;
      controller?.dispose();
      if (fabricRef.current) fabricRef.current = null;
    };
  }, [
    canvasElement,
    finishAbort,
    item.title,
    makeAbort,
    siteId,
    sourceUrl,
  ]);

  const addImageFromUrl = useCallback(
    async (url: string) => {
      const source = url.trim();
      const controller = controllerRef.current;
      const fabric = fabricRef.current;
      if (!controller || !fabric || !source) return;
      const abort = makeAbort();
      setError("");
      setNotice("正在导入图片…");
      try {
        const safeUrl = await canvasImageUrl(source, siteId, item.title);
        if (abort.signal.aborted || controllerRef.current !== controller) return;
        const image = await loadImageObject(fabric, safeUrl, abort.signal);
        if (abort.signal.aborted || controllerRef.current !== controller) {
          image.dispose();
          return;
        }
        controller.addImage(image);
        setNotice("图片已添加为独立图层");
      } catch (caught) {
        if (!isAbortError(caught)) {
          setError(caught instanceof Error ? caught.message : "图片导入失败");
        }
      } finally {
        finishAbort(abort);
      }
    },
    [finishAbort, item.title, makeAbort, siteId],
  );

  const addImageFromFile = useCallback(
    async (file: File) => {
      const controller = controllerRef.current;
      const fabric = fabricRef.current;
      if (!controller || !fabric) return;
      if (!file.type.startsWith("image/")) {
        setError("请选择图片文件");
        return;
      }
      const abort = makeAbort();
      const objectUrl = URL.createObjectURL(file);
      objectUrls.current.add(objectUrl);
      setError("");
      try {
        const image = await loadImageObject(fabric, objectUrl, abort.signal);
        if (abort.signal.aborted || controllerRef.current !== controller) {
          image.dispose();
          return;
        }
        controller.addImage(image);
        setNotice("本地图片已添加为独立图层");
      } catch (caught) {
        if (!isAbortError(caught)) {
          setError(caught instanceof Error ? caught.message : "图片读取失败");
        }
      } finally {
        finishAbort(abort);
        objectUrls.current.delete(objectUrl);
        URL.revokeObjectURL(objectUrl);
      }
    },
    [finishAbort, makeAbort],
  );

  const makeExportBlob = useCallback(
    async (
      format = exportFormat,
      quality = exportQuality,
      scale = exportScale,
    ) => {
      const controller = controllerRef.current;
      if (!controller) throw new Error("图片画布尚未就绪");
      if (viewRef.current.cropping) {
        throw new Error("请先确认或取消当前裁剪");
      }
      const { canvas, doc } = controller.getDocument();
      const blob = await exportDocBlob(canvas, doc, {
        format,
        quality: Math.max(0.01, Math.min(1, quality / 100)),
        multiplier: Math.max(0.25, Math.min(4, scale)),
      });
      if (!blob) throw new Error("当前画布无法导出，请检查图片来源");
      return blob;
    },
    [exportFormat, exportQuality, exportScale],
  );

  const download = useCallback(() => {
    void makeExportBlob()
      .then((blob) => downloadImageBlob(blob, item.title, exportFormat))
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "图片下载失败"),
      );
  }, [exportFormat, item.title, makeExportBlob]);

  const save = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return false;
    const savingRevision = revisionRef.current;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const blob = await makeExportBlob();
      const url = await persistImageBlob(
        blob,
        item,
        siteId,
        exportFormat,
        {
          uploadFailed: "保存到我的库失败",
          registerFailed: "图片已上传，但登记到我的库失败",
        },
      );
      if (!aliveRef.current) return false;
      setSavedUrl(url);
      if (revisionRef.current === savingRevision) {
        setDirty(false);
        setNotice("新版本已保存到我的库，原素材未被覆盖");
      } else {
        setNotice("已保存一个版本；之后的修改仍未保存");
      }
      optionsRef.current.onSaved?.(url);
      return true;
    } catch (caught) {
      if (aliveRef.current && !isAbortError(caught)) {
        setError(caught instanceof Error ? caught.message : "图片保存失败");
      }
      return false;
    } finally {
      savingRef.current = false;
      if (aliveRef.current) setSaving(false);
    }
  }, [exportFormat, item, makeExportBlob, siteId]);

  const runAiEdit = useCallback(async () => {
    if (aiBusyRef.current || !aiPrompt.trim()) return;
    const controller = controllerRef.current;
    const fabric = fabricRef.current;
    if (!controller || !fabric) return;
    aiBusyRef.current = true;
    setAiBusy(true);
    setError("");
    setNotice("AI 正在处理当前画布…");
    const abort = makeAbort();
    try {
      const source = await makeExportBlob("png", 100, 1);
      const execute =
        optionsRef.current.onAiEdit ??
        ((prompt: string, image: Blob) =>
          aiEditImage(prompt, image, { siteId: siteId || "image" }));
      const resultUrl = await execute(aiPrompt.trim(), source);
      if (abort.signal.aborted || controllerRef.current !== controller) return;
      const safeUrl = await canvasImageUrl(resultUrl, siteId, `${item.title}-AI`);
      if (abort.signal.aborted || controllerRef.current !== controller) return;
      const image = await loadImageObject(fabric, safeUrl, abort.signal);
      if (abort.signal.aborted || controllerRef.current !== controller) {
        image.dispose();
        return;
      }
      controller.replaceWithBackground(image);
      setNotice("AI 结果已载入画布，可撤销或继续编辑");
    } catch (caught) {
      if (!isAbortError(caught) && aliveRef.current) {
        setError(caught instanceof Error ? caught.message : "AI 改图失败");
      }
    } finally {
      finishAbort(abort);
      aiBusyRef.current = false;
      if (aliveRef.current) setAiBusy(false);
    }
  }, [
    aiPrompt,
    finishAbort,
    item.title,
    makeAbort,
    makeExportBlob,
    siteId,
  ]);

  const controller = () => controllerRef.current;

  return {
    loading,
    saving,
    aiBusy,
    error,
    notice,
    savedUrl,
    dirty,
    stageCanvasRef,
    stageContainerRef,
    doc: view.doc,
    canvasBackground: view.canvasBackground,
    setCanvasBackground: (color) => controller()?.setCanvasBackground(color),
    resizeDoc: (width, height) => controller()?.resizeDoc(width, height),
    zoom: view.zoom,
    zoomIn: () => controller()?.zoomBy(1.2),
    zoomOut: () => controller()?.zoomBy(1 / 1.2),
    zoomFit: () => controller()?.zoomFit(),
    zoomTo100: () => controller()?.zoomTo100(),
    activeTool: view.activeTool,
    setActiveTool: (tool) => controller()?.setTool(tool),
    brush: view.brush,
    setBrush: (patch) => controller()?.setBrush(patch),
    addText: () => controller()?.addText(),
    addShape: (kind) => controller()?.addShape(kind),
    addImageFromUrl,
    addImageFromFile,
    layers: view.layers,
    selectLayer: (id) => controller()?.selectLayer(id),
    moveLayer: (id, direction) => controller()?.moveLayer(id, direction),
    toggleLayerLock: (id) => controller()?.toggleLayerLock(id),
    toggleLayerVisible: (id) => controller()?.toggleLayerVisible(id),
    removeLayer: (id) => controller()?.removeLayer(id),
    duplicateLayer: async (id) => controller()?.duplicateLayer(id),
    selected: view.selected,
    setSelectedOpacity: (value) => controller()?.setSelectedOpacity(value),
    setSelectedShadow: (patch) => controller()?.setSelectedShadow(patch),
    setSelectedStroke: (patch) => controller()?.setSelectedStroke(patch),
    setSelectedFill: (color) => controller()?.setSelectedFill(color),
    setSelectedRadius: (px) => controller()?.setSelectedRadius(px),
    setSelectedText: (patch) => controller()?.setSelectedText(patch),
    deleteSelected: () => controller()?.deleteSelected(),
    duplicateSelected: async () => controller()?.duplicateSelected(),
    transformInfo: view.transformInfo,
    rotateTarget: (delta) => controller()?.rotateTarget(delta),
    setTargetAngle: (angle) => controller()?.setTargetAngle(angle),
    flipTarget: (axis) => controller()?.flipTarget(axis),
    filterInfo: view.filterInfo,
    setFilter: (key, value) => controller()?.setFilter(key, value),
    resetFilters: () => controller()?.resetFilters(),
    cropping: view.cropping,
    cropRatio: view.cropRatio,
    startCrop: () => controller()?.startCrop(),
    setCropRatio: (ratio) => controller()?.setCropRatio(ratio),
    confirmCrop: async () => controller()?.confirmCrop(),
    cancelCrop: () => controller()?.cancelCrop(),
    canUndo: view.canUndo,
    canRedo: view.canRedo,
    undo: () => controller()?.undo(),
    redo: () => controller()?.redo(),
    exportFormat,
    setExportFormat,
    exportQuality,
    setExportQuality: (quality) =>
      setExportQualityState(Math.max(1, Math.min(100, quality))),
    exportScale,
    setExportScale: (scale) =>
      setExportScaleState(Math.max(0.25, Math.min(4, scale))),
    download,
    save,
    aiAvailable: true,
    aiPrompt,
    setAiPrompt,
    runAiEdit,
  };
}
