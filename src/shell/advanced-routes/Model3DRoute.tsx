"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedSavedItem } from "../advanced-session";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { Model3DContextToolbar } from "../media-editors/Model3DContextToolbar";
import {
  Model3DControls,
  Model3DStage,
  useModel3DWorkbench,
} from "../media-editors";
import {
  captureModel3DRouteSnapshot,
  Model3DRouteHistory,
} from "../media-editors/Model3DRouteHistory";
import { editorToolLabel } from "../workbench-routes";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";

type Model3DEditorState = ReturnType<typeof useModel3DWorkbench>;

function useModel3DDocumentHistory(
  editor: Model3DEditorState,
  itemKey: string,
) {
  const historyRef = useRef(new Model3DRouteHistory());
  const itemRef = useRef("");
  const loadingRef = useRef(editor.loading);
  const skipObservedRevisionRef = useRef(false);
  const [, renderHistory] = useState(0);
  const [error, setError] = useState("");
  const snapshot = useMemo(
    () => captureModel3DRouteSnapshot(editor),
    [
      editor.animationName,
      editor.animationPlaying,
      editor.animationSpeed,
      editor.animationTime,
      editor.annotations,
      editor.autoRotate,
      editor.azimuth,
      editor.background,
      editor.elevation,
      editor.environmentIntensity,
      editor.environmentUrl,
      editor.exposure,
      editor.operationJournal,
      editor.shadowEnabled,
      editor.shadowIntensity,
      editor.shadowSoftness,
      editor.sourceUrl,
      editor.zoom,
    ],
  );
  const fingerprint = useMemo(() => JSON.stringify(snapshot), [snapshot]);

  useEffect(() => {
    const itemChanged = itemRef.current !== itemKey;
    const loadingChanged = loadingRef.current !== editor.loading;
    loadingRef.current = editor.loading;
    if (
      itemChanged ||
      (loadingChanged && !skipObservedRevisionRef.current)
    ) {
      itemRef.current = itemKey;
      skipObservedRevisionRef.current = false;
      historyRef.current.reset(editor.editRevision, snapshot);
      setError("");
      renderHistory((value) => value + 1);
      return;
    }
    if (editor.loading) {
      if (!skipObservedRevisionRef.current) {
        historyRef.current.accept(editor.editRevision, snapshot);
      }
      return;
    }
    if (skipObservedRevisionRef.current) {
      skipObservedRevisionRef.current = false;
      historyRef.current.accept(editor.editRevision, snapshot);
      setError("");
      renderHistory((value) => value + 1);
      return;
    }
    if (historyRef.current.observe(editor.editRevision, snapshot)) {
      setError("");
      renderHistory((value) => value + 1);
    }
  }, [editor.editRevision, editor.loading, fingerprint, itemKey, snapshot]);

  const restore = useCallback(
    (direction: "undo" | "redo") => {
      const current = captureModel3DRouteSnapshot(editor);
      const target =
        direction === "undo"
          ? historyRef.current.undo(current)
          : historyRef.current.redo(current);
      if (!target) return;
      skipObservedRevisionRef.current = true;
      const restored: unknown = editor.restoreRecovery(target);
      if (restored === false) {
        skipObservedRevisionRef.current = false;
        if (direction === "undo") historyRef.current.rollbackUndo();
        else historyRef.current.rollbackRedo();
        setError("3D 历史快照恢复失败，当前模型保持不变。");
        renderHistory((value) => value + 1);
        return;
      }
      setError("");
      renderHistory((value) => value + 1);
    },
    [editor],
  );
  const undo = useCallback(() => restore("undo"), [restore]);
  const redo = useCallback(() => restore("redo"), [restore]);

  return {
    canUndo: historyRef.current.canUndo,
    canRedo: historyRef.current.canRedo,
    undo,
    redo,
    snapshot,
    error,
  };
}

