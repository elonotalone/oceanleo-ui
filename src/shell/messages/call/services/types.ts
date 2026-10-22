// 通话服务（W06）对外的数据形状。index.ts 原样再导出；组件与 hooks 都从这里取类型，避免循环引用。
import type { RecordingView, TranscriptionView } from "../../../../lib/im/call-types";
import type { ServiceError } from "./errors";
import type { UplinkStatus } from "./uplink";

export type ServiceRecordingView = RecordingView;
export type ServiceTranscriptionView = TranscriptionView;
export type { ServiceError } from "./errors";
export type { UplinkStatus } from "./uplink";

/** 一行字幕（同一说话人连续的几句已合并）。 */
export interface CaptionLine {
  /** 说话人参与者 id（服务端 participant_id）。 */
  participantId: string;
  userId: string;
  /** 已翻译好的说话人名（自己显示「我」）。 */
  speakerName: string;
  isMe: boolean;
  sentenceId: string;
  text: string;
  isFinal: boolean;
  updatedAt: number;
}

/** 自己这一路字幕采集的状态。unsupported = 这台设备不另开采集（见 capture.ts）。 */
export type CaptionsCaptureState = "off" | "starting" | "running" | "unsupported" | "failed";

export interface CaptionsState {
  /** 服务端转写开着（字幕只在开着时显示）。 */
  enabled: boolean;
  /** 最近几行（最多 4 行，最新在后）；小窗取最后 1 行、放大视图取最后 2 行。 */
  lines: CaptionLine[];
  /** 本地隐藏字幕（记住选择，只影响自己）。 */
  hidden: boolean;
  setHidden(hidden: boolean): void;
  /** 自己的字幕上行状态（「实时转写暂不可用」等提示用）。 */
  uplink: UplinkStatus;
  capture: CaptionsCaptureState;
}

export interface RecordingState {
  /** 当前或最近一次录制（以服务端 CallView.recording 为准；开关请求刚返回、广播未到的几秒内用请求结果）。 */
  view: RecordingView | null;
  /** 录制进行中（starting / recording）：所有人看到「录制中」。 */
  active: boolean;
  /** 正在停止（stopping）：开关暂不可点。 */
  stopping: boolean;
  /** 能操作：自己在通话里（已连接或重连中）且知道 callId。 */
  available: boolean;
  busy: boolean;
  error: ServiceError | null;
  /** 本通话里收到过 `recording_storage_unavailable`：开关旁常驻说明「录制存储尚未开通」。 */
  storageUnavailable: boolean;
  toggle(): Promise<void>;
}

export interface TranscriptionState {
  view: TranscriptionView | null;
  enabled: boolean;
  available: boolean;
  busy: boolean;
  error: ServiceError | null;
  toggle(): Promise<void>;
}

export interface CallCaptionsLineProps {
  /** dock = 小窗一行；stage = 放大视图两行。 */
  mode?: "dock" | "stage";
  className?: string;
}

export interface CallServiceToggleProps {
  /** dock = 只有图标（有可读名与提示）；stage = 图标 + 文字。 */
  mode?: "dock" | "stage";
  /** button = 工具栏按钮（默认）；menuitem = 菜单里的一行。 */
  variant?: "button" | "menuitem";
  className?: string;
}

export interface CallServiceBadgesProps {
  mode?: "dock" | "stage";
  className?: string;
}
