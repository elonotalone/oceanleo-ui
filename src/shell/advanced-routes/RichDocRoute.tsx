"use client";

import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { RichDocControls } from "../doc-editors/RichDocControls";
import { RichDocStage } from "../doc-editors/RichDocStage";
import { useRichDocEditor } from "../doc-editors/use-rich-doc-editor";
import { editorToolLabel } from "../workbench-routes";

export function RichDocRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useRichDocEditor(item, siteId);
  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({ type: "richdoc" })}
      editorControls={<RichDocControls editor={editor} accent={accent} />}
      editorStage={<RichDocStage editor={editor} accent={accent} />}
      editorStatus={
        editor.error ||
        (editor.dirty
          ? "有未保存的修改"
          : editor.savedUrl
          ? "已保存到我的库"
          : editor.loading
            ? "正在载入文档"
            : "")
      }
      editorDirty={editor.dirty}
      onBeforeNewConversation={editor.save}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
