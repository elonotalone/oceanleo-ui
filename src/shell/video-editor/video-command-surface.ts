import type { EditorContextSurfaceInput } from "../plugin-command/types";
import type { VideoTimelineState } from "./use-video-timeline";
import { boundedAgentContent } from "../plugin-command/bounded-agent-content";
export function createVideoContext({ editor }: { editor: VideoTimelineState }): EditorContextSurfaceInput {
  return {
    editorId: "video-timeline",
    selection: () => ({ kind: "timeline", clipIds: editor.selectedClipId ? [editor.selectedClipId] : [], playheadMs: editor.playheadMs }),
    agentContext: () => editor.loadingSource || !editor.sourceReady ? { ready: false, reason: "Timeline source unavailable" } : boundedAgentContent({ clip: editor.selected, playheadMs: editor.playheadMs, tracks: editor.doc.tracks.map(track => ({ ...track, clips: track.clips.filter(clip => !editor.selectedClipId || clip.id === editor.selectedClipId) })) }),
  };
}
