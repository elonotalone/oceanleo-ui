"use client";

import { useCallback, useMemo } from "react";
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
import { editorToolLabel } from "../workbench-routes";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";

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
          content: <Model3DControls editor={editor} />,
        },
        contextToolbar: (
          <Model3DContextToolbar editor={editor} accent={accent} />
        ),
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
          disabled: !editor.modelLoaded || editor.downloading,
          onTrigger: editor.downloadModel,
        },
        upload: {
          accept: ".glb,.gltf,model/gltf-binary,model/gltf+json",
          onFiles: importLocalModel,
        },
        stage: <Model3DStage editor={editor} />,
        status:
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
            capture: () => ({
              checkpointUrl: editor.sourceUrl,
              operations: editor.operationJournal,
              azimuth: editor.azimuth,
              elevation: editor.elevation,
              zoom: editor.zoom,
              autoRotate: editor.autoRotate,
              exposure: editor.exposure,
              shadowIntensity: editor.shadowIntensity,
              shadowSoftness: editor.shadowSoftness,
              background: editor.background,
              animationName: editor.animationName,
              animationPlaying: editor.animationPlaying,
              animationSpeed: editor.animationSpeed,
              animationTime: editor.animationTime,
              environmentUrl: editor.environmentUrl,
              environmentIntensity: editor.environmentIntensity,
              shadowEnabled: editor.shadowEnabled,
              annotations: editor.annotations,
            }),
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
