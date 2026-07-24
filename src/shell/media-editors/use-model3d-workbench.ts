"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { loadEditorProject } from "../doc-editors/doc-io";
import type { LibraryItem } from "../library-data";
import { normalizeModel3DDirectorDocument, type Model3DPrevisAdapter } from "./model3d-director";
import {
  LEGACY_MODEL3D_PROJECT_SCHEMA,
  MODEL3D_PROJECT_SCHEMA,
  normalizeModel3DProjectRecovery,
  normalizeModel3DSourceProvenance,
  type Model3DSourceFormat,
  type Model3DSourceProvenance,
  type Model3DViewProject,
} from "./model3d-project";
import type { Model3DOperation } from "./model3d-operations.mjs";
import { Model3DSceneRuntime, type Model3DAnnotationPoint,
  type Model3DAnnotationScreen, type Model3DViewState } from "./model3d-runtime.mjs";
import { normalizeModel3DEnvironmentUrl, normalizeSavedModelView } from "./model3d-view";
import type { Model3DWorkbenchState } from "./model3d-workbench-state";
import {
  DEFAULT_MODEL3D_VIEW,
  EMPTY_MODEL3D_RUNTIME,
  model3DPosterForItem,
  model3DSidecarWithoutSource,
  model3DSourceForItem,
} from "./model3d-workbench-defaults";
import { useModel3DMediaActions } from "./use-model3d-media-actions";
import { useModel3DDirector } from "./use-model3d-director";
import { useModel3DRuntime } from "./use-model3d-runtime";
import { useModel3DSave } from "./use-model3d-save";
import { useModel3DSidecar } from "./use-model3d-sidecar";
import { useModel3DSourceActions } from "./use-model3d-source-actions";
import { useModel3DSourceLoader } from "./use-model3d-source-loader";

export type { Model3DWorkbenchState } from "./model3d-workbench-state";
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Number(value)));

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof DOMException && caught.name === "AbortError") return "";
  return caught instanceof Error ? caught.message : fallback;
}

