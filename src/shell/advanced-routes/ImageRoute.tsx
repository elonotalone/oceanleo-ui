"use client";

import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { FabricImageControls } from "../image-editor/FabricImageControls";
import { FabricImageStage } from "../image-editor/FabricImageStage";
import { useFabricImageEditor } from "../image-editor/use-fabric-image-editor";
import { editorToolLabel } from "../workbench-routes";

export function ImageRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useFabricImageEditor(item, siteId);
  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({ type: "image" })}
      editorControls={<FabricImageControls editor={editor} accent={accent} />}
      editorStage={<FabricImageStage editor={editor} accent={accent} />}
      editorStatus={
        editor.error ||
        editor.notice ||
        (editor.loading ? "正在载入图片编辑器" : "")
      }
      editorDirty={editor.dirty}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
