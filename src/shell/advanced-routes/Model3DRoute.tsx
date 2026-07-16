"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedSavedItem } from "../advanced-session";
import { Model3DContextToolbar } from "../media-editors/Model3DContextToolbar";
import {
  Model3DControls,
  Model3DStage,
  useModel3DWorkbench,
} from "../media-editors";
import { editorToolLabel } from "../workbench-routes";

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
      editorToolbox={<Model3DControls editor={editor} accent={accent} />}
      editorContextualToolbar={
        <Model3DContextToolbar editor={editor} accent={accent} />
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
