// 通话问题（`CallSnapshot.issues`）的增删与媒体错误归类（纯函数）。
import { DEVICE_EXCEPTION } from "./sdk";
import type { CallIssue } from "./types";

export function withIssue(list: readonly CallIssue[], issue: CallIssue): CallIssue[] {
  const index = list.findIndex((item) => item.kind === issue.kind);
  if (index >= 0) {
    if (list[index].detail === issue.detail) return list as CallIssue[];
    const next = list.slice();
    next[index] = issue;
    return next;
  }
  return [...list, issue];
}

export function withoutIssue(list: readonly CallIssue[], kind: CallIssue["kind"]): CallIssue[] {
  return list.some((item) => item.kind === kind) ? list.filter((item) => item.kind !== kind) : (list as CallIssue[]);
}

/** ARTC 错误码（声明 AliRtcErrorCode）里与设备相关的几项。 */
const SDK_CODE = {
  micOpenFail: 17040388,
  micAuthFail: 17040392,
  micNotAvailable: 17040393,
  micInterrupt: 17040390,
  cameraOpenFail: 17039620,
  cameraAuthFail: 17039621,
  cameraInterrupt: 17039622,
  cameraNotAvailable: 17039623,
} as const;

function errorName(error: unknown): string {
  const row = (error ?? {}) as { name?: unknown };
  return typeof row.name === "string" ? row.name : "";
}

function errorCode(error: unknown): number | null {
  const row = (error ?? {}) as { code?: unknown };
  return typeof row.code === "number" ? row.code : null;
}

function errorText(error: unknown): string {
  const row = (error ?? {}) as { message?: unknown };
  return typeof row.message === "string" ? row.message : String(error ?? "");
}

/**
 * 采集失败 → 问题。屏幕共享里用户在选择器里点「取消」也是 NotAllowedError，那不算问题（返回 null）；
 * 只有带 "system" 的拒绝（操作系统没给屏幕录制权限）才算 `screen_permission`。
 */
export function issueFromMediaError(source: "mic" | "camera" | "screen", error: unknown): CallIssue | null {
  const name = errorName(error);
  const code = errorCode(error);
  const text = errorText(error);
  const denied = name === "NotAllowedError" || name === "SecurityError" || /permission|denied|not ?allowed/i.test(text);
  const missing = name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError";
  if (source === "screen") {
    if (denied && /system/i.test(text)) return { kind: "screen_permission" };
    if (denied || name === "AbortError") return null;
    return { kind: "screen_permission", detail: name || text.slice(0, 120) || undefined };
  }
  if (source === "mic") {
    if (code === SDK_CODE.micAuthFail || denied) return { kind: "mic_permission" };
    if (code === SDK_CODE.micNotAvailable || missing) return { kind: "no_mic" };
    return { kind: "device_lost", detail: "mic" };
  }
  if (code === SDK_CODE.cameraAuthFail || denied) return { kind: "camera_permission" };
  return { kind: "device_lost", detail: "camera" };
}

/** SDK `localDeviceException(deviceType, exceptionType, msg)` → 问题。 */
export function issueFromDeviceException(exceptionType: unknown): CallIssue | null {
  switch (exceptionType) {
    case DEVICE_EXCEPTION.micAuthFail:
      return { kind: "mic_permission" };
    case DEVICE_EXCEPTION.micNotAvailable:
      return { kind: "no_mic" };
    case DEVICE_EXCEPTION.micOpenFail:
    case DEVICE_EXCEPTION.micInterrupt:
    case DEVICE_EXCEPTION.audioDeviceException:
      return { kind: "device_lost", detail: "mic" };
    case DEVICE_EXCEPTION.speakerOpenFail:
    case DEVICE_EXCEPTION.speakerInterrupt:
    case DEVICE_EXCEPTION.speakerNotAvailable:
      return { kind: "device_lost", detail: "speaker" };
    case DEVICE_EXCEPTION.cameraAuthFail:
      return { kind: "camera_permission" };
    case DEVICE_EXCEPTION.cameraOpenFail:
    case DEVICE_EXCEPTION.cameraInterrupt:
    case DEVICE_EXCEPTION.videoDeviceException:
      return { kind: "device_lost", detail: "camera" };
    default:
      return null;
  }
}

/** 异常/描述文字里是否说的是「权限被拒」（浏览器 NotAllowedError、SDK 包装后的 "… not allowed"）。 */
export function textSaysDenied(...texts: unknown[]): boolean {
  return texts.some((text) => {
    if (text && typeof text === "object") {
      const row = text as { name?: unknown; message?: unknown };
      return textSaysDenied(row.name, row.message);
    }
    return typeof text === "string" && /NotAllowedError|SecurityError|permission|denied|not ?allowed/i.test(text);
  });
}

/** 问题属于哪个本地设备（权限/缺设备/掉线）；与设备无关的返回 null。 */
export function deviceOfIssue(issue: CallIssue): "mic" | "camera" | null {
  if (issue.kind === "mic_permission" || issue.kind === "no_mic") return "mic";
  if (issue.kind === "camera_permission") return "camera";
  if (issue.kind === "device_lost" && (issue.detail === "mic" || issue.detail === "camera")) return issue.detail;
  return null;
}

/**
 * 设备问题并入列表：权限被拒 / 没有麦克风 优先于「设备掉了」——
 * 同一设备已有权限问题时不再加 `device_lost`，新来的权限问题会把同一设备的 `device_lost` 换掉（V02 D6）。
 */
export function mergeDeviceIssue(list: readonly CallIssue[], issue: CallIssue): CallIssue[] {
  const device = deviceOfIssue(issue);
  if (!device) return withIssue(list, issue);
  if (issue.kind === "device_lost") {
    const blocked = device === "mic"
      ? list.some((item) => item.kind === "mic_permission" || item.kind === "no_mic")
      : list.some((item) => item.kind === "camera_permission");
    return blocked ? (list as CallIssue[]) : withIssue(list, issue);
  }
  const cleaned = list.filter((item) => !(item.kind === "device_lost" && item.detail === device));
  return withIssue(cleaned, issue);
}

/** 两份问题列表是否一样（用来避免无谓的快照更新）。 */
export function sameIssues(a: readonly CallIssue[], b: readonly CallIssue[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item.kind === b[index].kind && item.detail === b[index].detail);
}
