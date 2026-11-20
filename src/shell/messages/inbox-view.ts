// 收件箱的「全部 / 任务」筛选：同一份已加载的会话里挑出 `kind === "task"` 的行（纯函数，测试直接跑）。
// 网关的 `filter` 白名单里没有 task（老网关会回 422），所以在本地挑；翻页仍走同一个游标。
import type { ImConversationSummary } from "../../lib/im/types";

export type InboxView = "all" | "task";

/** 这一行是不是任务（人的会话）。 */
export function isTaskConversation(item: Pick<ImConversationSummary, "kind">): boolean {
  return (item.kind as string) === "task";
}

export function inboxRowsFor<T extends Pick<ImConversationSummary, "kind">>(items: T[], view: InboxView): T[] {
  return view === "task" ? items.filter(isTaskConversation) : items;
}
