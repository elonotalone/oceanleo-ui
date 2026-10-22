// 远程控制网页端（W09，合同 §3.8 / §3.9 / §3.10）。首个提交：导出名与 props 定型，组件先 return null。
import { imFetch } from "../../../../lib/im/client";

export type ControlState = "pending" | "active" | "ended" | "declined" | "expired" | "cancelled";

/** 合同 §3.8 ControlView（W05 的 call-types.ts 落地后与之结构一致）。 */
export interface ControlSessionView {
  session_id: string;
  call_id: string;
  controller_id: string;
  target_id: string;
  state: ControlState;
  created_at: string;
  expires_at: string;
  approved_at: string | null;
  ended_at: string | null;
  end_reason: string | null;
}

const enc = encodeURIComponent;

export const controlApi = {
  request(callId: string, targetUserId: string): Promise<{ session: ControlSessionView }> {
    return imFetch(`/v1/im/calls/${enc(callId)}/control/requests`, { method: "POST", json: { target_user_id: targetUserId } });
  },
  cancel(sessionId: string): Promise<{ session: ControlSessionView }> {
    return imFetch(`/v1/im/calls/control/${enc(sessionId)}/cancel`, { method: "POST" });
  },
  decline(sessionId: string): Promise<{ session: ControlSessionView }> {
    return imFetch(`/v1/im/calls/control/${enc(sessionId)}/decline`, { method: "POST" });
  },
  stop(sessionId: string): Promise<{ session: ControlSessionView }> {
    return imFetch(`/v1/im/calls/control/${enc(sessionId)}/stop`, { method: "POST" });
  },
  get(sessionId: string): Promise<{ session: ControlSessionView }> {
    return imFetch(`/v1/im/calls/control/${enc(sessionId)}`);
  },
};

export interface CallControlLayerProps {
  participantId: string;
  videoEl: HTMLVideoElement | null;
}

export interface ControlRequestMenuItemProps {
  participantId: string;
}

/** 盖在共享屏幕格上的输入捕获层（桩）。 */
export function CallControlLayer(_props: CallControlLayerProps): null {
  return null;
}

/** 参与者菜单里的「请求控制电脑」（桩）。 */
export function ControlRequestMenuItem(_props: ControlRequestMenuItemProps): null {
  return null;
}

/** 「张三正在控制李四的电脑」提示条（桩）。 */
export function CallControlBanner(): null {
  return null;
}

/** 全局挂载，处理被控方请求（桩）。 */
export function CallControlHost(): null {
  return null;
}
