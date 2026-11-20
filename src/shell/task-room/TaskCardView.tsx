"use client";

// A task card in a project session (session / sites wave 2026-11-21, contract §1 / §2.2): the task's title and a
// live program / status line. The card grants nothing: a reader without access to the task (`GET /v1/tasks/{id}/access`
// denied) sees the title and "No access", and the card does not open. Click → the task in the right panel.
// The card draws its own single frame; the conversation renders it without a bubble.
import type { ImMessage } from "../../lib/im/types";
import { useUI } from "../../i18n/ui/useUI";
import { openTaskPanel } from "../forward";
import { programName, taskCardOf, taskCardStatus, type TaskCardStatus } from "./card-model";
import { useTaskCard } from "./useTaskCard";

export interface TaskCardViewProps {
  /** `message.card = { type: "task", child_kind: "agent_task", child_id, title }`. */
  message: ImMessage;
  conversationId: string;
  /** Default: the right panel (`openTaskPanel({taskId, title})`). */
  onOpenTask?: (taskId: string, title: string) => void;
}

const STATUS_DOT: Record<TaskCardStatus, string> = {
  working: "bg-sky-500",
  waiting: "bg-amber-500",
  idle: "bg-emerald-500",
};

const FRAME =
  "flex w-[280px] max-w-full flex-col gap-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-left " +
  "dark:border-stone-700 dark:bg-stone-900";

export function TaskCardView({ message, onOpenTask }: TaskCardViewProps) {
  const tt = useUI();
  const card = taskCardOf(message);
  const { access, activity } = useTaskCard(card?.taskId ?? null);
  if (!card) return null;
  const title = card.title || tt("未命名任务");
  if (access === "denied") {
    return (
      <div className={FRAME} aria-disabled="true" data-task-card="" data-task-card-access="denied">
        <span className="truncate text-[13px] font-medium text-stone-900 dark:text-stone-100" title={title}>{title}</span>
        <span className="text-[12px] text-stone-500" data-task-card-no-access="">{tt("没有访问权限")}</span>
      </div>
    );
  }
  const status = taskCardStatus(activity);
  const statusLabel: Record<TaskCardStatus, string> = {
    working: tt("正在工作"),
    waiting: tt("等待回答"),
    idle: tt("已完成"),
  };
  const program = programName(activity?.program);
  const open = () => (onOpenTask ?? ((taskId: string, name: string) => openTaskPanel({ taskId, title: name })))(card.taskId, title);
  return (
    <button
      type="button"
      onClick={open}
      data-task-card=""
      data-task-card-access={access}
      data-task-card-status={status ?? undefined}
      className={`${FRAME} hover:border-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800`}
    >
      <span className="truncate text-[13px] font-medium text-stone-900 dark:text-stone-100" title={title}>{title}</span>
      {program || status ? (
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-stone-500" data-task-card-line="">
          {status ? <span aria-hidden="true" className={"h-1.5 w-1.5 shrink-0 rounded-full " + STATUS_DOT[status]} /> : null}
          <span className="truncate">{[program, status ? statusLabel[status] : ""].filter(Boolean).join(" · ")}</span>
        </span>
      ) : null}
    </button>
  );
}
