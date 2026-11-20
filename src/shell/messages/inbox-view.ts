// 哪些会话属于 LeoChat 收件箱（纯函数，测试直接跑）。
// 项目里的会话（session，`kind === "project"`）只在项目页里；旧的任务会话（`kind === "task"`）已经取消。
// 服务端的列表、未读、搜索都不再给这两种（合同 §2.1），这里再挡一次，旧服务端或实时推送漏进来也不显示。
import type { ImConversationSummary } from "../../lib/im/types";

const NOT_IN_LEOCHAT: ReadonlySet<string> = new Set(["project", "task"]);

/** 这一行能不能出现在 LeoChat 的列表里。 */
export function isInboxConversation(item: Pick<ImConversationSummary, "kind">): boolean {
  return !NOT_IN_LEOCHAT.has(String(item.kind ?? ""));
}
