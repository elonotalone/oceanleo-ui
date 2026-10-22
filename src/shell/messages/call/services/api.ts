// 录制（合同 §3.5，W02 后端）与转写（合同 §3.6，W03 后端）的网关接口。
// 复用 IM 请求客户端：带 token、网关地址、错误统一抛 ImApiError（`code` 取自 `{"detail":{"code","message"}}`）。
// 每个方法原样返回端点的 JSON 体，不拆包。
import { imFetch } from "../../../../lib/im/client";
import type { RecordingView, TranscriptionView } from "../../../../lib/im/call-types";

export interface RecordingFile {
  format: string;
  duration_seconds: number;
  size_bytes: number;
}

export interface RecordingDetail {
  recording: RecordingView;
  files: RecordingFile[];
}

export interface RecordingPlayback {
  /** 短时签名地址（≤10 分钟），只用来播放，不落盘不转存。 */
  url: string;
  expires_at: string;
}

export interface TranscriptSegment {
  participant_id: string;
  user_id: string;
  text: string;
  begin_at: string;
  end_at: string;
}

export interface TranscriptResponse {
  segments: TranscriptSegment[];
  minutes: null | { message_id: string };
}

export type RecordingAction = "start" | "stop";

type Fetcher = <T>(path: string, init?: RequestInit & { json?: unknown }) => Promise<T>;

export const callServicePath = (callId: string): string => `/v1/im/calls/${encodeURIComponent(callId)}`;
export const recordingPath = (recordingId: string): string => `/v1/im/calls/recordings/${encodeURIComponent(recordingId)}`;

/** 可注入 fetcher 的工厂（单测用假 fetcher 断言路径与载荷）；产品代码用下面的默认实例。 */
export function createRecordingApi(fetcher: Fetcher = imFetch) {
  return {
    /** 开始录制（在场参与者）。存储未开通 → 503 `recording_storage_unavailable`。 */
    start(callId: string): Promise<{ recording: RecordingView }> {
      return fetcher<{ recording: RecordingView }>(`${callServicePath(callId)}/recording`, {
        method: "POST",
        json: { action: "start" },
      });
    },
    /** 停止录制（在场参与者，谁开的都能停）。 */
    stop(callId: string): Promise<{ recording: RecordingView }> {
      return fetcher<{ recording: RecordingView }>(`${callServicePath(callId)}/recording`, {
        method: "POST",
        json: { action: "stop" },
      });
    },
    /** 录像详情与文件（会话成员）。 */
    get(recordingId: string): Promise<RecordingDetail> {
      return fetcher<RecordingDetail>(recordingPath(recordingId));
    },
    /** 播放用的短时签名地址（会话成员）。 */
    play(recordingId: string): Promise<RecordingPlayback> {
      return fetcher<RecordingPlayback>(`${recordingPath(recordingId)}/play`);
    },
  };
}

export function createTranscriptionApi(fetcher: Fetcher = imFetch) {
  return {
    /** 开/关转写（在场参与者，任何人都可以）。 */
    setEnabled(callId: string, enabled: boolean): Promise<{ transcription: TranscriptionView }> {
      return fetcher<{ transcription: TranscriptionView }>(`${callServicePath(callId)}/transcription`, {
        method: "POST",
        json: { enabled: Boolean(enabled) },
      });
    },
    /** 转写全文（会话成员；通话结束后纪要卡片「展开全文」用）。 */
    transcript(callId: string): Promise<TranscriptResponse> {
      return fetcher<TranscriptResponse>(`${callServicePath(callId)}/transcript`);
    },
  };
}

export const recordingApi = createRecordingApi();
export const transcriptionApi = createTranscriptionApi();

export type RecordingApi = ReturnType<typeof createRecordingApi>;
export type TranscriptionApi = ReturnType<typeof createTranscriptionApi>;
