"use client";

import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { UITranslate } from "../../i18n/ui/useUI";
import {
  prepareModelRuntimeSource,
  type Model3DArtifactIdentity,
} from "./model3d-files";
import type { Model3DOperation } from "./model3d-operations.mjs";
import type { Model3DViewProject } from "./model3d-project";
import type { Model3DAnnotation } from "./model3d-view";
import type { Model3DSceneRuntime } from "./model3d-runtime.mjs";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Number(value)));

function sourceError(caught: unknown, fallback: string): string {
  if (caught instanceof DOMException && caught.name === "AbortError") return "";
  return caught instanceof Error ? caught.message : fallback;
}

export function useModel3DSourceLoader({
  runtimeRef,
  runtimeReady,
  sourceUrl,
  dependencyBaseUrl,
  artifactIdentity,
  reloadToken,
  sourceGenerationRef,
  loadedSourceRef,
  aliveRef,
  viewRef,
  pendingOperationsRef,
  annotations,
  setModelLoading,
  setProgress,
  setError,
  setNotice,
  onPreparedSource,
  tt,
}: {
  runtimeRef: MutableRefObject<Model3DSceneRuntime | null>;
  runtimeReady: boolean;
  sourceUrl: string;
  dependencyBaseUrl: string;
  artifactIdentity: Model3DArtifactIdentity | null;
  reloadToken: number;
  sourceGenerationRef: MutableRefObject<number>;
  loadedSourceRef: MutableRefObject<string>;
  aliveRef: MutableRefObject<boolean>;
  viewRef: MutableRefObject<Model3DViewProject>;
  pendingOperationsRef: MutableRefObject<Model3DOperation[]>;
  annotations: Model3DAnnotation[];
  setModelLoading: Dispatch<SetStateAction<boolean>>;
  setProgress: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  onPreparedSource: (source: {
    sourceUrl: string;
    dependencyBaseUrl: string;
    format: "glb" | "gltf";
  }) => void;
  tt: UITranslate;
}) {
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !runtimeReady || !sourceUrl) return;
    if (loadedSourceRef.current === sourceUrl) return;
    const generation = sourceGenerationRef.current;
    const controller = new AbortController();
    let releasePreparedSource: (() => void) | null = null;
    setModelLoading(true);
    setProgress(0);
    setError("");
    void (async () => {
      const prepared = await prepareModelRuntimeSource(
        sourceUrl,
        controller.signal,
        dependencyBaseUrl,
        artifactIdentity,
      );
      releasePreparedSource = prepared.release;
      if (!aliveRef.current || generation !== sourceGenerationRef.current) {
        return;
      }
      await runtime.loadUrl(prepared.url, (event) => {
        if (event.lengthComputable && event.total) {
          setProgress(clamp(event.loaded / event.total, 0, 1));
        }
      });
      if (!aliveRef.current || generation !== sourceGenerationRef.current) {
        return;
      }
      runtime.setView(viewRef.current, { emit: false });
      runtime.setAnnotations(annotations);
      runtime.applyLegacyMaterialOverrides(viewRef.current.materialOverrides);
      await runtime.applyOperationJournal(pendingOperationsRef.current);
      if (!aliveRef.current || generation !== sourceGenerationRef.current) {
        return;
      }
      loadedSourceRef.current = sourceUrl;
      onPreparedSource({
        sourceUrl: prepared.sourceUrl,
        dependencyBaseUrl: prepared.dependencyBaseUrl,
        format: prepared.format,
      });
      runtime.selectAnimation(viewRef.current.animationName, false);
      runtime.setAnimationSpeed(viewRef.current.animationSpeed);
      runtime.setAnimationTime(viewRef.current.animationTime);
      runtime.setAnimationPlaying(viewRef.current.animationPlaying);
      setModelLoading(false);
      setProgress(1);
      setNotice("");
    })()
      .catch((caught) => {
        if (!aliveRef.current || generation !== sourceGenerationRef.current) {
          return;
        }
        setModelLoading(false);
        setError(sourceError(caught, tt("3D 模型加载失败")));
      })
      .finally(() => releasePreparedSource?.());
    return () => {
      controller.abort();
      runtime.cancelLoad();
      // GLTFLoader cannot be aborted after it starts consuming local object
      // URLs. The async finally above revokes the complete closure once that
      // load settles; revoking here can race image decode and blank the model.
    };
  }, [
    aliveRef,
    annotations,
    artifactIdentity,
    dependencyBaseUrl,
    loadedSourceRef,
    onPreparedSource,
    pendingOperationsRef,
    reloadToken,
    runtimeReady,
    runtimeRef,
    setError,
    setModelLoading,
    setNotice,
    setProgress,
    sourceGenerationRef,
    sourceUrl,
    tt,
    viewRef,
  ]);
}
