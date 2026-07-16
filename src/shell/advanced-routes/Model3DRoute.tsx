"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { AdvancedEditorIcon } from "../AdvancedEditorIcon";
import { advancedSavedItem } from "../advanced-session";
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
    (url: string) =>
      advancedSavedItem(item, {
        url,
        meta: {
          editor: "model-viewer-native-v1",
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
  const savedItem = useMemo(
    () => (editor.savedUrl ? buildSavedItem(editor.savedUrl) : null),
    [buildSavedItem, editor.savedUrl],
  );
  const saveBeforeNewConversation = useCallback(async () => {
    const url = await editor.saveCopy();
    return url
      ? { ok: true as const, item: buildSavedItem(url) }
      : { ok: false as const };
  }, [buildSavedItem, editor.saveCopy]);
  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({ type: "threed" })}
      editorDrawerLabel="场景"
      editorDrawerIcon="shape"
      editorToolbox={<Model3DControls editor={editor} accent={accent} />}
      editorContextualToolbar={
        <Model3DContextToolbar editor={editor} accent={accent} />
      }
      editorViewport={{
        value: editor.zoom,
        min: 50,
        max: 300,
        step: 1,
        setValue: editor.setZoom,
        fit: editor.resetCamera,
      }}
      editorHeaderActions={
        <>
          <button
            type="button"
            disabled={!editor.modelLoaded || editor.capturing}
            onClick={() => void editor.downloadScreenshot()}
            className="rounded-lg bg-white/10 px-3 py-2 text-[11px] font-medium text-white hover:bg-white/20 disabled:opacity-40"
          >
            截图
          </button>
          <button
            type="button"
            disabled={!editor.modelLoaded || editor.saving}
            onClick={() => void editor.saveCopy()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[11px] font-semibold shadow-sm disabled:opacity-40"
            style={{ color: accent }}
          >
            <AdvancedEditorIcon name="save" className="h-4 w-4" />
            {editor.saving ? "保存中…" : "保存"}
          </button>
        </>
      }
      editorStage={<Model3DStage editor={editor} />}
      editorStatus={
        editor.error ||
        editor.notice ||
        (editor.loading
          ? `正在载入 3D 模型${editor.progress > 0 ? ` ${Math.round(editor.progress * 100)}%` : ""}`
          : "")
      }
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
