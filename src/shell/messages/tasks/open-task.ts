// 从 LeoChat / 我的任务打开一个任务（人的会话）。规则见 host-state.ts `conversationOpenAction`：
//   - 右侧栏：`openTaskChild`（合同 §2.3 的同一个可取消事件 `oceanleo:open-task-child`，定义只在 task-room/open-child.ts）；
//     侧栏任务栈没接（没人 preventDefault）就退回任务页；
//   - 小窗 / 整页：站内跳到门户的 `/tasks/{id}`（与通知里站内链接同一个导航入口），小窗先收起。
import { portalHref } from "../../../contracts/domain-family";
import { closeMessages, conversationOpenAction, hostState, type ConversationOpenAction, type MessagesSurface } from "../host-state";
import { openTaskChild } from "../../task-room/open-child";

export interface TaskOpenEffects {
  /** 返回侧栏是否接住了（监听方调了 preventDefault）。 */
  openChild(detail: { kind: "room"; id: string; title: string }): boolean;
  navigate(href: string): void;
  closeWindow(): void;
  showConversation(conversationId: string, seq?: number | null): void;
}

function browserTaskOpenEffects(): TaskOpenEffects {
  return {
    openChild: (detail) => openTaskChild(detail),
    navigate(href) {
      const target = portalHref(href);
      if (!target.startsWith("/")) {
        if (typeof window !== "undefined") window.location.assign(target);
        return;
      }
      // 站内跳转用 MessagesHost 交进来的同一个 router.push（通知里的站内链接也走它）；按需加载，
      // 免得只为打开一个任务把通知 / LeoBay 那一串模块拖进收件箱和「我的任务」。
      void import("../notices/open-notice").then(
        ({ browserNoticeActions }) => browserNoticeActions().navigate(target),
        () => { if (typeof window !== "undefined") window.location.assign(target); },
      );
    },
    closeWindow: () => closeMessages(),
    showConversation: (conversationId, seq) => hostState().showConversation(conversationId, seq ?? null),
  };
}

/** 执行一个打开动作；返回动作本身（测试用）。 */
export function runConversationOpen(
  action: ConversationOpenAction,
  seq: number | null | undefined,
  effects: TaskOpenEffects = browserTaskOpenEffects(),
): ConversationOpenAction {
  switch (action.kind) {
    case "conversation":
      effects.showConversation(action.conversationId, seq);
      break;
    case "task-panel":
      if (!effects.openChild(action.detail)) effects.navigate(`/tasks/${encodeURIComponent(action.detail.id)}`);
      break;
    case "task-page":
      if (action.closeWindow) effects.closeWindow();
      effects.navigate(action.path);
      break;
  }
  return action;
}

/** 打开一个任务（已知是任务）。`surface` 缺省读 LeoChat 当前在哪一处显示。 */
export function openTaskRoom(id: string, title = "", surface: MessagesSurface = hostState().getSnapshot().surface): void {
  runConversationOpen(conversationOpenAction({ id, kind: "task", title }, surface), null);
}

/**
 * A sub task or task nobody beside took (no right panel listening): its own page `/tasks/{id}` (the page shows a
 * task, or a sub task beside its parent task), through the same in-app navigation; the LeoChat window closes first.
 */
export function openTaskPage(
  id: string,
  surface: MessagesSurface = hostState().getSnapshot().surface,
  effects: TaskOpenEffects = browserTaskOpenEffects(),
): void {
  if (surface === "window") effects.closeWindow();
  effects.navigate(`/tasks/${encodeURIComponent(id)}`);
}
