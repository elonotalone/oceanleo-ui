"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { LibraryItem } from "../library-data";
import type { Model3DPrevisAdapter } from "./model3d-director";
import {
  normalizeModel3DProjectRecovery,
  normalizeModel3DSourceProvenance,
  type Model3DSourceProvenance,
  type Model3DViewProject,
} from "./model3d-project";
import type { Model3DOperation } from "./model3d-operations.mjs";
import { Model3DSceneRuntime, type Model3DAnnotationPoint,
  type Model3DAnnotationScreen, type Model3DViewState } from "./model3d-runtime.mjs";
import { normalizeModel3DEnvironmentUrl } from "./model3d-view";
import type { Model3DWorkbenchState } from "./model3d-workbench-state";
import {
  DEFAULT_MODEL3D_VIEW,
  model3DPosterForItem,
  model3DSidecarWithoutSource,
} from "./model3d-workbench-defaults";
import { clampModel3DValue } from "./model3d-workbench-helpers";
import { useModel3DMediaActions } from "./use-model3d-media-actions";
import { useModel3DDirector } from "./use-model3d-director";
import { useModel3DProjectBootstrap } from "./use-model3d-project-bootstrap";
import { useModel3DRuntime } from "./use-model3d-runtime";
import { useModel3DSave } from "./use-model3d-save";
import { useModel3DSidecar } from "./use-model3d-sidecar";
import { useModel3DSourceActions } from "./use-model3d-source-actions";
import { useModel3DSourceLoader } from "./use-model3d-source-loader";

export type { Model3DWorkbenchState } from "./model3d-workbench-state";

