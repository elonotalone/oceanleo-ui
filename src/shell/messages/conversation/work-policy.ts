import type { ImConversationDetail, ImMessage } from "../../../lib/im/types";

export type WorkSendPolicy = NonNullable<ImConversationDetail["send_policy"]>;
export const WORK_REPLY_NOTICE = "对方回复前，最多发送三条不含链接的文字消息，暂不能发送附件或通话。";
// Same pattern string as the gateway (app/im/conversations.py WORK_LINK_PATTERN) and
// migration 0574; shared cases in tests/fixtures/work-link-cases.json. Schemes, www,
// IPv4 with or without port, and "label.tld" for common and shortener TLDs where the
// dot may be spaced, fullwidth, "dot"/"(dot)"/"点". "3.5", "e.g.", "v1.2" and
// ordinary sentences pass. Only constructs that mean the same in JS, Python and Postgres.
const WORK_DOT = "[.。．｡]";
const WORK_SEP = "(?:" + WORK_DOT + "|\\s+" + WORK_DOT + "\\s*|\\s*(?:\\(\\s*dot\\s*\\)|\\[\\s*dot\\s*\\])\\s*|\\s+dot\\s+|\\s*点\\s*)";
const WORK_TLDS =
  "com|net|org|edu|gov|mil|int|info|biz|pro|mobi|asia|io|ai|app|dev|co|me|to|tv|fm|cc|gg|ly|gl|gd|in|be|" +
  "xyz|top|vip|club|online|site|website|store|shop|tech|link|click|icu|cyou|buzz|cloud|blog|wiki|ink|" +
  "cn|hk|tw|mo|jp|kr|sg|uk|de|fr|ru|nl|eu|ca|au|nz|br|es|ch|se|pl|vn|th|tk|ws";
export const WORK_LINK_PATTERN =
  "(?:https?|ftp)\\s*:\\s*//|www\\s*" + WORK_DOT +
  "|(?<![a-z0-9.])\\d{1,3}(?:" + WORK_SEP + "\\d{1,3}){3}(?![0-9])" +
  "|[a-z0-9-]+" + WORK_SEP + "(?:" + WORK_TLDS + ")(?![a-z0-9])";
export const WORK_LINK_RE = new RegExp(WORK_LINK_PATTERN, "i");

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
