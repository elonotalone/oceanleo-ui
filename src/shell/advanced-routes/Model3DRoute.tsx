"use client";

import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
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
  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({ type: "threed" })}
      editorControls={<Model3DControls editor={editor} accent={accent} />}
      editorStage={<Model3DStage editor={editor} />}
      editorStatus={
        editor.error ||
        editor.notice ||
        (editor.loading
          ? `正在载入 3D 模型${editor.progress > 0 ? ` ${Math.round(editor.progress * 100)}%` : ""}`
          : "")
      }
      editorDirty={editor.dirty}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
