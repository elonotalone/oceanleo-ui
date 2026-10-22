// 被控方的纯判断（tests/call-control-host.test.mjs 直接测）。不碰 DOM、不碰 React。
import type { ControlDeclineReason } from "./control-api";
import type { CallControlOfferDecision } from "./bridge";

export interface ShareSurfaceLite {
  width: number;
  height: number;
  displaySurface: string;
}

/** 整屏共享 = `displaySurface === "monitor"`。拿不到/认不出一律当不是（失败即关闭）。 */
export function isWholeScreenShare(surface: ShareSurfaceLite | null | undefined): boolean {
  return Boolean(
    surface &&
      surface.displaySurface === "monitor" &&
      Number.isFinite(surface.width) &&
      Number.isFinite(surface.height) &&
      surface.width > 0 &&
      surface.height > 0,
  );
}

export type HostDecision =
  | { action: "ignore"; why: "not_in_call" | "not_pending" }
  | { action: "browser_card" }
  | { action: "decline_not_whole_screen" }
  | { action: "offer" };

/**
 * 收到 `call_control_request` 之后这个标签页做什么：
 *  - 本页不在这通通话里（用户在别的设备/标签页通话）→ 不管，由在通话的那一端处理；
 *  - 会话已不在待批准 → 不管；
 *  - 普通浏览器（没有桌面桥）→ 卡片「请在 OceanLeo 桌面客户端里同意」+ 拒绝；
 *  - 桌面客户端但共享的不是整个屏幕 → 不调桥，直接拒绝（原因 share_entire_screen）并本地提示；
 *  - 桌面客户端且整屏共享 → 调桥 `offer(...)`，由本机界面决定。
 */
export function decideControlRequest(input: {
  inThisCall: boolean;
  pending: boolean;
  hasBridge: boolean;
  surface: ShareSurfaceLite | null;
}): HostDecision {
  if (!input.inThisCall) return { action: "ignore", why: "not_in_call" };
  if (!input.pending) return { action: "ignore", why: "not_pending" };
  if (!input.hasBridge) return { action: "browser_card" };
  if (!isWholeScreenShare(input.surface)) return { action: "decline_not_whole_screen" };
  return { action: "offer" };
}

/**
 * 桥给出结果之后网页还要做什么。批准/拒绝/超时由本机用设备凭据告诉网关（INV-2）；
 * 没批准的情况网页再用用户会话补一次拒绝（带 A-6 原因），保证控制方马上看到结果——
 * 本机已经拒过的话这次调用失败也无妨（结果一样）。批准时网页什么都不调。
 */
export function declineAfterOffer(decision: CallControlOfferDecision): ControlDeclineReason | null {
  switch (decision) {
    case "approved":
      return null;
    case "timeout":
      return "timeout";
    case "unsupported":
      return "unsupported";
    default:
      return "user";
  }
}

export type TargetStopReason = "left_call" | "share_stopped" | "not_whole_screen";

/**
 * 正在被控制时，本端出现下列情况就立刻停（本机桥 stop + 接口 stop）：
 * 离开了这通通话、停止了共享屏幕、共享改成了窗口（非整屏）。
 */
export function targetStopReason(input: {
  phase: string;
  callId: string | null;
  sessionCallId: string;
  screenOn: boolean;
  surface: ShareSurfaceLite | null;
}): TargetStopReason | null {
  const inCall = input.phase === "connected" || input.phase === "reconnecting";
  if (!inCall || input.callId !== input.sessionCallId) return "left_call";
  if (!input.screenOn) return "share_stopped";
  if (!isWholeScreenShare(input.surface)) return "not_whole_screen";
  return null;
}

// ---- 防骗提醒：首次收到请求时显示，用户点「知道了」或处理过请求后记住 ------------------------
export const ANTI_FRAUD_STORAGE_KEY = "oceanleo:call-control:anti-fraud-seen:v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function antiFraudSeen(storage: StorageLike | null | undefined): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(ANTI_FRAUD_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markAntiFraudSeen(storage: StorageLike | null | undefined): void {
  if (!storage) return;
  try {
    storage.setItem(ANTI_FRAUD_STORAGE_KEY, "1");
  } catch {
    /* 隐身模式/配额满：下次再提醒一次，不算错 */
  }
}

/** 网关地址（给桌面桥用，本机侧用它调设备端接口）：取 origin；空/相对地址退回当前页面 origin。 */
export function gatewayOriginOf(gatewayBase: string, pageOrigin: string | null): string {
  const raw = String(gatewayBase || "").trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      /* fallthrough */
    }
  }
  return pageOrigin ?? "";
}
