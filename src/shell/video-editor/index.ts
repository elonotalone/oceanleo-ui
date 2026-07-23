// @oceanleo/ui — 多轨视频时间线剪辑器（高级内容工作台 v2 video 路线）。
// 三件套：useVideoTimeline（全部状态）+ VideoTimelineControls（工具窄栏）
// + VideoTimelineStage（预览+时间线主区）；VideoTimelineEditor 为独立组合形态。

export { VideoTimelineEditor } from "./VideoTimelineEditor";
export type { VideoTimelineEditorProps } from "./VideoTimelineEditor";
export { VideoTimelineControls } from "./VideoTimelineControls";
export { VideoTimelineContextToolbar } from "./VideoTimelineContextToolbar";
export { VideoTimelineStage } from "./VideoTimelineStage";
export { useVideoTimeline } from "./use-video-timeline";
export type { VideoTimelineState } from "./use-video-timeline";
export {
  createGatewayTimelineRenderAdapter,
  renderTimeline,
  submitRenderJob,
  getRenderJob,
} from "./render-client";
export type {
  GatewayTimelineRenderAdapterOptions,
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
export {
  TIMELINE_COMMAND_REGISTRY,
  TIMELINE_DOCUMENT_VERSION,
  TIMELINE_KERNEL_SCHEMA,
  TIMELINE_RUN_RECEIPT_SCHEMA,
  TIMELINE_SNAPSHOT_SCHEMA,
  applyTimelineCommand,
  createTimelineCompositeKernel,
  createTimelineKernelState,
  createTimelineVersionSnapshot,
  freezeTimelineDoc,
  startTimelineRender,
  startTimelineSave,
} from "./timeline-capability-engine";
export type {
  TimelineCapabilityAvailability,
  TimelineCommandDescriptor,
  TimelineCompositeKernel,
  TimelineEditResult,
  TimelineEngineClock,
  TimelineKernelState,
  TimelineRenderAdapter,
  TimelineRenderReceipt,
  TimelineRenderResult,
  TimelineRunError,
  TimelineRunHandle,
  TimelineRunProgress,
  TimelineRunSnapshot,
  TimelineSaveAdapter,
  TimelineSaveReceipt,
  TimelineSaveResult,
  TimelineSemanticCommand,
  TimelineSemanticCommandId,
  TimelineVersionSnapshot,
} from "./timeline-capability-engine";
