"use client";

// Shell 对话框里 OceanLeo agent 程序的 REST（合同 I6，后端 W6B：
// oceanleo/backend/app/routers/cloud_computer_agent_router.py）。
//   GET  /v1/computers/{id}/agent/state  → 当前任务指针 + 电脑名/在线
//   POST /v1/computers/{id}/agent/turn   → 无任务则建、有则追问（挂这台电脑）
//   POST /v1/computers/{id}/agent/reset  → 新对话（丢掉任务指针）
// 回合由网关创建；拿到 task_id 后用 lib/agent.getTask 轮询消息流。
// 鉴权与错误形状与 agent.ts 的 authed() 同一套；无 token 时 authed 直接
// 返回 {ok:false, status:401}，不发 fetch（node 测试环境因此不需要 stub fetch）。

import { authed } from "./agent";

export type ComputerAgentState = {
  task_id: string | null;
  computer: { name: string; online: boolean };
  task: { id: string; title: string; status: string } | null;
};

// 后端 TurnBody text max_length=8000（cloud_computer_agent_router.py）。控制器按这个数
// 拒绝超长输入（invalid_argument 提示），这里的 slice 只是第二道防线，不做静默截断的借口。
export const MAX_AGENT_TURN_CHARS = 8000;

function agentPath(computerId: string, suffix: string): string {
  return `/v1/computers/${encodeURIComponent(computerId)}/agent${suffix}`;
}

export function agentState(computerId: string) {
  return authed<ComputerAgentState>(agentPath(computerId, "/state"));
}

export function agentTurn(
  computerId: string,
  body: { text: string; shell_session_id?: string },
) {
  const payload: { text: string; shell_session_id?: string } = {
    text: body.text.slice(0, MAX_AGENT_TURN_CHARS),
  };
  if (body.shell_session_id) payload.shell_session_id = body.shell_session_id;
  return authed<{ task_id: string; message_id: number | string }>(agentPath(computerId, "/turn"), {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function agentReset(computerId: string) {
  return authed<{ ok: boolean }>(agentPath(computerId, "/reset"), { method: "POST" });
}
