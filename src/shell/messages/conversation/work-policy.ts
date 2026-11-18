import type { ImConversationDetail, ImMessage } from "../../../lib/im/types";

export type WorkSendPolicy = NonNullable<ImConversationDetail["send_policy"]>;
export const WORK_REPLY_NOTICE = "对方回复前，最多发送三条不含链接的文字消息，暂不能发送附件或通话。";
export const WORK_LINK_RE = /https?\s*:\s*\/\/|www\s*\.|(?:[\w\-]+\.)+(?:com|org|net|edu|gov|io|ai|app|dev|cn|co|uk|me|info|biz|xyz|shop|store|online|site|tech|tv|de|fr|jp|au|ru|in)\b/i;

export function workSendPolicy(conversation: ImConversationDetail | null, messages: readonly (ImMessage & { status?: string })[], viewerId: string | null): WorkSendPolicy | undefined {
  const policy = conversation?.send_policy;
  if (!policy?.awaiting_reply) return policy;
  const userMessages = messages.filter((m) => m.sender_kind === "user" && m.kind !== "system" && m.seq > 0);
  if (policy.text_only && userMessages.some((m) => m.sender_id !== viewerId)) {
    return { awaiting_reply: false, text_only: false, remaining_messages: null };
  }
  // Include optimistic sends so double clicks don't temporarily offer a fourth slot.
  const sent = messages.filter((m) => m.sender_id === viewerId && m.sender_kind === "user" && m.kind !== "system" && m.status !== "failed").length;
  return { ...policy, remaining_messages: policy.text_only ? Math.max(0, Math.min(policy.remaining_messages ?? 3, 3 - sent)) : null };
}
