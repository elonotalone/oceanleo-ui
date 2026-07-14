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
import { normalizeSavedModelView } from "./model3d-view";

const MAX_MODEL_BYTES = 512 * 1024 * 1024;
const DEFAULT_AZIMUTH = 0;
const DEFAULT_ELEVATION = 75;
const DEFAULT_DISTANCE = 105;

interface ModelProgressEvent extends Event {
  detail?: { totalProgress?: number };
}

interface ModelErrorEvent extends Event {
  detail?: { message?: string; type?: string };
}

export interface Model3DWorkbenchState {
  viewerRef: RefCallback<HTMLElement>;
  title: string;
  sourceUrl: string;
  posterUrl: string;
  viewerReady: boolean;
  modelLoaded: boolean;
  loading: boolean;
  progress: number;
  error: string;
  notice: string;
  savedUrl: string;
  capturing: boolean;
  saving: boolean;
  downloading: boolean;
  dirty: boolean;
  azimuth: number;
  elevation: number;
  zoom: number;
  autoRotate: boolean;
  exposure: number;
  shadowIntensity: number;
  shadowSoftness: number;
  background: string;
  animations: string[];
  animationName: string;
  animationPlaying: boolean;
  animationSpeed: number;
  setOrbit: (azimuth: number, elevation: number) => void;
  setZoom: (distancePercent: number) => void;
  resetCamera: () => void;
  setAutoRotate: (enabled: boolean) => void;
  setExposure: (value: number) => void;
  setShadowIntensity: (value: number) => void;
  setShadowSoftness: (value: number) => void;
  setBackground: (value: string) => void;
  selectAnimation: (name: string) => void;
  toggleAnimation: () => void;
  setAnimationSpeed: (value: number) => void;
  downloadScreenshot: () => Promise<void>;
  saveScreenshot: () => Promise<void>;
  downloadModel: () => Promise<void>;
  saveCopy: () => Promise<void>;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof DOMException && caught.name === "AbortError") return "";
  return caught instanceof Error ? caught.message : fallback;
}

function safeStem(title: string): string {
  const stem = title
    .replace(/\.(?:glb|gltf)$/i, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim();
  return stem || "oceanleo-model";
}

function modelExtension(url: string, title: string): "glb" | "gltf" {
  const hint = `${url} ${title}`.toLowerCase();
  return /\.gltf(?:$|[?#\s])/.test(hint) ? "gltf" : "glb";
}

function triggerDownload(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
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
  const [saving, setSaving] = useState(false);
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
    const source = item.url || item.previewUrl || "";
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
      setError(tt("没有可加载的 GLB/GLTF 模型地址"));
      return;
    }
    let disposed = false;
    void (async () => {
      try {
        const durableUrl = isFirstPartyMediaUrl(source)
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
  }, [item.meta.view, item.previewUrl, item.title, item.url, siteId, tt]);

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
      triggerDownload(blob, `${safeStem(item.title)}-view.png`);
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
    setSaving(true);
    setError("");
    const generation = sourceGenerationRef.current;
    try {
      const title = `${safeStem(item.title)}-${tt("3D 视图截图")}`;
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
      if (aliveRef.current) setSaving(false);
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
      triggerDownload(blob, `${safeStem(item.title)}.${extension}`);
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

  const saveCopy = useCallback(async () => {
    if (!sourceUrl || saveBusyRef.current || !modelLoaded) return;
    saveBusyRef.current = true;
    setSaving(true);
    setError("");
    const generation = sourceGenerationRef.current;
    const savingRevision = revisionRef.current;
    try {
      const title = `${safeStem(item.title)}-${tt("视图副本")}`;
      let thumbUrl = posterUrl;
      try {
        const screenshot = await captureBlob();
        const uploaded = await uploadFile(
          new File([screenshot], `${title}.png`, { type: "image/png" }),
          { siteId: siteId || "threed", title: `${title}-${tt("预览")}` },
        );
        if (uploaded.ok && uploaded.data?.file?.url) {
          thumbUrl = uploaded.data.file.url;
        }
      } catch {
        // A cross-origin texture can block canvas export; the model copy itself
        // remains valid and can still use the existing poster.
      }
      const saved = await saveWorks(siteId || "threed", [
        {
          url: sourceUrl,
          thumb_url: thumbUrl || undefined,
          media_type: "model3d",
          title,
          kind: "model3d",
          meta: {
            parent_asset_id: item.id,
            editor: "model-viewer-native-v1",
            view: {
              camera_orbit: `${azimuth}deg ${elevation}deg ${zoom}%`,
              auto_rotate: autoRotate,
              exposure,
              shadow_intensity: shadowIntensity,
              shadow_softness: shadowSoftness,
              background,
              animation: animationName,
              animation_speed: animationSpeed,
            },
          },
        },
      ]);
      if (!saved.ok || Number(saved.data?.saved || 0) !== 1) {
        throw new Error(saved.error || tt("3D 副本登记到我的库失败"));
      }
      if (!aliveRef.current || generation !== sourceGenerationRef.current) return;
      setSavedUrl(sourceUrl);
      if (revisionRef.current === savingRevision) {
        setDirty(false);
        setNotice(tt("3D 视图副本已保存到我的库"));
      } else {
        setNotice(tt("已保存一个视图副本；之后的调整仍未保存"));
      }
      onSaved?.(sourceUrl);
    } catch (caught) {
      if (aliveRef.current) setError(errorMessage(caught, tt("保存 3D 副本失败")));
    } finally {
      saveBusyRef.current = false;
      if (aliveRef.current) setSaving(false);
    }
  }, [
    animationName,
    animationSpeed,
    autoRotate,
    azimuth,
    background,
    captureBlob,
    elevation,
    exposure,
    item.id,
    item.title,
    modelLoaded,
    onSaved,
    posterUrl,
    shadowIntensity,
    shadowSoftness,
    siteId,
    sourceUrl,
    tt,
    zoom,
  ]);

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
    saving,
    downloading,
    dirty,
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
    downloadScreenshot,
    saveScreenshot,
    downloadModel,
    saveCopy,
  };
}
