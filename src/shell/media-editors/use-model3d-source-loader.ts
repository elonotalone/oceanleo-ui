"use client";

import {
  useCallback,
  useEffect,
  useRef,
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
import { Model3DClosureError } from "./model3d-closure";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Number(value)));

/**
 * §3.3/§6:闭包缺件必须带 §6 错误码与缺哪一件一起显示出来。空场景 + 无提示是
 * 规格点名要治的观感,所以这里从不把缺件降级成通用文案。
 */
function sourceError(caught: unknown, fallback: string): string {
  if (caught instanceof DOMException && caught.name === "AbortError") return "";
  if (caught instanceof Model3DClosureError) {
    return `[${caught.code}] ${caught.message}`;
  }
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
  tt: providedTranslate,
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
  // `tt` 由调用方从 `useUI()` 直接透传，是 provider 所有的函数。它进下面那个源装载
  // effect 的依赖，就是 W13 治过的自锁引信：effect 体里写 state（setModelLoading /
  // setProgress / setError）→ 重渲染 → `tt` 换身份 → 整个模型重新下载并重新灌进
  // 渲染器。这一处重跑还会 `runtime.cancelLoad()` 打断正在进行的加载。
  // 语言切换与「这份 GLB/glTF 要不要重下」无关，答案明确是不该重跑。
  // 沿用 W13 在 `doc-editors/use-grid-editor.ts:518-531` 定下的 ref + 恒定包装，
  // 下面的 `tt` 即该包装（`vars` 一并转发）。代价：加载失败文案停在报错当时那个
  // 语言；`error` 由不在本 owner 面上的 `Model3DStage` 原样渲染，改不成渲染时再翻。
  const translateRef = useRef(providedTranslate);
  useEffect(() => {
    translateRef.current = providedTranslate;
  }, [providedTranslate]);
  const tt = useCallback<UITranslate>(
    (zh, vars) => translateRef.current(zh, vars),
    [],
  );

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
