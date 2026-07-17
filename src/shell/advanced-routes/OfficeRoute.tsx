"use client";

import { useCallback } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { editorRouteFor, editorToolLabel } from "../workbench-routes";
import {
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
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id: "office",
        label: editorToolLabel(editorRouteFor(item)),
        stage: <OfficeStage editor={editor} />,
        available: Boolean(editor.extension),
        status: editor.error || editor.state,
        nativeChrome: {
          toolbar: true,
          viewport: true,
          closeGuard: true,
        },
        actions:
          editor.state === "error"
            ? [
                {
                  id: "office-retry",
                  label: "重试加载",
                  onTrigger: editor.retry,
                },
              ]
            : [],
        persistence: {
          dirty: editor.dirty,
          editRevision: editor.editRevision,
          flush: saveBeforeNewConversation,
        },
      }}
      onClose={onClose}
    />
  );
}
