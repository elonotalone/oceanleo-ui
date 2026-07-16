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
import { PdfContextToolbar } from "../media-editors/PdfContextToolbar";
import { PdfControls } from "../media-editors/PdfControls";
import { PdfStage } from "../media-editors/PdfStage";
import { usePdfWorkbench } from "../media-editors/use-pdf-workbench";
import { editorToolLabel } from "../workbench-routes";

export function PdfRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const editor = usePdfWorkbench(item, siteId);
  const savedItem = useMemo(
    () =>
      editor.savedUrl
        ? advancedSavedItem(item, {
            url: editor.savedUrl,
            meta: { editor: "pdf-native-v1" },
          })
        : null,
    [editor.savedUrl, item],
  );
  const saveBeforeNewConversation = useCallback(async () => {
    const url = await editor.saveCopy();
    return url
      ? {
          ok: true as const,
          item: advancedSavedItem(item, {
            url,
            meta: { editor: "pdf-native-v1" },
          }),
        }
      : { ok: false as const };
  }, [editor.saveCopy, item]);

  // 统一顶栏：撤销/重做 · 加页/删页 · 页面工具面板 —— 收尾区：下载编辑版 / 保存副本。
  const busy = editor.loading || editor.processing || editor.saving;
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
              disabled: busy || !editor.canUndo,
              onRun: editor.undo,
            },
            {
              kind: "action",
              id: "redo",
              label: tt("重做"),
              icon: "redo",
              iconOnly: true,
              disabled: busy || !editor.canRedo,
              onRun: editor.redo,
            },
          ],
        },
        {
          id: "pages",
          actions: [
            {
              kind: "action",
              id: "add-page",
              label: tt("空白页"),
              icon: "page",
              disabled: busy,
              onRun: () => void editor.addBlankPage(),
            },
            {
              kind: "action",
              id: "delete-page",
              label: tt("删除本页"),
              icon: "delete",
              iconOnly: true,
              danger: true,
              disabled: busy || editor.pageCount <= 1,
              onRun: () => void editor.deleteCurrentPage(),
            },
          ],
        },
        {
          id: "tools",
          actions: [
            {
              kind: "panel",
              id: "tools",
              label: tt("页面工具"),
              icon: "layout",
              panelId: "tools",
            },
          ],
        },
      ],
      trailing: [
        {
          kind: "action",
          id: "download",
          label: tt("下载编辑版"),
          icon: "download",
          iconOnly: true,
          disabled: busy,
          onRun: editor.download,
        },
        {
          kind: "action",
          id: "save",
          label: editor.saving ? tt("保存中…") : tt("保存副本"),
          icon: "save",
          disabled: busy,
          onRun: () => void editor.saveCopy(),
        },
      ],
    }),
    [
      busy,
      editor.addBlankPage,
      editor.canRedo,
      editor.canUndo,
      editor.deleteCurrentPage,
      editor.download,
      editor.pageCount,
      editor.redo,
      editor.saveCopy,
      editor.saving,
      editor.undo,
      tt,
    ],
  );

  const editorPanels = useMemo<EditorPanelDescriptor[]>(
    () => [
      {
        id: "tools",
        title: tt("页面工具"),
        width: 300,
        content: <PdfControls editor={editor} accent={accent} />,
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
      editorLabel={editorToolLabel({ type: "pdf" })}
      topBarModel={topBarModel}
      editorPanels={editorPanels}
      editorContextualToolbar={
        <PdfContextToolbar editor={editor} accent={accent} />
      }
      editorStage={<PdfStage editor={editor} accent={accent} />}
      editorStatus={
        editor.error ||
        editor.notice ||
        (editor.loading ? "正在载入 PDF" : "")
      }
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
