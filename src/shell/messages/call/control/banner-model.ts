// 提示条与提示语的纯模型（tests/call-control-banner.test.mjs 直接测）。不碰 DOM、不碰 React。
// 所有界面文案都在这里以 `tt("中文原文")` 字面量出现，与 call-control-copy.ts 的键一一对应。
import type { ControlView } from "../../../../lib/im/call-types";
import type { UITranslate } from "../../../../i18n/ui/useUI";
import { pendingDeadlineMs, type ControlTransition } from "./control-store";

export type ControlRole = "controller" | "target" | "viewer";

export function controlRole(view: Pick<ControlView, "controller_id" | "target_id">, meId: string | null): ControlRole {
  if (meId && view.controller_id === meId) return "controller";
  if (meId && view.target_id === meId) return "target";
  return "viewer";
}

export interface BannerLine {
  sessionId: string;
  kind: "active" | "waiting";
  role: ControlRole;
  controllerId: string;
  targetId: string;
  /** waiting 才有：90 秒截止时间（毫秒）。 */
  deadlineMs: number | null;
}

/**
 * 这通通话里要常驻显示的行：进行中的控制（所有参会者都看到）+ 我发出的、还在等对方同意的请求。
 * 顺序：进行中在前（与我有关的排最前），等待中在后。
 */
export function bannerLines(
  sessions: readonly ControlView[],
  ctx: { callId: string | null; meId: string | null; now: number },
): BannerLine[] {
  if (!ctx.callId) return [];
  const active: BannerLine[] = [];
  const waiting: BannerLine[] = [];
  for (const view of sessions) {
    if (view.call_id !== ctx.callId) continue;
    const role = controlRole(view, ctx.meId);
    const base = {
      sessionId: view.session_id,
      role,
      controllerId: view.controller_id,
      targetId: view.target_id,
    };
    if (view.state === "active") active.push({ ...base, kind: "active", deadlineMs: null });
    else if (view.state === "pending" && role === "controller") {
      waiting.push({ ...base, kind: "waiting", deadlineMs: pendingDeadlineMs(view, ctx.now) });
    }
  }
  active.sort((a, b) => Number(b.role !== "viewer") - Number(a.role !== "viewer"));
  return [...active, ...waiting];
}

export function secondsLeft(deadlineMs: number | null, now: number): number {
  if (deadlineMs === null || !Number.isFinite(deadlineMs)) return 0;
  return Math.max(0, Math.ceil((deadlineMs - now) / 1000));
}

export function bannerText(
  tt: UITranslate,
  line: Pick<BannerLine, "kind" | "role">,
  names: { controller: string; target: string },
): string {
  if (line.kind === "waiting") return tt("等待{target}在桌面客户端同意…", { target: names.target });
  if (line.role === "controller") return tt("你正在控制{target}的电脑", { target: names.target });
  if (line.role === "target") return tt("{controller}正在控制你的电脑", { controller: names.controller });
  return tt("{controller}正在控制{target}的电脑", { controller: names.controller, target: names.target });
}

// ---- 提示语 -------------------------------------------------------------------------------
export type ControlNoticeCode =
  // 控制方
  | "approved"
  | "declined"
  | "declined_share_entire_screen"
  | "declined_unsupported"
  | "declined_timeout"
  | "expired"
  | "request_failed"
  | "request_rate_limited"
  | "request_busy"
  | "request_unavailable"
  | "paste_truncated"
  // 双方
  | "ended"
  | "ended_by_peer"
  | "ended_idle"
  | "ended_max"
  | "ended_device"
  | "ended_call"
  | "ended_left"
  | "ended_connection"
  // 被控方
  | "host_need_whole_screen"
  | "host_unsupported"
  | "host_bridge_error"
  | "host_share_stopped"
  | "host_not_whole_screen"
  | "host_left_call";

/** 结束原因 → 提示语。原因码由 W04 定（A-6 要求其交付列全集）；认不出的给通用句。 */
export function endedNoticeCode(reason: string | null | undefined): ControlNoticeCode {
  const r = String(reason ?? "").toLowerCase();
  if (!r) return "ended";
  if (r.includes("idle")) return "ended_idle";
  if (r.includes("max") || r.includes("duration") || r.includes("limit")) return "ended_max";
  if (r.includes("connection")) return "ended_connection";
  if (r.includes("device")) return "ended_device";
  if (r.includes("call_end") || r === "call" || r.includes("meeting")) return "ended_call";
  if (r.includes("left") || r.includes("leave") || r.includes("removed") || r.includes("kicked") || r.includes("stale")) {
    return "ended_left";
  }
  if (r.includes("stop")) return "ended_by_peer";
  return "ended";
}

