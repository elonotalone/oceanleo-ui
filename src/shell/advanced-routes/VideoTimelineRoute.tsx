"use client";

import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { editorRouteFor, editorToolLabel } from "../workbench-routes";
import {
  VideoTimelineControls,
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
  return (
    <AdvancedWorkbenchShell
      item={item}
      previewContent={previewContent}
      linkUrl={linkUrl}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      editorLabel={editorToolLabel(editorRouteFor(item))}
      editorControls={
        <VideoTimelineControls state={editor} accent={accent} />
      }
      editorStage={<VideoTimelineStage state={editor} accent={accent} />}
      editorStatus={editor.error || editor.notice}
      editorDirty={editor.dirty}
      onBeforeNewConversation={editor.saveDraft}
      versionRevision={`${editor.draftSavedUrl}|${editor.exportedUrl}`}
      onClose={onClose}
    />
  );
}