export function useModel3DWorkbench(
  item: LibraryItem,
  siteId = "",
  onSaved?: (url: string) => void,
  previsAdapter?: Model3DPrevisAdapter,
): Model3DWorkbenchState {
  const tt = useUI();
  const runtimeRef = useRef<Model3DSceneRuntime | null>(null);
  const aliveRef = useRef(true);
  const sourceGenerationRef = useRef(0);
  const revisionRef = useRef(0);
  const loadedSourceRef = useRef("");
  const pendingOperationsRef = useRef<Model3DOperation[]>([]);
  const annotationPointRef = useRef<
    ((point: Model3DAnnotationPoint) => void) | undefined
  >(undefined);
  const annotationFrameRef = useRef<
    ((entries: Model3DAnnotationScreen[]) => void) | undefined
  >(undefined);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceLoading, setSourceLoading] = useState(true);
  const [modelLoading, setModelLoading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [savedUrl, setSavedUrl] = useState("");
  const [dirty, setDirty] = useState(false);
  const [sourceProvenance, setSourceProvenance] =
    useState<Model3DSourceProvenance>(() =>
      normalizeModel3DSourceProvenance(null));
  const artifactIdentity = useMemo(() => {
    if (!sourceProvenance.artifactId && !sourceProvenance.revisionId) {
      return null;
    }
    return {
      artifactId: sourceProvenance.artifactId,
      revisionId: sourceProvenance.revisionId,
      sourceDigest: sourceProvenance.sourceDigest,
    };
  }, [
    sourceProvenance.artifactId,
    sourceProvenance.revisionId,
    sourceProvenance.sourceDigest,
  ]);
  const [view, setView] = useState<Model3DViewProject>(DEFAULT_MODEL3D_VIEW);
  const viewRef = useRef(view);
  viewRef.current = view;
  const markDirty = useCallback(() => {
    revisionRef.current += 1;
    setDirty(true);
    setSavedUrl("");
  }, []);

  const sidecar = useModel3DSidecar({
    runtimeRef,
    markDirty,
    setError,
    tt,
  });
  annotationPointRef.current = sidecar.placeAnnotation;
  annotationFrameRef.current = sidecar.setAnnotationScreens;

  const applyView = useCallback(
    (next: Model3DViewProject, emit = false) => {
      viewRef.current = next;
      setView(next);
      sidecar.reset(next);
      runtimeRef.current?.setView(next, { emit });
      runtimeRef.current?.setAnnotations(next.annotations);
      runtimeRef.current?.selectAnimation(next.animationName, false);
      runtimeRef.current?.setAnimationSpeed(next.animationSpeed);
      runtimeRef.current?.setAnimationTime(next.animationTime);
      runtimeRef.current?.setAnimationPlaying(next.animationPlaying);
    },
    [sidecar.reset],
  );

  const { canvasRef, runtimeReady, runtimeState, setRuntimeState } =
    useModel3DRuntime({
      runtimeRef,
      aliveRef,
      viewRef,
      markDirty,
      setView,
      setError,
      annotationPointRef,
      annotationFrameRef,
    });

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      sourceGenerationRef.current += 1;
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useModel3DProjectBootstrap({
    item,
    artifactSourceDigest: item.artifact?.renditions.source?.digest || "",
    siteId,
    tt,
    aliveRef,
    sourceGenerationRef,
    loadedSourceRef,
    pendingOperationsRef,
    runtimeRef,
    revisionRef,
    applyView,
    setSourceUrl,
    setSourceLoading,
    setModelLoading,
    setProgress,
    setRuntimeState,
    setSavedUrl,
    setDirty,
    setNotice,
    setError,
    setSourceProvenance,
  });

  const { handlePreparedSource, importModel, openModelUrl } =
    useModel3DSourceActions({
      siteId,
      sourceGenerationRef,
      loadedSourceRef,
      pendingOperationsRef,
      markDirty,
      setSourceProvenance,
      setSourceUrl,
      setSourceLoading,
      setProgress,
      setError,
      setNotice,
      tt,
    });

  useModel3DSourceLoader({
    runtimeRef,
    runtimeReady,
    sourceUrl,
    dependencyBaseUrl: sourceProvenance.dependencyBaseUrl || sourceUrl,
    artifactIdentity,
    reloadToken,
    sourceGenerationRef,
    loadedSourceRef,
    aliveRef,
    viewRef,
    pendingOperationsRef,
    annotations: sidecar.annotations,
    setModelLoading,
    setProgress,
    setError,
    setNotice,
    onPreparedSource: handlePreparedSource,
    tt,
  });

  const updateView = useCallback(
    (patch: Partial<Model3DViewState>) => {
      setView((current) => {
        const next = { ...current, ...patch };
        viewRef.current = next;
        return next;
      });
      runtimeRef.current?.setView(patch);
      if (!runtimeRef.current?.gestureActive) markDirty();
    },
    [markDirty],
  );

  const modelReady = runtimeState.loaded && !sourceLoading && !modelLoading &&
    loadedSourceRef.current === sourceUrl;
  const posterUrl = model3DPosterForItem(item);
  const {
    saving: savingCopy,
    saveCopy,
    checkpointForExport,
  } = useModel3DSave({
    item,
    siteId,
    modelLoaded: modelReady,
    checkpointUrl: sourceUrl,
    sourceProvenance,
    posterUrl,
    view: model3DSidecarWithoutSource(view, sidecar.annotations),
    runtimeRef,
    revisionRef,
    sourceGenerationRef,
    aliveRef,
    setError,
    setNotice,
    setSavedUrl,
    setDirty,
    onDurableModelUrl: (url, provenance) => {
      loadedSourceRef.current = url;
      setSourceProvenance(provenance);
      setSourceUrl(url);
    },
    onSaved,
    tt,
  });
  const mediaActions = useModel3DMediaActions({
    runtimeRef,
    modelLoaded: modelReady,
    exportModel: checkpointForExport,
    item,
    siteId,
    setError,
    setNotice,
    setSavedUrl,
    onSaved,
    tt,
  });
  const directorActions = useModel3DDirector({
    runtimeRef,
    view,
    viewRef,
    setView,
    runtimeSelection: runtimeState.selection,
    modelReady,
    itemId: item.id,
    itemTitle: item.title,
    siteId,
    saveScreenshot: mediaActions.saveScreenshot,
    overrideAdapter: previsAdapter,
    markDirty,
    setError,
    setNotice,
    tt,
  });

  const restoreRecovery = useCallback((payload: unknown) => {
    const recovered = normalizeModel3DProjectRecovery(
      payload,
      {
        ...viewRef.current,
        sourceUrl,
        annotations: sidecar.annotations,
      },
      sourceUrl,
    );
    if (!recovered) return false;
    sourceGenerationRef.current += 1;
    loadedSourceRef.current = "";
    pendingOperationsRef.current = recovered.operations;
    runtimeRef.current?.clear();
    setSourceProvenance(recovered.provenance);
    setSourceUrl(recovered.checkpointUrl);
    setReloadToken((current) => current + 1);
    applyView(recovered.view);
    markDirty();
    setNotice(tt("已恢复上次未同步的本地草稿"));
    return true;
  }, [applyView, markDirty, sidecar.annotations, sourceUrl, tt]);

  const selectedMaterial =
    runtimeState.selection?.materials.find((entry) => entry.selected) || null;
  return {
    canvasRef,
    title: item.title,
    sourceUrl,
    sourceFormat: sourceProvenance.format,
    sourceProvenance,
    posterUrl,
    runtimeReady,
    modelLoaded: modelReady,
    loading: sourceLoading || modelLoading,
    progress,
    error,
    notice,
    savedUrl,
    capturing: mediaActions.capturing,
    saving: mediaActions.savingScreenshot || savingCopy,
    downloading: mediaActions.downloading,
    directing: directorActions.directing,
    dirty,
    editRevision: revisionRef.current,
    operationJournal: runtimeState.operationJournal,
    operationCount: runtimeState.operationCount,
    operationBytes: runtimeState.operationBytes,
    azimuth: view.azimuth,
    elevation: view.elevation,
    zoom: view.zoom,
    autoRotate: view.autoRotate,
    exposure: view.exposure,
    shadowIntensity: view.shadowIntensity,
    shadowSoftness: view.shadowSoftness,
    shadowEnabled: view.shadowEnabled,
    background: view.background,
    environmentUrl: view.environmentUrl,
    environmentIntensity: view.environmentIntensity,
    sceneNodes: runtimeState.nodes,
    selectedNode: runtimeState.selection,
    transformMode: runtimeState.transformMode,
    canUndo: runtimeState.history.canUndo,
    canRedo: runtimeState.history.canRedo,
    animations: runtimeState.animations.map((entry) => entry.name),
    animationName: runtimeState.animationName,
    animationPlaying: runtimeState.animationPlaying,
    animationSpeed: runtimeState.animationSpeed,
    animationTime: runtimeState.animationTime,
    animationDuration: runtimeState.animationDuration,
    materials: runtimeState.selection?.materials || [],
    selectedMaterialIndex: selectedMaterial?.index ?? 0,
    annotations: sidecar.annotations,
    annotationScreens: sidecar.annotationScreens,
    selectedAnnotationId: sidecar.selectedAnnotationId,
    annotationDraft: sidecar.annotationDraft,
    annotationPlacementArmed: runtimeState.annotationPlacementArmed,
    director: view.director,
    directorPrevisReceipt: directorActions.receipt,
    directorDepthOfFieldAvailability:
      directorActions.depthOfFieldAvailability,
    directorScreenshotAvailability: directorActions.screenshotAvailability,
    directorPlayblastAvailability: directorActions.playblastAvailability,
    selectNode: (id) => runtimeRef.current?.setSelectedNode(id),
    setTransformMode: (mode) => runtimeRef.current?.setTransformMode(mode),
    beginGesture: (controlId) => void runtimeRef.current?.beginGesture(controlId),
    commitGesture: () => void runtimeRef.current?.commitGesture(),
    cancelGesture: () => void runtimeRef.current?.cancelGesture(),
    patchSelectedTransform: (patch) =>
      runtimeRef.current?.patchSelectedTransform(patch),
    setSelectedNodeVisible: (visible) =>
      runtimeRef.current?.setNodeVisible(visible),
    deleteSelectedNode: () => runtimeRef.current?.deleteSelected(),
    addCamera: () => runtimeRef.current?.addCamera(),
    addLight: (kind) => runtimeRef.current?.addLight(kind),
    patchSelectedCamera: (patch) =>
      runtimeRef.current?.patchSelectedCamera(patch),
    patchSelectedLight: (patch) =>
      runtimeRef.current?.patchSelectedLight(patch),
    undo: () => void runtimeRef.current?.undo(),
    redo: () => void runtimeRef.current?.redo(),
    setOrbit: (azimuth, elevation) => updateView({ azimuth, elevation }),
    setZoom: (zoom) => updateView({ zoom: clampModel3DValue(zoom, 20, 500) }),
    resetCamera: () =>
      updateView({
        azimuth: DEFAULT_MODEL3D_VIEW.azimuth,
        elevation: DEFAULT_MODEL3D_VIEW.elevation,
        zoom: DEFAULT_MODEL3D_VIEW.zoom,
      }),
    setAutoRotate: (autoRotate) => updateView({ autoRotate }),
    setExposure: (exposure) =>
      updateView({ exposure: clampModel3DValue(exposure, 0.1, 4) }),
    setShadowIntensity: (shadowIntensity) =>
      updateView({
        shadowIntensity: clampModel3DValue(shadowIntensity, 0, 2),
      }),
    setShadowSoftness: (shadowSoftness) =>
      updateView({
        shadowSoftness: clampModel3DValue(shadowSoftness, 0, 1),
      }),
    setShadowEnabled: (shadowEnabled) => updateView({ shadowEnabled }),
    setBackground: (background) => updateView({ background }),
    selectAnimation: (name) => {
      runtimeRef.current?.selectAnimation(name, false);
      setView((current) => {
        const next = {
          ...current,
          animationName: name,
          animationPlaying: false,
          animationTime: 0,
        };
        viewRef.current = next;
        return next;
      });
      markDirty();
    },
    setAnimationPlaying: (playing) => {
      const runtime = runtimeRef.current;
      runtime?.setAnimationPlaying(playing);
      setView((current) => {
        const next = { ...current, animationPlaying: playing };
        viewRef.current = next;
        return next;
      });
      if (!runtime?.gestureActive) markDirty();
    },
    setAnimationSpeed: (animationSpeed) => {
      const runtime = runtimeRef.current;
      runtime?.setAnimationSpeed(animationSpeed);
      setView((current) => {
        const next = { ...current, animationSpeed };
        viewRef.current = next;
        return next;
      });
      if (!runtime?.gestureActive) markDirty();
    },
    setAnimationTime: (animationTime) => {
      const runtime = runtimeRef.current;
      runtime?.setAnimationTime(animationTime);
      setView((current) => {
        const next = { ...current, animationTime };
        viewRef.current = next;
        return next;
      });
      if (!runtime?.gestureActive) markDirty();
    },
    setEnvironmentUrl: (environmentUrl) => updateView({
      environmentUrl: normalizeModel3DEnvironmentUrl(environmentUrl),
    }),
    setEnvironmentIntensity: (environmentIntensity) =>
      updateView({
        environmentIntensity: clampModel3DValue(environmentIntensity, 0, 5),
      }),
    selectMaterial: (index) => runtimeRef.current?.selectMaterialSlot(index),
    setMaterialColor: (color) =>
      runtimeRef.current?.patchSelectedMaterial({ color }),
    setMaterialMetallic: (metalness) =>
      runtimeRef.current?.patchSelectedMaterial({ metalness }),
    setMaterialRoughness: (roughness) =>
      runtimeRef.current?.patchSelectedMaterial({ roughness }),
    replaceMaterialTexture: mediaActions.replaceMaterialTexture,
    clearMaterialTexture: (slot) =>
      runtimeRef.current?.clearSelectedTexture(slot),
    selectAnnotation: sidecar.selectAnnotation,
    setAnnotationDraft: sidecar.setAnnotationDraft,
    beginAnnotationPlacement: sidecar.beginAnnotationPlacement,
    updateSelectedAnnotation: sidecar.updateSelectedAnnotation,
    deleteSelectedAnnotation: sidecar.deleteSelectedAnnotation,
    dispatchDirectorCommand: directorActions.dispatch,
    captureDirectorScreenshot: directorActions.captureScreenshot,
    captureDirectorPlayblast: directorActions.capturePlayblast,
    cancelDirectorPrevis: directorActions.cancel,
    importModel,
    openModelUrl,
    downloadScreenshot: mediaActions.downloadScreenshot,
    saveScreenshot: async () => {
      await mediaActions.saveScreenshot();
    },
    downloadModel: mediaActions.downloadModel,
    saveCopy,
    restoreRecovery,
  };
}
