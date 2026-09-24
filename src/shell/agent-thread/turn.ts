import type { AgentMessage } from "../../lib/agent";

const NOT_REPLY_KINDS = new Set(["plan", "step", "analysis", "ui_action"]);

export interface LatestTurn {
  /** 用户在这段对话里说到第几句（发送与出字两头都按它配对）。 */
  turn: number;
  /** 本轮第一条有非空正文的回复。 */
  firstText: AgentMessage | null;
  /** 本轮已经有用户看得见的回复（正文，或产物卡片这类非文本回复）。 */
  visible: boolean;
  /** 还没出字时，回复行上后端报告的思考字数。 */
  thinkingChars: number | null;
}

function isReplyRow(message: AgentMessage): boolean {
  return (
    message.role === "assistant" &&
    message.meta?.interim !== true &&
    !NOT_REPLY_KINDS.has(message.kind)
  );
}

function hasText(message: AgentMessage): boolean {
  return Boolean(message.content?.trim());
}

export function userTurnCount(messages: AgentMessage[]): number {
  let count = 0;
  for (const message of messages) if (message.role === "user") count += 1;
  return count;
}

export function latestTurn(messages: AgentMessage[]): LatestTurn {
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  const replies = messages.slice(lastUserIndex + 1).filter(isReplyRow);
  const firstText = replies.find(hasText) ?? null;
  const visible = replies.some(
    (message) => hasText(message) || (Boolean(message.kind) && message.kind !== "text"),
  );
  const raw = visible ? null : replies.at(-1)?.meta?.thinking_chars;
  const thinkingChars =
    typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
  return { turn: userTurnCount(messages), firstText, visible, thinkingChars };
}
