"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import {
  AdvancedWorkbenchShell,
  type EditorPanelDescriptor,
} from "../AdvancedWorkbenchShell";
import type { TopBarModel } from "../advanced-topbar";
import { useUI } from "../../i18n/ui/useUI";
import { editorRouteFor, editorToolLabel } from "../workbench-routes";
import {
  OfficeControls,
  OfficeStage,
  useOfficeWorkbench,
} from "../office-editor";

export function OfficeRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const tt = useUI();
  const editor = useOfficeWorkbench(item, siteId, onClose);
  const saveBeforeNewConversation = useCallback(async () => {
    const savedItem = await editor.waitForSave();
    return savedItem
      ? { ok: true as const, item: savedItem }
      : { ok: false as const };
  }, [editor.waitForSave]);

  // 统一顶栏：Office 的排版/样式/表格等专业操作全部在 OnlyOffice 自带工具条里
  // （iframe 内），宿主这里只暴露真实存在的宿主级操作——重新加载编辑器 + 一个
  // 「说明」面板承接原 OfficeControls 的状态与重试。
  const topBarModel = useMemo<TopBarModel>(
    () => ({
      groups: [
        {
          id: "help",
          actions: [
            {
              kind: "panel",
              id: "info",
              label: tt("说明"),
              icon: "note",
              panelId: "info",
            },
          ],
        },
      ],
      trailing: [
        {
          kind: "action",
          id: "reload",
          label: tt("重新加载"),
          icon: "redo",
          iconOnly: true,
          disabled: editor.state === "loading",
          onRun: () => void editor.retry(),
        },
      ],
    }),
    [editor.retry, editor.state, tt],
  );

  const editorPanels = useMemo<EditorPanelDescriptor[]>(
    () => [
      {
        id: "info",
        title: tt("Office 专业编辑"),
        width: 300,
        content: <OfficeControls editor={editor} accent={accent} />,
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
      editorStage={<OfficeStage editor={editor} />}
      editorAvailable={Boolean(editor.extension)}
      editorStatus={editor.error || editor.state}
      editorDirty={editor.dirty}
      editorOwnsCloseGuard
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={editor.savedItem}
      versionRevision={editor.saveCount}
      onClose={editor.requestClose}
    />
  );
}
