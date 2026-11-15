"use client";

/** Stored v2 projects use the full shared engine. The client mount table still
 * creates unsaved v1 local graphs; only those use the legacy local draft stage. */
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { VideoCanvasStage } from "../workflow-carrier/VideoCanvasStage";
import { LibraryVideoCanvas } from "../video-canvas/LibraryVideoCanvas";
import { isNativeVideoProjectItem } from "../workflow-carrier/workflow-graph-source";

export {
  VIDEO_CANVAS_DUAL_ENGINE_HANDOFF,
  flushVideoCanvasGraph,
  videoCanvasLeavePolicy,
} from "../workflow-carrier/video-canvas-leave";

export function VideoCanvasRoute(props: AdvancedContentWorkbenchProps) {
  return isNativeVideoProjectItem(props.item) ? (
    <LibraryVideoCanvas {...props} />
  ) : (
    <VideoCanvasStage {...props} />
  );
}
