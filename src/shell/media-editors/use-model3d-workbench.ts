"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefCallback,
} from "react";
import type { ModelViewerElement } from "@google/model-viewer";
import { useUI } from "../../i18n/ui/useUI";
import { saveWorks, uploadFile } from "../../lib/database";
import {
  fetchMediaBlob,
  importMediaUrl,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import type { LibraryItem } from "../library-data";
import { MAX_MODEL_BYTES, modelExtension, safeModelStem, triggerModelDownload, uploadImportedModel } from "./model3d-files";
import { normalizeModel3DRecovery } from "./model3d-project";
import { normalizeSavedModelView } from "./model3d-view";
import type { Model3DWorkbenchState } from "./model3d-workbench-state";
export type { Model3DWorkbenchState } from "./model3d-workbench-state";
import { useModel3DSave } from "./use-model3d-save";
const DEFAULT_AZIMUTH = 0, DEFAULT_ELEVATION = 75, DEFAULT_DISTANCE = 105;
interface ModelProgressEvent extends Event {
  detail?: { totalProgress?: number };
}

interface ModelErrorEvent extends Event {
  detail?: { message?: string; type?: string };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof DOMException && caught.name === "AbortError") return "";
  return caught instanceof Error ? caught.message : fallback;
}

export function useModel3DWorkbench(
  item: LibraryItem,
  siteId = "",
  onSaved?: (url: string) => void,
): Model3DWorkbenchState {
  const tt = useUI();
  const viewerElementRef = useRef<ModelViewerElement | null>(null);
  const sourceGenerationRef = useRef(0);
  const aliveRef = useRef(true);
  const captureBusyRef = useRef(false);
  const saveBusyRef = useRef(false);
  const revisionRef = useRef(0);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const [viewerNode, setViewerNode] = useState<ModelViewerElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [viewerReady, setViewerReady] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(true);
  const [modelLoading, setModelLoading] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [savingScreenshot, setSavingScreenshot] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [azimuth, setAzimuth] = useState(DEFAULT_AZIMUTH);
  const [elevation, setElevation] = useState(DEFAULT_ELEVATION);
  const [zoom, setZoomState] = useState(DEFAULT_DISTANCE);
  const [autoRotate, setAutoRotate] = useState(false);
  const [exposure, setExposureState] = useState(1);
  const [shadowIntensity, setShadowIntensityState] = useState(1);
  const [shadowSoftness, setShadowSoftnessState] = useState(1);
  const [background, setBackground] = useState("#f5f5f4");
  const [animations, setAnimations] = useState<string[]>([]);
  const [animationName, setAnimationName] = useState("");
  const [animationPlaying, setAnimationPlaying] = useState(false);
  const [animationSpeed, setAnimationSpeedState] = useState(1);

  const previewCandidate = item.thumbUrl || item.previewUrl || "";
  const posterUrl = /\.(?:glb|gltf)(?:$|[?#])/i.test(previewCandidate)
    ? ""
    : previewCandidate;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      sourceGenerationRef.current += 1;
      downloadAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.customElements?.get("model-viewer")) {
      setViewerReady(true);
      return;
    }
    let alive = true;
    void import("@google/model-viewer")
      .then(() => {
        if (alive) setViewerReady(Boolean(window.customElements?.get("model-viewer")));
      })
      .catch((caught) => {
        if (alive) setError(errorMessage(caught, tt("3D 查看器加载失败")));
      });
    return () => {
      alive = false;
    };
  }, [tt]);

  useEffect(() => {
    const source =
      (typeof item.meta.model_source_url === "string"
        ? item.meta.model_source_url
        : "") ||
      (typeof item.meta.source_asset_url === "string"
        ? item.meta.source_asset_url
        : "") ||
      item.url ||
      item.previewUrl ||
      "";
    const view = normalizeSavedModelView(item.meta.view);
    const generation = ++sourceGenerationRef.current;
    setSourceLoading(true);
    setSourceUrl("");
    setModelLoaded(false);
    setAnimations([]);
    setAzimuth(view.azimuth);
    setElevation(view.elevation);
    setZoomState(view.zoom);
    setAutoRotate(view.autoRotate);
    setExposureState(view.exposure);
    setShadowIntensityState(view.shadowIntensity);
    setShadowSoftnessState(view.shadowSoftness);
    setBackground(view.background);
    setAnimationName(view.animation);
    setAnimationPlaying(false);
    setAnimationSpeedState(view.animationSpeed);
    setProgress(0);
    setSavedUrl("");
    setDirty(false);
    revisionRef.current = 0;
    setNotice("");
    setError("");
    if (!source) {
      setSourceLoading(false);
      setNotice(tt("空白 3D 场景已就绪，请导入 GLB 或自包含 glTF 模型"));
      return;
    }
    let disposed = false;
    void (async () => {
      try {
        const preserveGltfClosure =
          modelExtension(source, item.title) === "gltf";
        const durableUrl =
          isFirstPartyMediaUrl(source) || preserveGltfClosure
          ? source
          : await importMediaUrl(source, {
              kind: "model3d",
              siteId: siteId || "threed",
              title: item.title,
              registerAsset: true,
            });
        if (disposed || generation !== sourceGenerationRef.current) return;
        setSourceUrl(durableUrl);
      } catch (caught) {
        if (!disposed && generation === sourceGenerationRef.current) {
          setError(errorMessage(caught, tt("3D 模型导入失败")));
        }
      } finally {
        if (!disposed && generation === sourceGenerationRef.current) {
          setSourceLoading(false);
        }
      }
    })();
    return () => {
      disposed = true;
    };
  }, [
    item.meta.model_source_url,
    item.meta.source_asset_url,
    item.meta.view,
    item.previewUrl,
    item.title,
    item.url,
    siteId,
    tt,
  ]);

  const viewerRef = useCallback<RefCallback<HTMLElement>>((node) => {
    const viewer = node as ModelViewerElement | null;
    viewerElementRef.current = viewer;
    setViewerNode(viewer);
  }, []);

  const markDirty = useCallback(() => {
    revisionRef.current += 1;
    setDirty(true);
    setSavedUrl("");
  }, []);

  const importModel = useCallback(
    async (file: File) => {
      setSourceLoading(true);
      setError("");
      setNotice(tt("正在上传 3D 模型…"));
      try {
        const url = await uploadImportedModel(file, siteId, tt);
        setSourceUrl(url);
        setModelLoaded(false);
        setProgress(0);
        markDirty();
        setNotice(tt("模型已导入，可以调整场景和视图"));
      } catch (caught) {
        setError(errorMessage(caught, tt("3D 模型导入失败")));
      } finally {
        setSourceLoading(false);
      }
    },
    [markDirty, siteId, tt],
  );
  const openModelUrl = useCallback(
    (url: string) => {
      if (!/^https?:\/\//i.test(url)) {
        setError(tt("3D 模型地址无效"));
        return;
      }
      setError("");
      setNotice(tt("正在载入完整 3D 模型…"));
      setSourceUrl(url);
      setModelLoaded(false);
      setProgress(0);
      markDirty();
    },
    [markDirty, tt],
  );

  useEffect(() => {
    const viewer = viewerNode;
    if (!viewer || !sourceUrl) {
      setModelLoading(false);
      return;
    }
    let disposed = false;
    setModelLoading(true);
    setModelLoaded(false);
    setProgress(0);
    const onLoad = () => {
      if (disposed) return;
      const available = [...viewer.availableAnimations];
      setAnimations(available);
      setAnimationName((current) =>
        current && available.includes(current) ? current : available[0] || "",
      );
      setModelLoaded(true);
      setModelLoading(false);
      setProgress(1);
      setError("");
    };
    const onProgress = (event: Event) => {
      const value = (event as ModelProgressEvent).detail?.totalProgress;
      if (!disposed && Number.isFinite(value)) setProgress(clamp(Number(value), 0, 1));
    };
    const onError = (event: Event) => {
      if (disposed) return;
      const detail = (event as ModelErrorEvent).detail;
      setModelLoading(false);
      setModelLoaded(false);
      setError(detail?.message || detail?.type || tt("3D 模型加载失败"));
    };
    viewer.addEventListener("load", onLoad);
    viewer.addEventListener("progress", onProgress);
    viewer.addEventListener("error", onError);
    queueMicrotask(() => {
      if (!disposed && viewer.loaded && viewer.src === sourceUrl) onLoad();
    });
    return () => {
      disposed = true;
      viewer.removeEventListener("load", onLoad);
      viewer.removeEventListener("progress", onProgress);
      viewer.removeEventListener("error", onError);
    };
  }, [sourceUrl, tt, viewerNode]);

  useEffect(() => {
    const viewer = viewerElementRef.current;
    if (!viewer || !modelLoaded) return;
    viewer.timeScale = animationSpeed;
    viewer.animationName = animationName || undefined;
    if (animationName && animationPlaying) viewer.play();
    else viewer.pause();
  }, [animationName, animationPlaying, animationSpeed, modelLoaded]);

  const setOrbit = useCallback((nextAzimuth: number, nextElevation: number) => {
    const safeAzimuth = clamp(nextAzimuth, -180, 180);
    const safeElevation = clamp(nextElevation, 0, 180);
    setAzimuth(safeAzimuth);
    setElevation(safeElevation);
    const viewer = viewerElementRef.current;
    if (viewer) {
      viewer.cameraOrbit = `${safeAzimuth}deg ${safeElevation}deg ${zoom}%`;
      viewer.jumpCameraToGoal();
    }
    markDirty();
  }, [markDirty, zoom]);

  const setZoom = useCallback((distancePercent: number) => {
    const safeZoom = clamp(distancePercent, 50, 300);
    setZoomState(safeZoom);
    const viewer = viewerElementRef.current;
    if (viewer) {
      viewer.cameraOrbit = `${azimuth}deg ${elevation}deg ${safeZoom}%`;
      viewer.jumpCameraToGoal();
    }
    markDirty();
  }, [azimuth, elevation, markDirty]);

  const resetCamera = useCallback(() => {
    setAzimuth(DEFAULT_AZIMUTH);
    setElevation(DEFAULT_ELEVATION);
    setZoomState(DEFAULT_DISTANCE);
    const viewer = viewerElementRef.current;
    if (viewer) {
      viewer.cameraOrbit =
        `${DEFAULT_AZIMUTH}deg ${DEFAULT_ELEVATION}deg ${DEFAULT_DISTANCE}%`;
      viewer.jumpCameraToGoal();
    }
    markDirty();
  }, [markDirty]);

  const captureBlob = useCallback(async (): Promise<Blob> => {
    const viewer = viewerElementRef.current;
    if (!viewer || !viewer.loaded) throw new Error(tt("3D 模型尚未加载完成"));
    const blob = await viewer.toBlob({
      mimeType: "image/png",
      qualityArgument: 1,
      idealAspect: true,
    });
    if (!blob.size) throw new Error(tt("3D 截图为空"));
    return blob;
  }, [tt]);

  const downloadScreenshot = useCallback(async () => {
    if (captureBusyRef.current) return;
    captureBusyRef.current = true;
    setCapturing(true);
    setError("");
    try {
      const blob = await captureBlob();
      if (!aliveRef.current) return;
      triggerModelDownload(blob, `${safeModelStem(item.title)}-view.png`);
      setNotice(tt("3D 视图截图已下载"));
    } catch (caught) {
      if (aliveRef.current) setError(errorMessage(caught, tt("3D 截图失败")));
    } finally {
      captureBusyRef.current = false;
      if (aliveRef.current) setCapturing(false);
    }
  }, [captureBlob, item.title, tt]);

  const saveScreenshot = useCallback(async () => {
    if (saveBusyRef.current) return;
    saveBusyRef.current = true;
    setSavingScreenshot(true);
    setError("");
    const generation = sourceGenerationRef.current;
    try {
      const title = `${safeModelStem(item.title)}-${tt("3D 视图截图")}`;
      const blob = await captureBlob();
      const uploaded = await uploadFile(
        new File([blob], `${title}.png`, { type: "image/png" }),
        { siteId: siteId || "threed", title },
      );
      const url = uploaded.data?.file?.url || "";
      if (!uploaded.ok || !url) throw new Error(uploaded.error || tt("截图上传失败"));
      const saved = await saveWorks(siteId || "threed", [
        {
          url,
          thumb_url: url,
          media_type: "image",
          title,
          kind: "image",
          meta: { parent_asset_id: item.id, editor: "model-viewer-screenshot-v1" },
        },
      ]);
      if (!saved.ok || Number(saved.data?.saved || 0) !== 1) {
        throw new Error(saved.error || tt("截图已上传，但登记到我的库失败"));
      }
      if (!aliveRef.current || generation !== sourceGenerationRef.current) return;
      setSavedUrl(url);
      setNotice(tt("3D 视图截图已保存到我的库"));
      onSaved?.(url);
    } catch (caught) {
      if (aliveRef.current) setError(errorMessage(caught, tt("保存 3D 截图失败")));
    } finally {
      saveBusyRef.current = false;
      if (aliveRef.current) setSavingScreenshot(false);
    }
  }, [captureBlob, item.id, item.title, onSaved, siteId, tt]);

  const downloadModel = useCallback(async () => {
    if (!sourceUrl || downloading) return;
    downloadAbortRef.current?.abort();
    const controller = new AbortController();
    downloadAbortRef.current = controller;
    setDownloading(true);
    setError("");
    try {
      const blob = await fetchMediaBlob(sourceUrl, {
        maxBytes: MAX_MODEL_BYTES,
        signal: controller.signal,
      });
      if (controller.signal.aborted || !aliveRef.current) return;
      const extension = modelExtension(sourceUrl, item.title);
      triggerModelDownload(blob, `${safeModelStem(item.title)}.${extension}`);
      setNotice(tt("3D 模型文件已下载"));
    } catch (caught) {
      if (!controller.signal.aborted && aliveRef.current) {
        setError(errorMessage(caught, tt("3D 模型下载失败")));
      }
    } finally {
      if (downloadAbortRef.current === controller) downloadAbortRef.current = null;
      if (aliveRef.current) setDownloading(false);
    }
  }, [downloading, item.title, sourceUrl, tt]);

  const { saving: savingCopy, saveCopy } = useModel3DSave({
    item,
    siteId,
    sourceUrl,
    modelLoaded,
    posterUrl,
    view: {
      azimuth,
      elevation,
      zoom,
      autoRotate,
      exposure,
      shadowIntensity,
      shadowSoftness,
      background,
      animationName,
      animationSpeed,
    },
    captureBlob,
    revisionRef,
    sourceGenerationRef,
    aliveRef,
    setError,
    setNotice,
    setSavedUrl,
    setDirty,
    onSaved,
    tt,
  });

  const restoreRecovery = useCallback(
    (payload: unknown): boolean => {
      const recovered = normalizeModel3DRecovery(payload, {
        sourceUrl,
        azimuth,
        elevation,
        zoom,
        autoRotate,
        exposure,
        shadowIntensity,
        shadowSoftness,
        background,
        animationName,
        animationSpeed,
      });
      if (!recovered) return false;
      if (recovered.sourceUrl) setSourceUrl(recovered.sourceUrl);
      setAzimuth(recovered.azimuth);
      setElevation(recovered.elevation);
      setZoomState(recovered.zoom);
      setAutoRotate(recovered.autoRotate);
      setExposureState(recovered.exposure);
      setShadowIntensityState(recovered.shadowIntensity);
      setShadowSoftnessState(recovered.shadowSoftness);
      setBackground(recovered.background);
      setAnimationName(recovered.animationName);
      setAnimationSpeedState(recovered.animationSpeed);
      markDirty();
      setNotice(tt("已恢复上次未同步的本地草稿"));
      return true;
    },
    [
      animationSpeed,
      animationName,
      autoRotate,
      azimuth,
      background,
      elevation,
      exposure,
      markDirty,
      shadowIntensity,
      shadowSoftness,
      sourceUrl,
      tt,
      zoom,
    ],
  );

  return {
    viewerRef,
    title: item.title,
    sourceUrl,
    posterUrl,
    viewerReady,
    modelLoaded,
    loading: sourceLoading || (Boolean(sourceUrl) && (!viewerReady || modelLoading)),
    progress,
    error,
    notice,
    savedUrl,
    capturing,
    saving: savingScreenshot || savingCopy,
    downloading,
    dirty,
    editRevision: revisionRef.current,
    azimuth,
    elevation,
    zoom,
    autoRotate,
    exposure,
    shadowIntensity,
    shadowSoftness,
    background,
    animations,
    animationName,
    animationPlaying,
    animationSpeed,
    setOrbit,
    setZoom,
    resetCamera,
    setAutoRotate: (value) => {
      setAutoRotate(value);
      markDirty();
    },
    setExposure: (value) => {
      setExposureState(clamp(value, 0.1, 2));
      markDirty();
    },
    setShadowIntensity: (value) => {
      setShadowIntensityState(clamp(value, 0, 2));
      markDirty();
    },
    setShadowSoftness: (value) => {
      setShadowSoftnessState(clamp(value, 0, 1));
      markDirty();
    },
    setBackground: (value) => {
      setBackground(value);
      markDirty();
    },
    selectAnimation: (name) => {
      setAnimationName(name);
      setAnimationPlaying(false);
      if (viewerElementRef.current) viewerElementRef.current.currentTime = 0;
      markDirty();
    },
    toggleAnimation: () => {
      if (animationName) setAnimationPlaying((value) => !value);
    },
    setAnimationSpeed: (value) => {
      setAnimationSpeedState(clamp(value, 0.1, 3));
      markDirty();
    },
    importModel,
    openModelUrl,
    downloadScreenshot,
    saveScreenshot,
    downloadModel,
    saveCopy,
    restoreRecovery,
  };
}
