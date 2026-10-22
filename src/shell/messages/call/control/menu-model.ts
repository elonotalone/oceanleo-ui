// 参与者菜单里「请求控制电脑」那一项的纯模型（tests/call-control-banner.test.mjs 一并测）。
import type { ControlView } from "../../../../lib/im/call-types";
import { isLiveControlState, pendingDeadlineMs } from "./control-store";

export interface MenuParticipantLite {
  participantId: string;
  userId: string;
  isMe: boolean;
  screen: boolean;
}

export type ControlMenuModel =
  | { kind: "hidden" }
  | { kind: "request"; callId: string; targetUserId: string }
  | { kind: "waiting"; sessionId: string; deadlineMs: number }
  | { kind: "controlling"; sessionId: string }
  | { kind: "busy" };

/**
 * 只有对方「正在共享屏幕」时才出现「请求控制电脑」（是不是整屏要等对方桌面端判断，见 host-logic）。
 * 我已经在控制/在等他 → 显示「停止控制」/「取消请求」；别人正在控制他 → 置灰。
 */
export function controlMenuModel(input: {
  phase: string;
  callId: string | null;
  screenSharerId: string | null;
  participants: readonly MenuParticipantLite[];
  sessions: readonly ControlView[];
  meId: string | null;
  participantId: string;
  now: number;
}): ControlMenuModel {
  const inCall = input.phase === "connected" || input.phase === "reconnecting";
  if (!inCall || !input.callId || !input.meId) return { kind: "hidden" };
  const target = input.participants.find((p) => p.participantId === input.participantId);
  if (!target || target.isMe || target.userId === input.meId) return { kind: "hidden" };
  const live = input.sessions.filter(
    (s) => s.call_id === input.callId && s.target_id === target.userId && isLiveControlState(s.state),
  );
  const mine = live.find((s) => s.controller_id === input.meId);
  if (mine?.state === "active") return { kind: "controlling", sessionId: mine.session_id };
  if (mine?.state === "pending") {
    return { kind: "waiting", sessionId: mine.session_id, deadlineMs: pendingDeadlineMs(mine, input.now) };
  }
  const sharing =
    target.screen || input.screenSharerId === target.participantId || input.screenSharerId === target.userId;
  if (!sharing) return { kind: "hidden" };
  if (live.length > 0) return { kind: "busy" };
  return { kind: "request", callId: input.callId, targetUserId: target.userId };
}
