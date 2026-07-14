// @oceanleo/ui — 多轨视频时间线剪辑器（高级内容工作台 v2 video 路线）。
// 三件套：useVideoTimeline（全部状态）+ VideoTimelineControls（工具窄栏）
// + VideoTimelineStage（预览+时间线主区）；VideoTimelineEditor 为独立组合形态。

export { VideoTimelineEditor } from "./VideoTimelineEditor";
export type { VideoTimelineEditorProps } from "./VideoTimelineEditor";
export { VideoTimelineControls } from "./VideoTimelineControls";
export { VideoTimelineStage } from "./VideoTimelineStage";
export { useVideoTimeline } from "./use-video-timeline";
export type { VideoTimelineState } from "./use-video-timeline";
export {
  renderTimeline,
  submitRenderJob,
  getRenderJob,
} from "./render-client";
export type {
  RenderJobState,
  RenderJobStatus,
  SubmitRenderPayload,
} from "./render-client";
export type {
  TimelineDoc,
  TimelineTrack,
  TimelineClip,
  TimelineTextStyle,
  TimelineTransition,
  TransitionType,
  TrackKind,
} from "./types";
