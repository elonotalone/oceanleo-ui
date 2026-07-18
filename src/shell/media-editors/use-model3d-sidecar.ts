"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { UITranslate } from "../../i18n/ui/useUI";
import type {
  Model3DAnnotationPoint,
  Model3DAnnotationScreen,
  Model3DSceneRuntime,
} from "./model3d-runtime.mjs";
import type { Model3DViewProject } from "./model3d-project";
import type { Model3DAnnotation } from "./model3d-view";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Number(value)));

export function useModel3DSidecar({
  runtimeRef,
  markDirty,
  setError,
  tt,
}: {
  runtimeRef: MutableRefObject<Model3DSceneRuntime | null>;
  markDirty: () => void;
  setError: Dispatch<SetStateAction<string>>;
  tt: UITranslate;
}) {
  const pendingAnnotationLabelRef = useRef("");
  const [annotations, setAnnotations] = useState<Model3DAnnotation[]>([]);
  const [annotationScreens, setAnnotationScreens] = useState<
    Model3DAnnotationScreen[]
  >([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState("");
  const [annotationDraft, setAnnotationDraft] = useState("");

  useEffect(() => {
    runtimeRef.current?.setAnnotations(annotations);
  }, [annotations, runtimeRef]);

  const reset = useCallback((view: Pick<Model3DViewProject, "annotations">) => {
    setAnnotations(view.annotations);
    setSelectedAnnotationId(view.annotations[0]?.id || "");
    setAnnotationDraft("");
    pendingAnnotationLabelRef.current = "";
  }, []);

  const beginAnnotationPlacement = useCallback(() => {
    const label = annotationDraft.trim().slice(0, 240);
    if (!label) {
      setError(tt("请输入标注内容"));
      return;
    }
    pendingAnnotationLabelRef.current = label;
    runtimeRef.current?.armAnnotationPlacement(true);
    setError("");
  }, [annotationDraft, runtimeRef, setError, tt]);

  const placeAnnotation = useCallback(
    (point: Model3DAnnotationPoint) => {
      const label = pendingAnnotationLabelRef.current;
      if (!label) return;
      const id =
        globalThis.crypto?.randomUUID?.() ||
        `annotation-${Date.now().toString(36)}`;
      const annotation: Model3DAnnotation = {
        id,
        label,
        x: Number(point.position[0] || 0),
        y: Number(point.position[1] || 0),
        z: Number(point.position[2] || 0),
        normalX: Number(point.normal[0] || 0),
        normalY: Number(point.normal[1] ?? 1),
        normalZ: Number(point.normal[2] || 0),
        nodePath: point.nodePath.slice(0, 1_000),
      };
      setAnnotations((current) => [...current, annotation].slice(-32));
      setSelectedAnnotationId(id);
      setAnnotationDraft("");
      pendingAnnotationLabelRef.current = "";
      markDirty();
    },
    [markDirty],
  );

  const updateSelectedAnnotation = useCallback(
    (patch: Partial<Model3DAnnotation>) => {
      setAnnotations((current) =>
        current.map((entry) =>
          entry.id === selectedAnnotationId
            ? {
                ...entry,
                ...patch,
                id: entry.id,
                label:
                  patch.label === undefined
                    ? entry.label
                    : patch.label.slice(0, 240),
                x: clamp(patch.x ?? entry.x, -100_000, 100_000),
                y: clamp(patch.y ?? entry.y, -100_000, 100_000),
                z: clamp(patch.z ?? entry.z, -100_000, 100_000),
              }
            : entry,
        ),
      );
      markDirty();
    },
    [markDirty, selectedAnnotationId],
  );

  const deleteSelectedAnnotation = useCallback(() => {
    setAnnotations((current) => {
      const next = current.filter(
        (entry) => entry.id !== selectedAnnotationId,
      );
      setSelectedAnnotationId(next[0]?.id || "");
      return next;
    });
    markDirty();
  }, [markDirty, selectedAnnotationId]);

  return {
    annotations,
    annotationScreens,
    selectedAnnotationId,
    annotationDraft,
    reset,
    beginAnnotationPlacement,
    placeAnnotation,
    setAnnotationScreens,
    selectAnnotation: setSelectedAnnotationId,
    setAnnotationDraft,
    updateSelectedAnnotation,
    deleteSelectedAnnotation,
  };
}
