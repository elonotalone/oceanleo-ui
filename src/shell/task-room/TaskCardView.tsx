"use client";

// A card in a task's conversation for one of its children (task rooms wave 2026-11-20):
// title, owner, program, live status, and whether I can open it. Live status comes from the
// shared room read (`useTaskRoom`), which `task.card.updated` and window focus keep fresh.
import type { ImMessage } from "../../lib/im/types";
import type { TaskRoomChild } from "../../lib/task-rooms-api";
import { useUI } from "../../i18n/ui/useUI";
import { useTaskChildOpener } from "./card-context";
import { openTaskChild, type OpenTaskChildDetail } from "./open-child";
import { canOpenChild, programName, taskCardStatus, type TaskCardStatus } from "./room-model";
import { useTaskRoom } from "./useTaskRoom";
import { openTaskPage } from "../messages/tasks/open-task";

export interface TaskCardViewProps {
  /** `message.card = { type: "task", child_kind, child_id, title }`. */
  message: ImMessage;
  conversationId: string;
  /** Default: the host's opener (RoomView), else the right panel, else a page. */
  onOpen?: (detail: OpenTaskChildDetail) => void;
}

const STATUS_DOT: Record<TaskCardStatus, string> = {
  working: "bg-sky-500",
  waiting: "bg-amber-500",
  done: "bg-emerald-500",
  failed: "bg-rose-500",
};

/**
 * Open a child where the page can: a listening right panel, otherwise its own page `/tasks/{id}` (a task there is
 * the full task page, the same place a task row in LeoChat opens; a sub task opens beside its parent task).
 */
export function openTaskChildAnywhere(detail: OpenTaskChildDetail): void {
  if (openTaskChild(detail)) return;
  openTaskPage(detail.id);
}

export function TaskCardView({ message, conversationId, onOpen }: TaskCardViewProps) {
  const tt = useUI();
  const hostOpen = useTaskChildOpener();
  const { room } = useTaskRoom(conversationId);
  const card = message.card;
  const kind = card?.child_kind === "room" ? "room" : "agent_task";
  const childId = card?.child_id ?? "";
  const child: TaskRoomChild | undefined = room?.children.find((item) => item.kind === kind && item.id === childId);
  const title = child?.title || card?.title || tt("未命名任务");
  const status = taskCardStatus(child?.status);
  const blocked = child ? !canOpenChild(child.my_access) : false;
  const statusLabel: Record<TaskCardStatus, string> = {
    working: tt("正在工作"),
    waiting: tt("等待回答"),
    done: tt("已完成"),
    failed: tt("失败了"),
  };
  const open = () => {
    if (!childId || blocked) return;
    const detail: OpenTaskChildDetail = { kind, id: childId, title };
    (onOpen ?? hostOpen ?? openTaskChildAnywhere)(detail);
  };
  const program = programName(child?.program);
  const meta = [kind === "room" ? tt("任务") : tt("子任务"), child?.owner.name, program].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={open}
      disabled={!childId}
      aria-disabled={blocked || undefined}
      data-task-card={kind}
      data-task-card-status={status ?? undefined}
      className={
        "flex w-[280px] max-w-full flex-col gap-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left " +
        "dark:border-neutral-700 dark:bg-neutral-900 " +
        (blocked ? "cursor-default" : "hover:border-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800")
      }
    >
      <span className="truncate text-[13px] font-medium text-neutral-900 dark:text-neutral-100" title={title}>{title}</span>
      {meta ? <span className="truncate text-[12px] text-neutral-500">{meta}</span> : null}
      {status ? (
        <span className="flex items-center gap-1.5 text-[12px] text-neutral-600 dark:text-neutral-300" data-task-card-state="">
          <span aria-hidden="true" className={"h-1.5 w-1.5 rounded-full " + STATUS_DOT[status]} />
          {statusLabel[status]}
        </span>
      ) : null}
      {blocked ? (
        <span className="text-[12px] text-neutral-500" data-task-card-no-access="">{tt("只有所有者允许的人才能打开")}</span>
      ) : null}
    </button>
  );
}
