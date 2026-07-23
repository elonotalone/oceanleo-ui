"use client";

import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type RefCallback,
  type SetStateAction,
} from "react";
import { canvasSafeUrl } from "../../lib/media-proxy";
import {
  Model3DSceneRuntime,
  type Model3DAnnotationPoint,
  type Model3DAnnotationScreen,
  type Model3DRuntimeSnapshot,
} from "./model3d-runtime.mjs";
import type { Model3DViewProject } from "./model3d-project";
import { EMPTY_MODEL3D_RUNTIME } from "./model3d-workbench-defaults";

export function useModel3DRuntime({
  runtimeRef,
  aliveRef,
  viewRef,
  markDirty,
  setView,
  setError,
  annotationPointRef,
  annotationFrameRef,
}: {
  runtimeRef: MutableRefObject<Model3DSceneRuntime | null>;
  aliveRef: MutableRefObject<boolean>;
  viewRef: MutableRefObject<Model3DViewProject>;
  markDirty: () => void;
  setView: Dispatch<SetStateAction<Model3DViewProject>>;
  setError: Dispatch<SetStateAction<string>>;
  annotationPointRef: MutableRefObject<
    ((point: Model3DAnnotationPoint) => void) | undefined
  >;
  annotationFrameRef: MutableRefObject<
    ((entries: Model3DAnnotationScreen[]) => void) | undefined
  >;
}) {
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runtimeState, setRuntimeState] =
    useState<Model3DRuntimeSnapshot>(EMPTY_MODEL3D_RUNTIME);
  const canvasRef = useCallback<RefCallback<HTMLCanvasElement>>((node) => {
    runtimeRef.current?.dispose();
    runtimeRef.current = null;
    setRuntimeReady(false);
    setRuntimeState(EMPTY_MODEL3D_RUNTIME);
    if (!node) return;
    const runtime = new Model3DSceneRuntime(node, {
      onSnapshot: (snapshot) => {
        if (!aliveRef.current) return;
        setRuntimeState(snapshot);
        setView((current) => {
          const next = {
            ...current,
            ...snapshot.view,
            animationName: snapshot.animationName,
            animationPlaying: snapshot.animationPlaying,
            animationSpeed: snapshot.animationSpeed,
            animationTime: snapshot.animationTime,
          };
          if (
            next.azimuth === current.azimuth &&
            next.elevation === current.elevation &&
            next.zoom === current.zoom &&
            next.autoRotate === current.autoRotate &&
            next.exposure === current.exposure &&
            next.background === current.background &&
            next.environmentUrl === current.environmentUrl &&
            next.environmentIntensity === current.environmentIntensity &&
            next.shadowEnabled === current.shadowEnabled &&
            next.shadowIntensity === current.shadowIntensity &&
            next.shadowSoftness === current.shadowSoftness &&
            next.animationName === current.animationName &&
            next.animationPlaying === current.animationPlaying &&
            next.animationSpeed === current.animationSpeed &&
            next.animationTime === current.animationTime
          ) return current;
          viewRef.current = next;
          return next;
        });
      },
      onSceneEdited: () => {
        if (aliveRef.current) markDirty();
      },
      onViewChange: (next) => {
        if (!aliveRef.current) return;
        setView((current) => {
          const merged = { ...current, ...next };
          viewRef.current = merged;
          return merged;
        });
      },
      onViewCommit: () => {
        if (aliveRef.current) markDirty();
      },
      onAnnotationPoint: (point) => annotationPointRef.current?.(point),
      onAnnotationFrame: (entries) => annotationFrameRef.current?.(entries),
      onError: (message) => setError(message),
      resolveAssetUrl: canvasSafeUrl,
    });
    runtimeRef.current = runtime;
    runtime.setView(viewRef.current, { emit: false });
    runtime.setAnnotations(viewRef.current.annotations);
    setRuntimeReady(true);
  }, [
    aliveRef,
    markDirty,
    annotationFrameRef,
    annotationPointRef,
    runtimeRef,
    setError,
    setView,
    viewRef,
  ]);
  return {
    canvasRef,
    runtimeReady,
    runtimeState,
    setRuntimeState,
  };
}
