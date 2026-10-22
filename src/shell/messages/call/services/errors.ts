// 转写/录制开关的错误 → 界面文案（简体中文原文即 tt() 的 key；17 语译文在 call-services-copy.ts）。
// 纯函数（不 import 请求客户端，单测可直接加载）：单测逐条断言映射，并断言这里能返回的每一条文案在 17 种语言里都有译文。

export interface ServiceError {
  code: string;
  /** 简体中文原文（界面用 tt() 翻译）。 */
  message: string;
}

/** 录制存储未开通（合同 §3.5：503 `recording_storage_unavailable`）。按钮要原样给出这句说明，不假装成功。 */
export const RECORDING_STORAGE_UNAVAILABLE = "recording_storage_unavailable";

export const SERVICE_ERROR_COPY = {
  recording_storage_unavailable: "录制存储尚未开通",
  asr_unavailable: "实时转写暂不可用，请稍后再试",
  rate_limited: "操作太频繁，请稍后再试",
  not_participant: "你已不在通话中",
  call_unavailable: "这通通话已经结束",
  not_member: "你已不在这个会话里",
  removed_from_conversation: "你已不在这个会话里",
  network: "网络不通，请稍后再试",
  unauthorized: "登录已过期，请重新登录",
  unknown: "操作没有成功，请稍后再试",
} as const;

/** 错误码 → 文案 key。认不出的码按 HTTP 状态归类，再不行用通用说法。 */
export function serviceErrorMessage(code: string, status = 0): string {
  const known = (SERVICE_ERROR_COPY as Record<string, string>)[code];
  if (known) return known;
  if (status === 401) return SERVICE_ERROR_COPY.unauthorized;
  if (status === 429) return SERVICE_ERROR_COPY.rate_limited;
  if (status === 404) return SERVICE_ERROR_COPY.call_unavailable;
  return SERVICE_ERROR_COPY.unknown;
}

/** 任意异常 → { code, message }。ImApiError（有 code 与 status）用它的码；其余一律 unknown。 */
export function toServiceError(error: unknown): ServiceError {
  if (error && typeof error === "object" && "code" in error && "status" in error) {
    const e = error as { code?: unknown; status?: unknown };
    const code = typeof e.code === "string" && e.code ? e.code : "unknown";
    const status = typeof e.status === "number" ? e.status : 0;
    return { code, message: serviceErrorMessage(code, status) };
  }
  return { code: "unknown", message: SERVICE_ERROR_COPY.unknown };
}
