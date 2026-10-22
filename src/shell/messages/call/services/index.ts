// 通话服务（W06）：转写字幕与录制的客户端服务与组件。合同 §3.9 导出名，签名不改。
// 首个提交是桩：组件返回 null，hooks 返回空态；实现随后补齐。

export interface CaptionLine {
  /** 说话人参与者 id（服务端 participant_id）。 */
  participantId: string;
  userId: string;
  speakerName: string;
  sentenceId: string;
  text: string;
  isFinal: boolean;
  updatedAt: number;
}

export interface CaptionsState {
  lines: CaptionLine[];
  /** 本地隐藏字幕（记住选择）。 */
  hidden: boolean;
  setHidden(hidden: boolean): void;
}

export interface ServiceRecordingView {
  recording_id: string;
  state: "starting" | "recording" | "stopping" | "processing" | "ready" | "failed";
  started_by: string | null;
  started_at: string | null;
  stopped_by: string | null;
  stopped_at: string | null;
  error: string | null;
}

export interface ServiceTranscriptionView {
  enabled: boolean;
  started_by: string | null;
  started_at: string | null;
}

export interface RecordingState {
  view: ServiceRecordingView | null;
  /** 录制进行中（starting/recording/stopping）。 */
  active: boolean;
  busy: boolean;
  error: { code: string; message: string } | null;
  toggle(): Promise<void>;
}

export interface TranscriptionState {
  view: ServiceTranscriptionView | null;
  enabled: boolean;
  busy: boolean;
  error: { code: string; message: string } | null;
  toggle(): Promise<void>;
}

export interface CallCaptionsLineProps {
  /** dock = 小窗一行；stage = 放大视图两行。 */
  mode?: "dock" | "stage";
}

export interface CallServiceToggleProps {
  mode?: "dock" | "stage";
}

export interface CallServiceBadgesProps {
  mode?: "dock" | "stage";
}

export function CallServicesHost(): null {
  return null;
}

export function CallCaptionsLine(_props: CallCaptionsLineProps): null {
  return null;
}

export function CallTranscriptionToggle(_props: CallServiceToggleProps): null {
  return null;
}

export function CallRecordingToggle(_props: CallServiceToggleProps): null {
  return null;
}

export function CallServiceBadges(_props: CallServiceBadgesProps): null {
  return null;
}

export function useCaptions(): CaptionsState {
  return { lines: [], hidden: false, setHidden: () => undefined };
}

export function useRecordingState(): RecordingState {
  return { view: null, active: false, busy: false, error: null, toggle: async () => undefined };
}

export function useTranscriptionState(): TranscriptionState {
  return { view: null, enabled: false, busy: false, error: null, toggle: async () => undefined };
}

export const recordingApi = {
  async start(_callId: string): Promise<{ recording: ServiceRecordingView }> {
    throw new Error("not_implemented");
  },
  async stop(_callId: string): Promise<{ recording: ServiceRecordingView }> {
    throw new Error("not_implemented");
  },
  async get(
    _recordingId: string,
  ): Promise<{ recording: ServiceRecordingView; files: { format: string; duration_seconds: number; size_bytes: number }[] }> {
    throw new Error("not_implemented");
  },
  async play(_recordingId: string): Promise<{ url: string; expires_at: string }> {
    throw new Error("not_implemented");
  },
};

export const transcriptionApi = {
  async setEnabled(_callId: string, _enabled: boolean): Promise<{ transcription: ServiceTranscriptionView }> {
    throw new Error("not_implemented");
  },
  async transcript(_callId: string): Promise<{
    segments: { participant_id: string; user_id: string; text: string; begin_at: string; end_at: string }[];
    minutes: null | { message_id: string };
  }> {
    throw new Error("not_implemented");
  },
};
