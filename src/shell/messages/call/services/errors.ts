// 转写/录制开关的错误 → 界面文案（简体中文原文即 tt() 的 key；17 语译文在 call-services-copy.ts）。
// 纯函数（不 import 请求客户端，单测可直接加载）：单测逐条断言映射，并断言这里能返回的每一条文案在 17 种语言里都有译文。
// 错误码以后端为准：W02 `backend/app/im/call_recording.py`、W03 `backend/app/im/call_captions.py`、
// W01 `backend/app/im/call_events.py` 里的 `graph.fail(...)`。服务端的 message 只有中文，所以界面按码给 17 语文案。

export interface ServiceError {
  code: string;
  /** 简体中文原文（界面用 tt() 翻译）。 */
  message: string;
}

export type ServiceKind = "recording" | "transcription";

/** 录制存储未开通（合同 §3.5：503 `recording_storage_unavailable`）。按钮要原样给出这句说明，不假装成功。 */
export const RECORDING_STORAGE_UNAVAILABLE = "recording_storage_unavailable";

export const SERVICE_ERROR_COPY = {
  recording_storage_unavailable: "录制存储尚未开通",
  asr_unavailable: "实时转写暂不可用，请稍后再试",
  rate_limited: "操作太频繁，请稍后再试",
  recording_quota: "今天的录制次数已用完，请明天再试",
  recording_conflict: "录制状态刚刚变了，请再试一次",
  recording_unavailable: "录制暂时无法开始，请稍后再试",
  transcription_unavailable: "转写暂时不可用，请稍后再试",
  recording_no_media: "通话里还没有人连上，稍后再试",
  recording_provider_failed: "录制服务暂时不可用，请稍后再试",
  recording_provider_busy: "录制服务繁忙，请稍后再试",
  recording_not_active: "没有进行中的录制",
  artc_not_configured: "实时音视频尚未配置，暂时无法录制",
  not_participant: "你已不在通话中",
  call_unavailable: "这通通话已经结束",
  not_member: "你已不在这个会话里",
  network: "网络不通，请稍后再试",
  unauthorized: "登录已过期，请重新登录",
  unknown: "操作没有成功，请稍后再试",
} as const;

/** 映射可能给出的全部文案（单测拿它核 17 语齐全）。 */
export const SERVICE_ERROR_MESSAGES: readonly string[] = Object.values(SERVICE_ERROR_COPY);

/** 错误码（+ HTTP 状态、哪个开关）→ 文案 key。认不出的码按 HTTP 状态归类，再不行用通用说法。 */
export function serviceErrorMessage(code: string, status = 0, service: ServiceKind = "recording"): string {
  const C = SERVICE_ERROR_COPY;
  switch (code) {
    case "recording_storage_unavailable":
      return C.recording_storage_unavailable;
    case "asr_unavailable":
      return C.asr_unavailable;
    case "rate_limited":
      return C.rate_limited;
    case "quota_exceeded":
      return service === "recording" ? C.recording_quota : C.rate_limited;
    case "conflict":
      return service === "recording" ? C.recording_conflict : C.unknown;
    case "unavailable":
      return service === "recording" ? C.recording_unavailable : C.transcription_unavailable;
    case "recording_start_failed":
      return status === 409 ? C.recording_no_media : C.recording_provider_failed;
    case "recording_unavailable":
      return status === 404 ? C.recording_not_active : C.recording_provider_busy;
    case "artc_not_configured":
      return C.artc_not_configured;
    case "not_participant":
      return C.not_participant;
    case "call_unavailable":
      return C.call_unavailable;
    case "not_member":
    case "removed_from_conversation":
      return C.not_member;
    case "network":
      return C.network;
    case "unauthorized":
      return C.unauthorized;
    default:
      break;
  }
  if (status === 401) return C.unauthorized;
  if (status === 429) return C.rate_limited;
  if (status === 404) return C.call_unavailable;
  return C.unknown;
}

/** 任意异常 → { code, message }。ImApiError（有 code 与 status）用它的码；其余一律 unknown。 */
export function toServiceError(error: unknown, service: ServiceKind = "recording"): ServiceError {
  if (error && typeof error === "object" && "code" in error && "status" in error) {
    const e = error as { code?: unknown; status?: unknown };
    const code = typeof e.code === "string" && e.code ? e.code : "unknown";
    const status = typeof e.status === "number" ? e.status : 0;
    return { code, message: serviceErrorMessage(code, status, service) };
  }
  return { code: "unknown", message: SERVICE_ERROR_COPY.unknown };
}
