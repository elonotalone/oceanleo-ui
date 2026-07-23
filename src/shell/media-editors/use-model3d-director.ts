"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { UITranslate } from "../../i18n/ui/useUI";
import {
  applyModel3DDirectorCommand,
  model3DPrevisAvailability,
  startModel3DPrevis,
  type Model3DDirectorCommand,
  type Model3DPrevisAdapter,
  type Model3DPrevisHandle,
  type Model3DPrevisKind,
  type Model3DPrevisReceipt,
} from "./model3d-director";
import { createModel3DPlayblastAdapter } from "./model3d-playblast";
import type { Model3DViewProject } from "./model3d-project";
import type {
  Model3DSceneRuntime,
  Model3DSelectionState,
} from "./model3d-runtime.mjs";

function errorMessage(caught: unknown, fallback: string): string {
  if (caught instanceof DOMException && caught.name === "AbortError") return "";
  return caught instanceof Error ? caught.message : fallback;
}

export function useModel3DDirector({
  runtimeRef,
  view,
  viewRef,
  setView,
  runtimeSelection,
  modelReady,
  itemId,
  itemTitle,
  siteId,
  saveScreenshot,
  overrideAdapter,
  markDirty,
  setError,
  setNotice,
  tt,
}: {
  runtimeRef: MutableRefObject<Model3DSceneRuntime | null>;
  view: Model3DViewProject;
  viewRef: MutableRefObject<Model3DViewProject>;
  setView: Dispatch<SetStateAction<Model3DViewProject>>;
  runtimeSelection: Model3DSelectionState | null;
  modelReady: boolean;
  itemId: string;
  itemTitle: string;
  siteId: string;
  saveScreenshot: (meta?: Record<string, unknown>) => Promise<string>;
  overrideAdapter?: Model3DPrevisAdapter;
  markDirty: () => void;
  setError: (value: string) => void;
  setNotice: (value: string) => void;
  tt: UITranslate;
}) {
  const previsHandleRef = useRef<Model3DPrevisHandle | null>(null);
  const [directing, setDirecting] = useState(false);
  const [receipt, setReceipt] =
    useState<Readonly<Model3DPrevisReceipt> | null>(null);

  const screenshotAdapter = useMemo<Model3DPrevisAdapter>(
    () => ({
      id: "three-scene-screenshot",
      availability: (kind) => {
        if (kind !== "screenshot") {
          return {
            enabled: false,
            reason: "Screenshot adapter cannot render playblast",
          };
        }
        if (!modelReady || !runtimeRef.current) {
          return { enabled: false, reason: tt("3D 场景尚未加载完成") };
        }
        const shot = viewRef.current.director.shots.find(
          (entry) => entry.id === viewRef.current.director.activeShotId,
        );
        if (shot?.camera.projection === "orthographic") {
          return {
            enabled: false,
            reason:
              "The current Three workbench cannot capture an orthographic director camera",
          };
        }
        if (shot?.camera.depthOfFieldEnabled) {
          const depthOfField = runtimeRef.current.depthOfFieldCapability();
          if (!depthOfField.enabled) return depthOfField;
        }
        return { enabled: true };
      },
      async capture(kind, director, context) {
        if (kind !== "screenshot") {
          throw new Error("Screenshot adapter cannot render playblast");
        }
        context.onProgress({ phase: "capturing", progress: 0.2 });
        const url = await saveScreenshot({
          director_schema: director.schema,
          director_revision: director.revision,
          director_scene_id: director.scene.id,
          director_shot_id: director.activeShotId,
          director_take_id: director.activeTakeId,
        });
        if (context.signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        if (!url) throw new Error(tt("3D 导演截图保存失败"));
        context.onProgress({ phase: "uploading", progress: 0.9 });
        return { url, mimeType: "image/png" };
      },
    }),
    [modelReady, runtimeRef, saveScreenshot, tt, viewRef],
  );

  const playblastAdapter = useMemo(
    () =>
      createModel3DPlayblastAdapter({
        getRuntime: () => runtimeRef.current,
        getDocument: () => viewRef.current.director,
        siteId: siteId || "threed",
        title: `${itemTitle} 3D playblast`,
        parentId: itemId,
      }),
    [itemId, itemTitle, runtimeRef, siteId, viewRef],
  );
  const resolvedPlayblastAdapter = overrideAdapter || playblastAdapter;

  const dispatch = useCallback(
    (command: Model3DDirectorCommand) => {
      try {
        const current = viewRef.current;
        const director = applyModel3DDirectorCommand(current.director, command);
        let next: Model3DViewProject = { ...current, director };
        if (command.id === "set-lighting") {
          const shot = director.shots.find(
            (entry) => entry.id === command.shotId,
          );
          if (shot) {
            next = {
              ...next,
              exposure: shot.lighting.exposure,
              environmentUrl: shot.lighting.environmentUrl,
              environmentIntensity: shot.lighting.environmentIntensity,
            };
            runtimeRef.current?.setView({
              exposure: shot.lighting.exposure,
              environmentUrl: shot.lighting.environmentUrl,
              environmentIntensity: shot.lighting.environmentIntensity,
            });
          }
        }
        if (command.id === "set-camera" && runtimeSelection?.camera) {
          const shot = director.shots.find(
            (entry) => entry.id === command.shotId,
          );
          if (shot) {
            runtimeRef.current?.patchSelectedCamera({
              fov: shot.camera.fovDegrees,
              near: shot.camera.near,
              far: shot.camera.far,
            });
          }
        }
        const activeShot = director.shots.find(
          (entry) => entry.id === director.activeShotId,
        );
        let rendererLimitation = "";
        if (activeShot && runtimeRef.current) {
          try {
            runtimeRef.current.setDirectorCamera(activeShot.camera);
          } catch (caught) {
            rendererLimitation = errorMessage(
              caught,
              tt("当前渲染器无法预览该导演相机"),
            );
          }
        }
        if (
          command.id === "set-pose" &&
          runtimeSelection?.id === command.pose.nodeId
        ) {
          runtimeRef.current?.patchSelectedTransform({
            position: [...command.pose.transform.position],
            rotation: [...command.pose.transform.rotation],
            scale: [...command.pose.transform.scale],
          });
        }
        viewRef.current = next;
        setView(next);
        setError(rendererLimitation);
        markDirty();
      } catch (caught) {
        setError(errorMessage(caught, tt("3D 导演命令失败")));
      }
    },
    [
      markDirty,
      runtimeRef,
      runtimeSelection,
      setError,
      setView,
      tt,
      viewRef,
    ],
  );

  useEffect(() => {
    if (!modelReady || !runtimeRef.current) return;
    const shot = view.director.shots.find(
      (entry) => entry.id === view.director.activeShotId,
    );
    if (!shot) return;
    try {
      runtimeRef.current.setDirectorCamera(shot.camera);
    } catch (caught) {
      setError(errorMessage(caught, tt("当前渲染器无法预览该导演相机")));
    }
  }, [modelReady, runtimeRef, setError, tt, view.director]);

  useEffect(() => {
    previsHandleRef.current?.cancel();
    previsHandleRef.current = null;
    setDirecting(false);
    setReceipt(null);
  }, [itemId]);

  useEffect(
    () => () => {
      previsHandleRef.current?.cancel();
      previsHandleRef.current = null;
    },
    [],
  );

  const capture = useCallback(
    async (
      kind: Model3DPrevisKind,
    ): Promise<Readonly<Model3DPrevisReceipt>> => {
      previsHandleRef.current?.cancel();
      const adapter =
        kind === "screenshot" ? screenshotAdapter : resolvedPlayblastAdapter;
      const handle = startModel3DPrevis(
        viewRef.current.director,
        kind,
        adapter,
      );
      previsHandleRef.current = handle;
      setDirecting(true);
      setError("");
      const nextReceipt = await handle.result;
      if (previsHandleRef.current === handle) {
        setReceipt(nextReceipt);
        if (nextReceipt.status === "succeeded") {
          setNotice(
            kind === "screenshot"
              ? tt("3D 导演截图凭据已生成")
              : tt("3D playblast 凭据已生成"),
          );
        } else if (nextReceipt.status === "unsupported") {
          setNotice(nextReceipt.disabledReason || tt("当前预演能力不可用"));
        } else if (nextReceipt.status === "failed") {
          setError(nextReceipt.error?.message || tt("3D 预演失败"));
        } else {
          setNotice(tt("3D 预演已取消"));
        }
        previsHandleRef.current = null;
        setDirecting(false);
      }
      return nextReceipt;
    },
    [
      resolvedPlayblastAdapter,
      screenshotAdapter,
      setError,
      setNotice,
      tt,
      viewRef,
    ],
  );

  return {
    directing,
    receipt,
    depthOfFieldAvailability:
      runtimeRef.current?.depthOfFieldCapability() || {
        enabled: false,
        reason: tt("3D 渲染器尚未就绪"),
      },
    screenshotAvailability: model3DPrevisAvailability(
      view.director,
      "screenshot",
      screenshotAdapter,
    ),
    playblastAvailability: model3DPrevisAvailability(
      view.director,
      "playblast",
      resolvedPlayblastAdapter,
    ),
    dispatch,
    captureScreenshot: () => capture("screenshot"),
    capturePlayblast: () => capture("playblast"),
    cancel: () => previsHandleRef.current?.cancel(),
  };
}
