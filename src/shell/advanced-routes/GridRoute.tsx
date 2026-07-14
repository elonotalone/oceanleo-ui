"use client";

import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { GridControls } from "../doc-editors/GridControls";
import { GridStage } from "../doc-editors/GridStage";
import { useGridEditor } from "../doc-editors/use-grid-editor";
import { editorToolLabel } from "../workbench-routes";

export function GridRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useGridEditor(item, siteId);
  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({ type: "grid" })}
      editorControls={<GridControls editor={editor} accent={accent} />}
      editorStage={<GridStage editor={editor} accent={accent} />}
      editorStatus={
        editor.error ||
        (editor.dirty
          ? "有未保存的修改"
          : editor.savedUrl
          ? "已保存到我的库"
          : editor.loading
            ? "正在载入表格"
            : "")
      }
      editorDirty={editor.dirty}
      onBeforeNewConversation={editor.save}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
