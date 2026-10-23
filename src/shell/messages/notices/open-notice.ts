// 点一条平台通知：标为已读，并按链接落点执行。执行层的依赖都可注入（tests/lbp-w08-notices.test.mjs 用假依赖跑真实现）。
//
// 落点的分类见 notice-links.ts（只看链接，不看域名家族）。这里决定「在本站做不做」：
//   - LeoChat 里的（会话、内容处置、栏目）：直接在 LeoChat 里切；
//   - LeoBay：本站有 LeoBay 就 `openBay`（走现有 Bay 深链），没有就只标已读、不跳——不替用户去另一个家族的站；
//   - 其余站内页：站内跳转（同一标签页）；别的站：新窗口，noopener。
// 离开 LeoChat（去 LeoBay 或别的站内页）前先收起小窗，免得盖在目标页上。
import type { NotificationItem } from "../../../api/notifications";
import { bayEnabledHere, openBay } from "../../bay/shell/bay-state";
import type { BayTarget } from "../../bay/shell/bay-state";
import { closeMessages, hostState } from "../host-state";
import { classifyNoticeLink, noticeIsActionable, type NoticeTarget } from "./notice-links";
import { noticeStore } from "./use-notices";

export interface NoticeActions {
  openConversation(conversationId: string, seq?: number): void;
  openCases(caseId?: string): void;
  openView(view: "inbox" | "people" | "notices"): void;
  openBay(target: BayTarget): void;
  /** 站内跳转（同一个标签页，不整页刷新）。 */
  navigate(href: string): void;
  openExternal(href: string): void;
  /** 收起 LeoChat 小窗（整页 / 右侧栏不归它管）。 */
  closeWindow(): void;
  /** 本站有 LeoBay 吗（境内没有交易市场）。 */
  bayAvailable(): boolean;
}

/** 执行一个落点；返回是否真的去了某处（没有链接、本站没有 LeoBay 时为 false）。 */
export function runNoticeTarget(target: NoticeTarget, actions: NoticeActions): boolean {
  switch (target.kind) {
    case "none":
      return false;
    case "conversation":
      actions.openConversation(target.conversationId, target.seq);
      return true;
    case "cases":
      actions.openCases(target.caseId);
      return true;
    case "view":
      actions.openView(target.view);
      return true;
    case "bay":
      if (!actions.bayAvailable()) return false;
      actions.closeWindow();
      actions.openBay(target.target);
      return true;
    case "internal":
      actions.closeWindow();
      actions.navigate(target.href);
      return true;
    case "external":
      actions.openExternal(target.href);
      return true;
  }
}

let navigator: ((href: string) => void) | null = null;

/** 外壳把站内跳转（next/navigation 的 router.push）交进来；没交时退回整页跳转。MessagesHost 在每个站挂一次。 */
export function setNoticeNavigator(navigate: ((href: string) => void) | null): void {
  navigator = navigate;
}

export function browserNoticeActions(): NoticeActions {
  return {
    openConversation: (conversationId, seq) =>
      hostState().open(typeof seq === "number" ? { conversationId, seq } : { conversationId }),
    openCases: (caseId) => hostState().open(caseId ? { view: "cases", caseId } : { view: "cases" }),
    openView: (view) => hostState().open({ view }),
    openBay: (target) => openBay(target),
    navigate(href) {
      if (navigator) {
        navigator(href);
        return;
      }
      if (typeof window !== "undefined") window.location.assign(href);
    },
    openExternal(href) {
      if (typeof window !== "undefined") window.open(href, "_blank", "noopener,noreferrer");
    },
    closeWindow: () => closeMessages(),
    bayAvailable: () => bayEnabledHere(),
  };
}

function currentPageHost(): string | null {
  return typeof window !== "undefined" && window.location ? window.location.host : null;
}

/** 这条通知点开后的落点（行尾要不要画箭头也问它）。 */
export function noticeTargetOf(item: Pick<NotificationItem, "kind" | "link" | "meta">): NoticeTarget {
  return classifyNoticeLink(item, { pageHost: currentPageHost() });
}

/** 点开这条通知除了标已读还会去某处吗（行尾要不要画箭头）。 */
export function noticeActionable(item: Pick<NotificationItem, "kind" | "link" | "meta">): boolean {
  return noticeIsActionable(noticeTargetOf(item), bayEnabledHere());
}

/** 点一条通知：未读的先标已读（乐观，不等网络），再去落点。 */
export function openNotice(
  item: NotificationItem,
  actions: NoticeActions = browserNoticeActions(),
  store: Pick<ReturnType<typeof noticeStore>, "markRead"> = noticeStore(),
): NoticeTarget {
  const target = noticeTargetOf(item);
  if (!item.read_at) void store.markRead([item.id]);
  runNoticeTarget(target, actions);
  return target;
}
