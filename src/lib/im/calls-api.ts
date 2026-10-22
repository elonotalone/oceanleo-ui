// LeoChat 通话 v2 的网关接口（合同 §3.2）：前缀 `/v1/im`，用户会话鉴权，错误抛 ImApiError。
// 入频道凭证只从这里来（服务端校验会话成员资格后才签发）。每个方法原样返回该端点的 JSON 体。
import { imFetch } from "./client";
import type {
  CallMedia,
  CallStatusResponse,
  JoinResponse,
  LeaveResponse,
  OkResponse,
  TokenResponse,
} from "./call-types";

export const conversationCallPath = (conversationId: string): string =>
  `/v1/im/conversations/${encodeURIComponent(conversationId)}/call`;

export const callPath = (callId: string): string => `/v1/im/calls/${encodeURIComponent(callId)}`;

export const CALL_TEST_TOKEN_PATH = "/v1/im/calls/test-token";

/** 心跳载荷只带三个布尔值（多余字段不上报）。 */
export function heartbeatBody(media: CallMedia): { media: CallMedia } {
  return { media: { mic: Boolean(media?.mic), camera: Boolean(media?.camera), screen: Boolean(media?.screen) } };
}

export const callsApi = {
  /** 会话当前通话（没有则 `call: null`）、ARTC 是否开通、上限。 */
  status(conversationId: string): Promise<CallStatusResponse> {
    return imFetch<CallStatusResponse>(conversationCallPath(conversationId));
  },
  /** 有进行中的就加入，没有就新建并加入（私聊新建时向对方响铃）。 */
  startOrJoin(conversationId: string): Promise<JoinResponse> {
    return imFetch<JoinResponse>(conversationCallPath(conversationId), { method: "POST" });
  },
  join(callId: string): Promise<JoinResponse> {
    return imFetch<JoinResponse>(`${callPath(callId)}/join`, { method: "POST" });
  },
  leave(callId: string): Promise<LeaveResponse> {
    return imFetch<LeaveResponse>(`${callPath(callId)}/leave`, { method: "POST" });
  },
  /** 同一 participant 续期入频道凭证（`authInfoWillExpire` 时调）。 */
  refreshToken(callId: string): Promise<TokenResponse> {
    return imFetch<TokenResponse>(`${callPath(callId)}/token`, { method: "POST" });
  },
  heartbeat(callId: string, media: CallMedia): Promise<OkResponse> {
    return imFetch<OkResponse>(`${callPath(callId)}/heartbeat`, { method: "POST", json: heartbeatBody(media) });
  },
  /** 私聊被叫拒接。 */
  decline(callId: string): Promise<OkResponse> {
    return imFetch<OkResponse>(`${callPath(callId)}/decline`, { method: "POST" });
  },
  /** 一次性诊断频道凭证（`diag-` 前缀，120 秒有效，不记通话）。 */
  testToken(): Promise<TokenResponse> {
    return imFetch<TokenResponse>(CALL_TEST_TOKEN_PATH, { method: "POST" });
  },
};

export type CallsApi = typeof callsApi;
