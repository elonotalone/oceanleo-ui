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
        const blob = await fetchMediaBlob(url, {
          maxBytes: 256 * 1024 * 1024,
        });
        const extension =
          String(material.meta.format || "").toLowerCase() ||
          url.split(/[?#]/)[0].split(".").pop() ||
          "glb";
        await editor.importModel(
          new File([blob], `${material.title || "model"}.${extension}`, {
            type: blob.type || "model/gltf-binary",
          }),
        );
      },
    }),
    [editor.importModel],
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
          editor: "model-viewer-native-v1",
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
            animation_speed: editor.animationSpeed,
          },
        },
      }),
    [
      editor.animationName,
      editor.animationSpeed,
      editor.autoRotate,
      editor.azimuth,
      editor.background,
      editor.elevation,
      editor.exposure,
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
          min: 50,
          max: 300,
          step: 1,
          setValue: editor.setZoom,
          fit: editor.resetCamera,
        },
        actions: [
          {
            id: "model3d-screenshot",
            label: "下载截图",
            icon: "download",
            disabled: !editor.modelLoaded || editor.capturing,
            onTrigger: editor.downloadScreenshot,
          },
        ],
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
              sourceUrl: editor.sourceUrl,
              azimuth: editor.azimuth,
              elevation: editor.elevation,
              zoom: editor.zoom,
              autoRotate: editor.autoRotate,
              exposure: editor.exposure,
              shadowIntensity: editor.shadowIntensity,
              shadowSoftness: editor.shadowSoftness,
              background: editor.background,
              animationName: editor.animationName,
              animationSpeed: editor.animationSpeed,
            }),
            restore: editor.restoreRecovery,
          },
        },
      }}
      onClose={onClose}
    />
  );
}