function model3DItemSourceFormat(item: LibraryItem): Model3DSourceFormat {
  const format = String(item.meta.format || "").toLowerCase();
  if (format === "glb" || format === "gltf") return format;
  const mime = String(item.meta.mime || "").toLowerCase();
  if (mime === "model/gltf+json") return "gltf";
  if (mime === "model/gltf-binary") return "glb";
  return "";
}

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

  useEffect(() => {
    const originalSource = model3DSourceForItem(item);
    const fallbackProvenance = normalizeModel3DSourceProvenance(
      {
        sourceUrl: originalSource,
        dependencyBaseUrl:
          typeof item.meta.model_dependency_base_url === "string"
            ? item.meta.model_dependency_base_url
            : originalSource,
        format: model3DItemSourceFormat(item),
        identity:
          typeof item.meta.model_source_identity === "string"
            ? item.meta.model_source_identity
            : "",
        artifactId:
          typeof item.meta.model_source_artifact_id === "string"
            ? item.meta.model_source_artifact_id
            : item.artifactId || "",
        revisionId:
          typeof item.meta.model_source_revision_id === "string"
            ? item.meta.model_source_revision_id
            : item.revisionId || "",
        sourceDigest:
          typeof item.meta.model_source_digest === "string"
            ? item.meta.model_source_digest
            : item.artifact?.renditions.source?.digest || "",
      },
      originalSource,
      model3DItemSourceFormat(item),
    );
    const saved = normalizeSavedModelView(item.meta.view);
    const fallback: Model3DViewProject = {
      ...DEFAULT_MODEL3D_VIEW,
      sourceUrl: originalSource,
      azimuth: saved.azimuth,
      elevation: saved.elevation,
      zoom: saved.zoom,
      autoRotate: saved.autoRotate,
      exposure: saved.exposure,
      shadowIntensity: saved.shadowIntensity,
      shadowSoftness: saved.shadowSoftness,
      shadowEnabled: saved.shadowEnabled,
      background: saved.background,
      animationName: saved.animation,
      animationPlaying: saved.animationPlaying,
      animationSpeed: saved.animationSpeed,
      animationTime: saved.animationTime,
      environmentUrl: saved.environmentUrl,
      environmentIntensity: saved.environmentIntensity,
      materialOverrides: saved.materialOverrides,
      annotations: saved.annotations,
      director: normalizeModel3DDirectorDocument(saved.director, item.id),
    };
    const generation = ++sourceGenerationRef.current;
    runtimeRef.current?.clear();
    loadedSourceRef.current = "";
    pendingOperationsRef.current = [];
    setSourceUrl("");
    setSourceLoading(true);
    setModelLoading(false);
    setProgress(0);
    setRuntimeState(EMPTY_MODEL3D_RUNTIME);
    setSavedUrl("");
    setDirty(false);
    revisionRef.current = 0;
    setNotice("");
    setError("");
    applyView(fallback);

    void (async () => {
      let recovered = {
        checkpointUrl: originalSource,
        operations: [] as Model3DOperation[],
        provenance: fallbackProvenance,
        view: fallback,
      };
      const projectUrl =
        typeof item.meta.editor_project_url === "string"
          ? item.meta.editor_project_url
          : "";
      const projectSchema = String(item.meta.editor_project_schema || "");
      if (
        projectUrl &&
        [MODEL3D_PROJECT_SCHEMA, LEGACY_MODEL3D_PROJECT_SCHEMA].includes(
          projectSchema,
        )
      ) {
        try {
          const project = await loadEditorProject<unknown>(
            projectUrl,
            projectSchema,
          );
          recovered = normalizeModel3DProjectRecovery(
            project,
            fallback,
            originalSource,
          ) || recovered;
        } catch {
          // The creation metadata remains a complete sidecar fallback.
        }
      }
      if (!aliveRef.current || generation !== sourceGenerationRef.current) {
        return;
      }
      const recoveredProvenance = normalizeModel3DSourceProvenance(
        {
          ...recovered.provenance,
          artifactId:
            recovered.provenance.artifactId || fallbackProvenance.artifactId,
          revisionId:
            recovered.provenance.revisionId || fallbackProvenance.revisionId,
          sourceDigest:
            recovered.provenance.sourceDigest || fallbackProvenance.sourceDigest,
        },
        recovered.checkpointUrl || originalSource,
        recovered.provenance.format,
      );
      pendingOperationsRef.current = recovered.operations;
      setSourceProvenance(recoveredProvenance);
      applyView(recovered.view);
      const checkpointSource = recovered.checkpointUrl || originalSource;
      if (!checkpointSource) {
        setNotice(tt("空白 3D 场景已就绪，请导入 GLB 或自包含 glTF 模型"));
        setSourceLoading(false);
        return;
      }
      try {
        if (
          aliveRef.current &&
          generation === sourceGenerationRef.current
        ) {
          setSourceProvenance(
            normalizeModel3DSourceProvenance(
              recoveredProvenance,
              checkpointSource,
              recoveredProvenance.format,
            ),
          );
          // Keep the canonical entrypoint and dependency base together until
          // byte-signature detection proves GLB versus glTF. Importing an
          // opaque URL first can sever a glTF JSON file from its .bin/textures.
          setSourceUrl(checkpointSource);
        }
      } catch (caught) {
        if (aliveRef.current && generation === sourceGenerationRef.current) {
          setError(errorMessage(caught, tt("3D 模型导入失败")));
        }
      } finally {
        if (aliveRef.current && generation === sourceGenerationRef.current) {
          setSourceLoading(false);
        }
      }
    })();
  }, [
    applyView,
    item.id,
    item.meta.editor,
    item.meta.editor_project_schema,
    item.meta.editor_project_url,
    item.meta.format,
    item.meta.mime,
    item.meta.model_dependency_base_url,
    item.meta.model_source_artifact_id,
    item.meta.model_source_digest,
    item.meta.model_source_identity,
    item.meta.model_source_revision_id,
    item.meta.model_source_url,
    item.meta.source_asset_url,
    item.meta.view,
    item.artifact?.renditions.source?.digest,
    item.artifactId,
    item.previewUrl,
    item.revisionId,
    item.title,
    item.url,
    siteId,
    tt,
  ]);

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
    setZoom: (zoom) => updateView({ zoom: clamp(zoom, 20, 500) }),
    resetCamera: () =>
      updateView({
        azimuth: DEFAULT_MODEL3D_VIEW.azimuth,
        elevation: DEFAULT_MODEL3D_VIEW.elevation,
        zoom: DEFAULT_MODEL3D_VIEW.zoom,
      }),
    setAutoRotate: (autoRotate) => updateView({ autoRotate }),
    setExposure: (exposure) => updateView({ exposure: clamp(exposure, 0.1, 4) }),
    setShadowIntensity: (shadowIntensity) =>
      updateView({ shadowIntensity: clamp(shadowIntensity, 0, 2) }),
    setShadowSoftness: (shadowSoftness) =>
      updateView({ shadowSoftness: clamp(shadowSoftness, 0, 1) }),
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
      updateView({ environmentIntensity: clamp(environmentIntensity, 0, 5) }),
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
