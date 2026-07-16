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
import { editorRouteFor, editorToolLabel } from "../workbench-routes";
import {
  VideoTimelineControls,
  VideoTimelineContextToolbar,
  VideoTimelineStage,
  useVideoTimeline,
} from "../video-editor";

export function VideoTimelineRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const editor = useVideoTimeline(item, siteId);
  const savedItem = useMemo(
    () =>
      editor.draftSavedUrl
        ? advancedSavedItem(item, { url: editor.draftSavedUrl })
        : null,
    [editor.draftSavedUrl, item],
  );
  const saveBeforeNewConversation = useCallback(async () => {
    const url = await editor.saveDraft();
    return url
      ? { ok: true as const, item: advancedSavedItem(item, { url }) }
      : { ok: false as const };
  }, [editor.saveDraft, item]);

  // 统一顶栏：撤销/重做 · 分割 · 加文字 · 素材/轨道/画布设置面板 —— 收尾区：草稿/导出。
  const exportBusy = editor.exporting;
  const exportLabel = exportBusy
    ? editor.exportStatus === "running"
      ? tt("渲染中…")
      : tt("排队中…")
    : tt("导出成片");
  const topBarModel = useMemo<TopBarModel>(
    () => ({
      groups: [
        {
          id: "history",
          actions: [
            {
              kind: "action",
              id: "undo",
              label: tt("撤销"),
              icon: "undo",
              iconOnly: true,
              disabled: !editor.canUndo,
              onRun: editor.undo,
            },
            {
              kind: "action",
              id: "redo",
              label: tt("重做"),
              icon: "redo",
              iconOnly: true,
              disabled: !editor.canRedo,
              onRun: editor.redo,
            },
          ],
        },
        {
          id: "edit",
          actions: [
            {
              kind: "action",
              id: "split",
              label: tt("分割"),
              icon: "split",
              onRun: editor.splitAtPlayhead,
            },
            {
              kind: "action",
              id: "delete-clip",
              label: tt("删除片段"),
              icon: "delete",
              iconOnly: true,
              danger: true,
              disabled: !editor.selectedClipId,
              onRun: editor.deleteSelectedClip,
            },
          ],
        },
        {
          id: "insert",
          actions: [
            {
              kind: "action",
              id: "add-text",
              label: tt("文字"),
              icon: "add-text",
              onRun: editor.addTextClip,
            },
          ],
        },
        {
          id: "settings",
          actions: [
            {
              kind: "panel",
              id: "settings",
              label: tt("素材与轨道"),
              icon: "layers",
              panelId: "settings",
            },
          ],
        },
      ],
      trailing: [
        {
          kind: "action",
          id: "draft",
          label: editor.savingDraft ? tt("保存中…") : tt("保存草稿"),
          icon: "save",
          disabled: editor.savingDraft,
          onRun: () => void editor.saveDraft(),
        },
        exportBusy
          ? {
              kind: "action" as const,
              id: "cancel-export",
              label: tt("取消导出"),
              icon: "delete",
              danger: true,
              onRun: editor.cancelExport,
            }
          : {
              kind: "action" as const,
              id: "export",
              label: exportLabel,
              icon: "download",
              disabled: exportBusy,
              onRun: () => void editor.exportVideo(),
            },
      ],
    }),
    [
      editor.addTextClip,
      editor.canRedo,
      editor.canUndo,
      editor.cancelExport,
      editor.deleteSelectedClip,
      editor.exportVideo,
      editor.redo,
      editor.saveDraft,
      editor.savingDraft,
      editor.selectedClipId,
      editor.splitAtPlayhead,
      editor.undo,
      exportBusy,
      exportLabel,
      tt,
    ],
  );

  const editorPanels = useMemo<EditorPanelDescriptor[]>(
    () => [
      {
        id: "settings",
        title: tt("素材与轨道"),
        width: 320,
        content: <VideoTimelineControls state={editor} accent={accent} />,
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
      editorLabel={editorToolLabel(editorRouteFor(item))}
      topBarModel={topBarModel}
      editorPanels={editorPanels}
      editorContextualToolbar={
        <VideoTimelineContextToolbar state={editor} accent={accent} />
      }
      editorStage={<VideoTimelineStage state={editor} accent={accent} />}
      editorStatus={editor.error || editor.notice}
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={`${editor.draftSavedUrl}|${editor.exportedUrl}`}
      onClose={onClose}
    />
  );
}
