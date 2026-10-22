// 通话服务（W06）：转写字幕与录制的客户端服务与组件。合同 §3.9 的导出名与签名不改；
// 另有向后兼容的追加导出（类型、`CallCaptionsMenuItem` 给 W07 麦克风菜单用）。
//
// 挂载（W07）：小窗里挂 `CallServicesHost`（一次）、`CallServiceBadges`、`CallCaptionsLine mode="dock"`；
// 放大视图里挂 `CallServiceBadges mode="stage"`、`CallCaptionsLine mode="stage"`、底部按钮组里
// `CallTranscriptionToggle` 与 `CallRecordingToggle`；麦克风设备菜单里可放 `CallCaptionsMenuItem`。
// 录像卡片 / 纪要卡片（W08）用 `recordingApi.play/get`、`transcriptionApi.transcript`。

export { CallServicesHost } from "./CallServicesHost";
export { CallCaptionsLine } from "./CallCaptionsLine";
export { CallTranscriptionToggle, CallRecordingToggle, CallCaptionsMenuItem } from "./CallServiceToggles";
export { CallServiceBadges } from "./CallServiceBadges";
export { useCaptions, useRecordingState, useTranscriptionState } from "./hooks";
export { recordingApi, transcriptionApi } from "./api";

export type {
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
  CallCaptionsMenuItemProps,
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
