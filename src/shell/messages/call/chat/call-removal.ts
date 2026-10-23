// 会话视图怎么认「我已经不在这个会话里了」（V02 发现 D5；仲裁 A-34 第 4 条）。纯 TS，tests/call-chat-entry.test.mjs 直接跑。
//
// 被移出群的人会先后收到（顺序不定）：
//   - `call_kicked`（只有正在这通里的人收到；移出与解散两种情况的 reason 都是 removed_from_conversation，§3.3）；
//   - `conversation.removed`（reason：kicked 被移出 / left 自己退出 / dissolved 群解散 / hidden 只是不显示）。
// 收到任一条（hidden 除外）→ 会话视图立即置灰：输入框只读、去掉「通话」按钮与卡片上的「加入通话」，再向网关重取一次会话详情
// （网关说不再是成员时由既有的 onUnavailable 关掉这个会话）。

export type RemovalReason = "kicked" | "left" | "dissolved";

export function removalReasonFor(
  event: { type?: unknown; conversation_id?: unknown; reason?: unknown } | null | undefined,
  conversationId: string,
): RemovalReason | null {
  if (!event || !conversationId || event.conversation_id !== conversationId) return null;
  if (event.type === "call_kicked") return "kicked";
  if (event.type === "conversation.removed") {
    if (event.reason === "kicked" || event.reason === "left" || event.reason === "dissolved") return event.reason;
  }
  return null;
}