export function declinedNoticeCode(reason: string | null | undefined): ControlNoticeCode {
  switch (reason) {
    case "share_entire_screen":
      return "declined_share_entire_screen";
    case "unsupported":
      return "declined_unsupported";
    case "timeout":
      return "declined_timeout";
    default:
      return "declined";
  }
}

/**
 * 会话状态变化 → 给「我」的提示（旁观者不提示，提示条已经够了）。
 * `stoppedByMe`：本端刚点过停止/取消的会话，不再提示「已结束」。
 */
export function noticeForTransition(
  transition: ControlTransition,
  meId: string | null,
  stoppedByMe: boolean,
): ControlNoticeCode | null {
  const next = transition.next;
  const prevState = transition.previous?.state ?? null;
  if (prevState === next.state) return null;
  const role = controlRole(next, meId);
  if (role === "viewer") return null;
  if (role === "controller") {
    switch (next.state) {
      case "active":
        return "approved";
      case "declined":
        return declinedNoticeCode(next.end_reason);
      case "expired":
        return "expired";
      case "cancelled":
        return null;
      case "ended":
        if (stoppedByMe) return null;
        if (prevState === "pending" || prevState === null) {
          return next.end_reason === "timeout" ? "expired" : endedNoticeCode(next.end_reason);
        }
        return endedNoticeCode(next.end_reason);
      default:
        return null;
    }
  }
  // 被控方：只在「进行中 → 结束」时提示；请求阶段由卡片自己处理。
  if (next.state === "ended" && prevState === "active" && !stoppedByMe) return endedNoticeCode(next.end_reason);
  return null;
}

export function noticeTone(code: ControlNoticeCode): "info" | "warn" {
  return code === "approved" || code === "ended" || code === "ended_by_peer" ? "info" : "warn";
}

export function noticeText(tt: UITranslate, code: ControlNoticeCode, vars: Record<string, string> = {}): string {
  switch (code) {
    case "approved":
      return tt("对方已同意：在共享画面上操作即可，连按 3 次 Esc 结束");
    case "declined":
      return tt("对方拒绝了控制请求");
    case "declined_share_entire_screen":
      return tt("对方需要先共享整个屏幕，再同意控制");
    case "declined_unsupported":
      return tt("对方的电脑暂时不能被远程控制");
    case "declined_timeout":
    case "expired":
      return tt("对方没有在 90 秒内同意，请求已失效");
    case "request_failed":
      return tt("发起控制请求失败，请稍后再试");
    case "request_rate_limited":
      return tt("请求太频繁：10 分钟内最多请求 5 次，请稍后再试");
    case "request_busy":
      return tt("对方正被其他人控制，或已有一个待处理的请求");
    case "request_unavailable":
      return tt("对方没有在共享屏幕，或已离开通话");
    case "paste_truncated":
      return tt("粘贴内容过长，只发送了前 2000 字");
    case "ended":
      return tt("远程控制已结束");
    case "ended_by_peer":
      return tt("对方停止了远程控制");
    case "ended_idle":
      return tt("5 分钟没有操作，远程控制已结束");
    case "ended_max":
      return tt("已达到 60 分钟上限，远程控制已结束");
    case "ended_device":
      return tt("被控电脑的桌面客户端已断开，远程控制已结束");
    case "ended_call":
      return tt("通话已结束，远程控制随之结束");
    case "ended_left":
      return tt("有人离开了通话，远程控制已结束");
    case "ended_connection":
      return tt("连接中断，远程控制已结束");
    case "host_need_whole_screen":
      return tt("{controller}请求控制你的电脑，但你共享的不是整个屏幕，已自动拒绝。请改为共享整个屏幕，再请对方重新请求。", {
        controller: vars.controller ?? "",
      });
    case "host_unsupported":
      return tt("这台电脑暂时不能被远程控制，已拒绝这次请求");
    case "host_bridge_error":
      return tt("桌面客户端没有响应，已拒绝这次控制请求");
    case "host_share_stopped":
      return tt("你停止了共享屏幕，远程控制已停止");
    case "host_not_whole_screen":
      return tt("你共享的不再是整个屏幕，远程控制已停止");
    case "host_left_call":
      return tt("你离开了通话，远程控制已停止");
  }
}

/** 请求失败的错误码 → 提示语。 */
export function requestErrorNotice(code: string | null | undefined, status: number | null | undefined): ControlNoticeCode {
  const c = String(code ?? "");
  if (c === "rate_limited" || status === 429) return "request_rate_limited";
  if (status === 409 || c.includes("busy") || c.includes("conflict") || c.includes("already")) return "request_busy";
  if (c.includes("not_participant") || c.includes("not_sharing") || c === "call_unavailable" || status === 404) {
    return "request_unavailable";
  }
  return "request_failed";
}
