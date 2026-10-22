// 通话服务（W06）：转写字幕与录制的客户端服务与组件。合同 §3.9 的导出名与签名不改；
// 另有向后兼容的追加导出（类型）。
//
// 挂载（W07）：小窗里挂 `CallServicesHost`（一次）、`CallServiceBadges`、`CallCaptionsLine mode="dock"`；
// 放大视图里挂 `CallServiceBadges mode="stage"`、`CallCaptionsLine mode="stage"`、底部按钮组里
// `CallTranscriptionToggle` 与 `CallRecordingToggle`；麦克风菜单里的「显示字幕」由 W07 用 `useCaptions().hidden/setHidden` 自己做。
// 录像卡片 / 纪要卡片（W08）用 `recordingApi.play/get`、`transcriptionApi.transcript`。

export { CallServicesHost } from "./CallServicesHost";
export { CallCaptionsLine } from "./CallCaptionsLine";
export { CallTranscriptionToggle, CallRecordingToggle } from "./CallServiceToggles";
export { CallServiceBadges } from "./CallServiceBadges";
export { useCaptions, useRecordingState, useTranscriptionState } from "./hooks";
export { recordingApi, transcriptionApi } from "./api";

export type {
  CaptionAnnouncement,
  CaptionLine,
  CaptionsState,
  CaptionsCaptureState,
  RecordingState,
  TranscriptionState,
  ServiceRecordingView,
  ServiceTranscriptionView,
  ServiceError,
  UplinkStatus,
  CallCaptionsLineProps,
  CallServiceToggleProps,
  CallServiceBadgesProps,
} from "./types";
export type {
  RecordingDetail,
  RecordingFile,
  RecordingPlayback,
  TranscriptResponse,
  TranscriptSegment,
  RecordingApi,
  TranscriptionApi,
} from "./api";
