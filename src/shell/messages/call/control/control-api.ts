// 远程控制用户端接口（合同 §3.8 + 仲裁 A-6）。用户会话只能发起、取消、拒绝、停止、查询；
// 批准只能走设备端（INV-2），网页这里没有、也不许有 approve。错误抛 ImApiError（沿用 IM 客户端）。
import { imFetch } from "../../../../lib/im/client";
import type { ControlView } from "../../../../lib/im/call-types";
import { controlRequestsPath, controlSessionPath } from "./protocol";

/** 仲裁 A-6：拒绝时可带的原因（白名单外的服务端按 `user` 记）。 */
export type ControlDeclineReason = "user" | "share_entire_screen" | "unsupported" | "timeout";

export const CONTROL_DECLINE_REASONS: readonly ControlDeclineReason[] = [
  "user",
  "share_entire_screen",
  "unsupported",
  "timeout",
];

export interface ControlSessionResponse {
  session: ControlView;
}

export const controlApi = {
  /** 控制方：请求控制某位在场参与者的电脑。 */
  request(callId: string, targetUserId: string): Promise<ControlSessionResponse> {
    return imFetch<ControlSessionResponse>(controlRequestsPath(callId), {
      method: "POST",
      json: { target_user_id: targetUserId },
    });
  },
  /** 控制方：撤回待批准的请求。 */
  cancel(sessionId: string): Promise<ControlSessionResponse> {
    return imFetch<ControlSessionResponse>(`${controlSessionPath(sessionId)}/cancel`, { method: "POST" });
  },
  /** 被控方：拒绝（用户会话可以拒绝，不能批准）。 */
  decline(sessionId: string, reason: ControlDeclineReason = "user"): Promise<ControlSessionResponse> {
    const safe: ControlDeclineReason = CONTROL_DECLINE_REASONS.includes(reason) ? reason : "user";
    return imFetch<ControlSessionResponse>(`${controlSessionPath(sessionId)}/decline`, {
      method: "POST",
      json: { reason: safe },
    });
  },
  /** 任一方：停止进行中的控制。 */
  stop(sessionId: string): Promise<ControlSessionResponse> {
    return imFetch<ControlSessionResponse>(`${controlSessionPath(sessionId)}/stop`, { method: "POST" });
  },
  /** 两方：查询会话。 */
  get(sessionId: string): Promise<ControlSessionResponse> {
    return imFetch<ControlSessionResponse>(controlSessionPath(sessionId));
  },
};

export type ControlApi = typeof controlApi;
