"use client";

import { useCallback } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
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
  const editor = useOfficeWorkbench(item, siteId, onClose);
  const saveBeforeNewConversation = useCallback(async () => {
    const savedItem = await editor.waitForSave();
    return savedItem
      ? { ok: true as const, item: savedItem }
      : { ok: false as const };
  }, [editor.waitForSave]);
  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel(editorRouteFor(item))}
      editorControls={<OfficeControls editor={editor} accent={accent} />}
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
