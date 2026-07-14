"use client";

import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
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
  const editor = usePdfWorkbench(item, siteId);
  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({ type: "pdf" })}
      editorControls={<PdfControls editor={editor} accent={accent} />}
      editorStage={<PdfStage editor={editor} accent={accent} />}
      editorStatus={
        editor.error ||
        editor.notice ||
        (editor.loading ? "正在载入 PDF" : "")
      }
      editorDirty={editor.dirty}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
