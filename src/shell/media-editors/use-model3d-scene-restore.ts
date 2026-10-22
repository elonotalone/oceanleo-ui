"use client";

import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { UITranslate } from "../../i18n/ui/useUI";
import {
  normalizeModel3DProjectRecovery,
  type Model3DSourceProvenance,
  type Model3DViewProject,
} from "./model3d-project";
import type { Model3DOperation } from "./model3d-operations.mjs";
import type { Model3DSceneRuntime } from "./model3d-runtime.mjs";
import type { Model3DAnnotation } from "./model3d-view";

/**
 * 整份场景的替换入口：本地草稿恢复、协同远端 / 本地撤销重做的场景套用，
 * 以及重载后把选中的节点选回去。从 use-model3d-workbench 原样搬出。
 */
export function useModel3DSceneRestore({
  runtimeRef,
  viewRef,
  revisionRef,
  sourceGenerationRef,
  loadedSourceRef,
  pendingOperationsRef,
  keptSelectionRef,
  sourceUrl,
  annotations,
  modelReady,
  applyView,
  markDirty,
  noteRecoveryRestore,
  setSourceProvenance,
  setSourceUrl,
  setReloadToken,
  setDirty,
  setSavedUrl,
  setNotice,
  tt,
}: {
  runtimeRef: MutableRefObject<Model3DSceneRuntime | null>;
  viewRef: MutableRefObject<Model3DViewProject>;
  revisionRef: MutableRefObject<number>;
  sourceGenerationRef: MutableRefObject<number>;
  loadedSourceRef: MutableRefObject<string>;
  pendingOperationsRef: MutableRefObject<Model3DOperation[]>;
  keptSelectionRef: MutableRefObject<string>;
  sourceUrl: string;
  annotations: Model3DAnnotation[];
  modelReady: boolean;
  applyView: (next: Model3DViewProject, emit?: boolean) => void;
  markDirty: () => void;
  /** 恢复草稿不算用户编辑：只读取一次编辑会话代数（调用方持有 item）。 */
  noteRecoveryRestore: () => void;
  setSourceProvenance: Dispatch<SetStateAction<Model3DSourceProvenance>>;
  setSourceUrl: Dispatch<SetStateAction<string>>;
  setReloadToken: Dispatch<SetStateAction<number>>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  setSavedUrl: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
  tt: UITranslate;
}) {
  const restoreRecovery = useCallback((payload: unknown) => {
    const recovered = normalizeModel3DProjectRecovery(
      payload,
      {
        ...viewRef.current,
        sourceUrl,
        annotations,
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
    revisionRef.current += 1;
    setDirty(true);
    setSavedUrl("");
    noteRecoveryRestore();
    setNotice(tt("已恢复上次未同步的本地草稿"));
    return true;
  }, [applyView, annotations, noteRecoveryRestore, sourceUrl, tt]);

  /**
   * 多人同改：套用一份新的场景状态（检查点 + 操作日志 + 视图 + 批注）。
   * - 镜头（方位、仰角、缩放、自转）是我自己的，永远保留；
   * - 场景本身没变（只是曝光、背景、批注之类的视图参数变了）就不重载模型；
   * - `remote`：对方的改动，不标「未保存」、不加编辑修订号、不弹提示；
   * - `local`：撤销 / 重做算出来的我自己的改动，标「未保存」（走自动保存）。
   */
  const replaceScene = useCallback(
    (payload: unknown, mode: "remote" | "local"): boolean => {
      const recovered = normalizeModel3DProjectRecovery(
        payload,
        {
          ...viewRef.current,
          sourceUrl,
          annotations,
        },
        sourceUrl,
      );
      if (!recovered) return false;
      const current = viewRef.current;
      const nextView = {
        ...recovered.view,
        azimuth: current.azimuth,
        elevation: current.elevation,
        zoom: current.zoom,
        autoRotate: current.autoRotate,
      };
      const runtime = runtimeRef.current;
      const sameScene =
        Boolean(runtime) &&
        loadedSourceRef.current === sourceUrl &&
        recovered.checkpointUrl === sourceUrl &&
        JSON.stringify(recovered.operations) ===
          JSON.stringify(runtime?.getOperationJournal() ?? []);
      if (!sameScene) {
        const scene = runtime as unknown as {
          selected?: unknown;
          editorId?: (object: unknown) => string;
        } | null;
        keptSelectionRef.current =
          scene?.selected && scene.editorId ? scene.editorId(scene.selected) : "";
        sourceGenerationRef.current += 1;
        loadedSourceRef.current = "";
        pendingOperationsRef.current = recovered.operations;
        runtime?.clear();
        setSourceProvenance(recovered.provenance);
        setSourceUrl(recovered.checkpointUrl);
        setReloadToken((value) => value + 1);
      }
      applyView(nextView);
      if (mode === "local") markDirty();
      return true;
    },
    [applyView, markDirty, annotations, sourceUrl],
  );
  const applyRemoteScene = useCallback(
    (payload: unknown) => replaceScene(payload, "remote"),
    [replaceScene],
  );
  const applyLocalScene = useCallback(
    (payload: unknown) => replaceScene(payload, "local"),
    [replaceScene],
  );

  // 重载完成后把我选中的节点选回去（节点还在时）。
  useEffect(() => {
    if (!modelReady || !keptSelectionRef.current) return;
    const id = keptSelectionRef.current;
    keptSelectionRef.current = "";
    const scene = runtimeRef.current as unknown as {
      objectByEditorId?: (id: string) => { uuid: string } | null;
    } | null;
    const node = scene?.objectByEditorId?.(id);
    if (node) runtimeRef.current?.setSelectedNode(node.uuid);
  }, [modelReady]);

  return { restoreRecovery, applyRemoteScene, applyLocalScene };
}
