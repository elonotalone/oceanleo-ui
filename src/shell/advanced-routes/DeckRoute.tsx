"use client";

import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { DeckControls } from "../doc-editors/DeckControls";
import { DeckStage } from "../doc-editors/DeckStage";
import { useDeckEditor } from "../doc-editors/use-deck-editor";
import { editorToolLabel } from "../workbench-routes";

export function DeckRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useDeckEditor(item, siteId, previewContent);
  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel({ type: "deck" })}
      editorControls={<DeckControls editor={editor} accent={accent} />}
      editorStage={<DeckStage editor={editor} accent={accent} />}
      editorStatus={
        editor.error ||
        editor.notice ||
        (editor.loading ? "正在载入演示文稿" : "")
      }
      editorDirty={editor.dirty}
      versionRevision={editor.savedUrl}
      onClose={onClose}
    />
  );
}
