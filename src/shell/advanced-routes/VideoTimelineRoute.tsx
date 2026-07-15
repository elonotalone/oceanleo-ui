"use client";

import { useCallback, useMemo } from "react";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedSavedItem } from "../advanced-session";
import { editorRouteFor, editorToolLabel } from "../workbench-routes";
import {
  VideoTimelineControls,
  VideoTimelineContextToolbar,
  VideoTimelineStage,
  useVideoTimeline,
} from "../video-editor";

export function VideoTimelineRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const editor = useVideoTimeline(item, siteId);
  const savedItem = useMemo(
    () =>
      editor.draftSavedUrl
        ? advancedSavedItem(item, { url: editor.draftSavedUrl })
        : null,
    [editor.draftSavedUrl, item],
  );
  const saveBeforeNewConversation = useCallback(async () => {
    const url = await editor.saveDraft();
    return url
      ? { ok: true as const, item: advancedSavedItem(item, { url }) }
      : { ok: false as const };
  }, [editor.saveDraft, item]);
  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel(editorRouteFor(item))}
      editorToolbox={
        <VideoTimelineControls state={editor} accent={accent} />
      }
      editorContextualToolbar={
        <VideoTimelineContextToolbar state={editor} accent={accent} />
      }
      editorStage={<VideoTimelineStage state={editor} accent={accent} />}
      editorStatus={editor.error || editor.notice}
      editorDirty={editor.dirty}
      onBeforeNewConversation={saveBeforeNewConversation}
      savedItem={savedItem}
      versionRevision={`${editor.draftSavedUrl}|${editor.exportedUrl}`}
      onClose={onClose}
    />
  );
}
