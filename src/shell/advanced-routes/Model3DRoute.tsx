"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import {
  AdvancedWorkbenchShell,
  type EditorPanelDescriptor,
} from "../AdvancedWorkbenchShell";
import { advancedSavedItem } from "../advanced-session";
import type { TopBarModel } from "../advanced-topbar";
import { useUI } from "../../i18n/ui/useUI";
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
  const tt = useUI();
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

  // 统一顶栏：视角/自动旋转 · 模型与材质面板 —— 收尾区：下载截图/模型 · 保存截图/副本。
  const busy =
    editor.loading || editor.capturing || editor.saving || editor.downloading;
  const topBarModel = useMemo<TopBarModel>(
    () => ({
      groups: [
        {
          id: "camera",
          actions: [
            {
              kind: "action",
              id: "reset-camera",
              label: tt("重置视角"),
              icon: "rotate",
              iconOnly: true,
              disabled: !editor.modelLoaded,
              onRun: editor.resetCamera,
            },
            {
              kind: "toggle",
              id: "auto-rotate",
              label: editor.autoRotate ? tt("停止旋转") : tt("自动旋转"),
              icon: "rotate-right",
              active: editor.autoRotate,
              disabled: !editor.modelLoaded,
              onRun: () => editor.setAutoRotate(!editor.autoRotate),
            },
          ],
        },
        {
          id: "model",
          actions: [
            {
              kind: "panel",
              id: "model",
              label: tt("模型与材质"),
              icon: "layers",
              panelId: "model",
            },
          ],
        },
      ],
      trailing: [
        {
          kind: "action",
          id: "download-screenshot",
          label: editor.capturing ? tt("截图中…") : tt("下载截图"),
          icon: "image",
          iconOnly: true,
          disabled: busy || !editor.modelLoaded,
          onRun: () => void editor.downloadScreenshot(),
        },
        {
          kind: "action",
          id: "download-model",
          label: editor.downloading ? tt("下载中…") : tt("下载模型"),
          icon: "download",
          iconOnly: true,
          disabled: busy || !editor.sourceUrl,
          onRun: () => void editor.downloadModel(),
        },
        {
          kind: "action",
          id: "save-screenshot",
          label: tt("保存截图"),
          icon: "save",
          iconOnly: true,
          disabled: busy || !editor.modelLoaded,
          onRun: () => void editor.saveScreenshot(),
        },
        {
          kind: "action",
          id: "save-copy",
          label: editor.saving ? tt("保存中…") : tt("保存视图副本"),
          icon: "save",
          disabled: busy || !editor.modelLoaded,
          onRun: () => void editor.saveCopy(),
        },
      ],
    }),
    [
      busy,
      editor.autoRotate,
      editor.capturing,
      editor.downloadModel,
      editor.downloadScreenshot,
      editor.downloading,
      editor.modelLoaded,
      editor.resetCamera,
      editor.saveCopy,
      editor.saveScreenshot,
      editor.saving,
      editor.setAutoRotate,
      editor.sourceUrl,
      tt,
    ],
  );

  const editorPanels = useMemo<EditorPanelDescriptor[]>(
    () => [
      {
        id: "model",
        title: tt("模型与材质"),
        width: 300,
        content: <Model3DControls editor={editor} accent={accent} />,
      },
    ],
    [accent, editor, tt],
  );

  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({ type: "threed" })}
      topBarModel={topBarModel}
      editorPanels={editorPanels}
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
