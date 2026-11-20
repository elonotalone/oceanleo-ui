"use client";

// 普通会话多选栏里的「开任务」按钮（TU1 的选择栏插槽 `registerMessageSelectionAction`）。
// 任务里（kind === "task"）不出现：那里有 TU1 自己的「拆出子任务」。登记见 `ensureStartTaskSelectionAction`。
import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { ImConversationDetail } from "../../../lib/im/types";
import { registerMessageSelectionAction, type MessageSelectionContext } from "../conversation/selection-actions";
import { StartTaskDialog } from "./StartTaskDialog";
import { openTaskRoom } from "./open-task";

export const START_TASK_ACTION_ID = "tu3.start-task";

/** 哪些会话的多选栏里有「开任务」：私聊 / 群 / Team / 项目群（交易会话和任务里没有）。 */
export function startTaskApplies(conversation: Pick<ImConversationDetail, "kind" | "dissolved"> | null): boolean {
  if (!conversation || conversation.dissolved) return false;
  const kind = conversation.kind as string;
  return kind === "dm" || kind === "group" || kind === "team" || kind === "project";
}

function StartTaskButton({ ctx }: { ctx: MessageSelectionContext }) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const count = ctx.selectedMessages.length;
  return (
    <>
      <button
        type="button"
        disabled={count === 0}
        data-selection-action={START_TASK_ACTION_ID}
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg px-2.5 py-1 text-[13px] text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
      >
        {tt("用选中的消息开任务")}
      </button>
      {open ? (
        <StartTaskDialog
          conversationId={ctx.conversationId}
          conversation={ctx.conversation}
          viewerId={ctx.viewerId}
          messages={ctx.selectedMessages}
          onClose={() => setOpen(false)}
          onStarted={(room) => {
            setOpen(false);
            ctx.exitSelection();
            openTaskRoom(room.id, room.title);
          }}
        />
      ) : null}
    </>
  );
}

let registered = false;

/**
 * 登记「开任务」（幂等）。由 LeoChat 收件箱模块调用：本包 `sideEffects` 只认 CSS，
 * 光写 `import "./StartTaskSelectionAction"` 会被打包器当成无副作用而整条删掉，所以必须调一个真函数。
 */
export function ensureStartTaskSelectionAction(): void {
  if (registered) return;
  registered = true;
  registerMessageSelectionAction({
    id: START_TASK_ACTION_ID,
    order: 10,
    appliesTo: startTaskApplies,
    Component: StartTaskButton,
  });
}