export function Model3DRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useModel3DWorkbench(item, siteId);
  const history = useModel3DDocumentHistory(
    editor,
    `${item.id}:${item.url || item.previewUrl || ""}`,
  );
  const deliveryBusy =
    editor.downloading || editor.capturing || editor.saving;
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(
    () => ({
      id: "model3d-materials@2",
      actions: ["replace"],
      accepts: (material) => {
        const url = material.url || material.previewUrl || "";
        const format = String(material.meta.format || "").toLowerCase();
        return (
          material.kind === "threed" ||
          ["glb", "gltf"].includes(format) ||
          /\.(?:glb|gltf)(?:$|[?#])/i.test(url)
        );
      },
      mutate: async (_action, material) => {
        const url = material.url || material.previewUrl || "";
        if (!url) throw new Error("这个 3D 素材没有可用地址。");
        const extension =
          String(material.meta.format || "").toLowerCase() ||
          url.split(/[?#]/)[0].split(".").pop() ||
          "glb";
        if (extension === "gltf") {
          // Keep the remote directory as one dependency closure. Turning only
          // the JSON entrypoint into a local File severs its .bin/textures.
          editor.openModelUrl(url);
          return;
        }
        const blob = await fetchMediaBlob(url, {
          maxBytes: 256 * 1024 * 1024,
        });
        await editor.importModel(
          new File([blob], `${material.title || "model"}.${extension}`, {
            type: blob.type || "model/gltf-binary",
          }),
        );
      },
    }),
    [editor.importModel, editor.openModelUrl],
  );
  useWorkbenchMaterialAdapter(materialAdapter);
  const buildSavedItem = useCallback(
    (saved: {
      url: string;
      versionId: string;
      projectUrl: string;
      projectSchema: string;
    }) =>
      advancedSavedItem(item, {
        url: saved.url,
        versionId: saved.versionId,
        meta: {
          editor: "three-gltf-editor-v2",
          format: "glb",
          model_source_url: saved.url,
          model_dependency_mode: "checkpoint-glb+operation-journal",
          journal_count: editor.operationCount,
          editor_project_url: saved.projectUrl,
          editor_project_schema: saved.projectSchema,
          view: {
            camera_orbit: `${editor.azimuth}deg ${editor.elevation}deg ${editor.zoom}%`,
            auto_rotate: editor.autoRotate,
            exposure: editor.exposure,
            shadow_intensity: editor.shadowIntensity,
            shadow_softness: editor.shadowSoftness,
            background: editor.background,
            animation: editor.animationName,
            animation_playing: editor.animationPlaying,
            animation_speed: editor.animationSpeed,
            animation_time: editor.animationTime,
            environment_url: editor.environmentUrl,
            environment_intensity: editor.environmentIntensity,
            shadow_enabled: editor.shadowEnabled,
            annotations: editor.annotations,
          },
        },
      }),
    [
      editor.animationName,
      editor.animationPlaying,
      editor.animationSpeed,
      editor.animationTime,
      editor.annotations,
      editor.autoRotate,
      editor.azimuth,
      editor.background,
      editor.elevation,
      editor.environmentIntensity,
      editor.environmentUrl,
      editor.exposure,
      editor.operationCount,
      editor.shadowEnabled,
      editor.shadowIntensity,
      editor.shadowSoftness,
      editor.zoom,
      item,
    ],
  );
  const saveBeforeNewConversation = useCallback(async () => {
    const saved = await editor.saveCopy();
    return saved
      ? { ok: true as const, item: buildSavedItem(saved) }
      : { ok: false as const };
  }, [buildSavedItem, editor.saveCopy]);
  const importLocalModel = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (file) await editor.importModel(file);
    },
    [editor.importModel],
  );
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "threed",
        label: editorToolLabel({ type: "threed" }),
        toolbox: {
          label: "场景",
          icon: "shape",
          content: (
            <Model3DControls
              editor={editor}
              showDeliveryActions={false}
              showSelectionActions={false}
            />
          ),
        },
        contextToolbar: (
          <Model3DContextToolbar editor={editor} accent={accent} />
        ),
        history: {
          canUndo: history.canUndo,
          canRedo: history.canRedo,
          undo: history.undo,
          redo: history.redo,
        },
        viewport: {
          value: editor.zoom,
          min: 20,
          max: 500,
          step: 1,
          setValue: editor.setZoom,
          fit: editor.resetCamera,
        },
        directDownload: {
          id: "model3d-glb",
          label: "导出修改后 GLB",
          icon: "download",
          disabled: !editor.modelLoaded || deliveryBusy,
          busy: editor.downloading,
          onTrigger: editor.downloadModel,
        },
        actions: [
          {
            id: "model3d-download-screenshot",
            label: "下载 PNG 截图",
            disabled: !editor.modelLoaded || deliveryBusy,
            busy: editor.capturing,
            onTrigger: editor.downloadScreenshot,
          },
          {
            id: "model3d-save-screenshot",
            label: "截图存入文件库",
            disabled: !editor.modelLoaded || deliveryBusy,
            busy: editor.saving,
            onTrigger: editor.saveScreenshot,
          },
        ],
        upload: {
          accept: ".glb,.gltf,model/gltf-binary,model/gltf+json",
          onFiles: importLocalModel,
        },
        stage: <Model3DStage editor={editor} showNativeControls={false} />,
        status:
          history.error ||
          editor.error ||
          editor.notice ||
          (editor.loading
            ? `正在载入 3D 模型${editor.progress > 0 ? ` ${Math.round(editor.progress * 100)}%` : ""}`
            : ""),
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
          recovery: {
            key: advancedRecoveryKey("threed", item),
            ready: !editor.loading,
            capture: () => history.snapshot,
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
