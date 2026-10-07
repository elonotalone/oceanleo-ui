// LeoChat 整页的地址。纯函数：不碰 window，测试可以直接加载。
// `/leochat?tab=inbox|people|bay`；会话 `&im=<会话 id>`；LeoBay 详情 `&bay=<目标>`（写法同 bay-links 的 ?bay=）。

export type LeoChatTab = "inbox" | "people" | "bay";

export const LEOCHAT_TABS: readonly LeoChatTab[] = ["inbox", "people", "bay"];
export const LEOCHAT_PATH = "/leochat";
export const LEOCHAT_TAB_PARAM = "tab";

const CONVERSATION_ID = /^[A-Za-z0-9:_-]{1,120}$/;

export function isLeoChatTab(value: unknown): value is LeoChatTab {
  return typeof value === "string" && (LEOCHAT_TABS as readonly string[]).includes(value);
}

/** 读 `?tab=`；没有或认不出返回 null。 */
export function parseLeoChatTab(search: string): LeoChatTab | null {
  const value = new URLSearchParams(search || "").get(LEOCHAT_TAB_PARAM);
  return isLeoChatTab(value) ? value : null;
}

/** 读 `?im=`（会话 id）；没有或不合法返回 null。 */
export function parseLeoChatConversation(search: string): string | null {
  const value = new URLSearchParams(search || "").get("im");
  return value && CONVERSATION_ID.test(value) ? value : null;
}

/** 这个路径是不是 LeoChat 整页（`/leochat` 或 `/bay`，带不带 basePath 都认）。整页上不弹小窗。 */
export function isLeoChatPagePath(pathname: string): boolean {
  const path = (pathname || "").replace(/\/+$/, "");
  return path.endsWith(LEOCHAT_PATH) || path.endsWith("/bay");
}

/** 整页地址。`bay` 传 `formatBayParam(target)` 的结果（如 `demand:abc`）；会话只在聊天栏带。 */
export function leoChatPageHref(input: { tab: LeoChatTab; conversationId?: string | null; bay?: string | null }): string {
  const params = new URLSearchParams();
  params.set(LEOCHAT_TAB_PARAM, input.tab);
  if (input.tab === "inbox" && input.conversationId && CONVERSATION_ID.test(input.conversationId)) {
    params.set("im", input.conversationId);
  }
  if (input.tab === "bay" && input.bay) params.set("bay", input.bay);
  return `${LEOCHAT_PATH}?${params.toString()}`;
}
