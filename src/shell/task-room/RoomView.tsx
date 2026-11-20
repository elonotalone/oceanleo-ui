"use client";

// A task's page for people (task rooms wave 2026-11-20, book TU1 item 2): the people conversation
// (the same ConversationView LeoChat uses), a breadcrumb of where this task sits, the members,
// a strip of its children (agent work and tasks) with live status, and calling an agent.
// Works as a page (`surface="page"`) and inside the right panel (`surface="panel"`, with Back).
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { ImConversationDetail } from "../../lib/im/types";
import { getConversationDetail } from "../../lib/im/groups-api";
import { taskRoomsApi, type SummonTarget, type TaskHandoff, type TaskRoom, type TaskRoomChild } from "../../lib/task-rooms-api";
import { Breadcrumb } from "../../ui/Breadcrumb";
import { ConversationView, useViewerId } from "../messages/conversation/ConversationView";
import type { MessageSelectionAction, MessageSelectionContext } from "../messages/conversation/selection-actions";
import { ConversationInfoPanel } from "../messages/groups/ConversationInfoPanel";
import { Avatar } from "../messages/conversation/MessageItem";
import { useImEvent, useImResync } from "../messages/realtime/hooks";
import { openMessages } from "../messages/host-state";
import { TaskChildOpenContext } from "./card-context";
import type { ComposerExtraMention, ComposerExtras } from "./composer-extras";
import type { OpenTaskChildDetail } from "./open-child";
import { handoffTitles, sendableSubTasks, subTaskLabel, taskCardStatus, type TaskCardStatus } from "./room-model";
import { SpinOffDialog } from "./SpinOffDialog";
import { SummonDialog, newSummonDraft, type SummonDraft } from "./SummonDialog";
import { openTaskChildAnywhere } from "./TaskCardView";
import { readTaskRoom, useTaskRoom } from "./useTaskRoom";

export interface RoomViewProps {
  /** The task's id = its conversation id. */
  roomId: string;
  surface: "page" | "panel";
  /** Card / children strip / breadcrumb click. Default: the right panel, else a page. */
  onOpenChild?: (child: OpenTaskChildDetail) => void;
  /** Panel: the Back arrow. */
  onBack?: () => void;
  className?: string;
}

interface RoomActions {
  room: TaskRoom | null;
  canSummon: boolean;
  summonBlockedReason: string;
  openSummon: (target: SummonTarget, messageIds: string[] | null) => void;
  openSpinOff: (messageIds: string[], done: () => void) => void;
  selectDefault: (ctx: MessageSelectionContext) => void;
}

const RoomActionsContext = createContext<RoomActions | null>(null);

const BAR_BUTTON = "whitespace-nowrap disabled:opacity-40";

function SelectAllAction({ ctx }: { ctx: MessageSelectionContext }) {
  const tt = useUI();
  const actions = useContext(RoomActionsContext);
  if (!actions?.room) return null;
  return <button type="button" className={BAR_BUTTON} onClick={() => actions.selectDefault(ctx)} data-task-select-all="">{tt("全选")}</button>;
}

function AskAgentAction({ ctx }: { ctx: MessageSelectionContext }) {
  const tt = useUI();
  const actions = useContext(RoomActionsContext);
  if (!actions?.room) return null;
  return (
    <button
      type="button"
      className={BAR_BUTTON}
      disabled={!actions.canSummon || !ctx.selectedMessageIds.size}
      title={actions.canSummon ? undefined : actions.summonBlockedReason}
      onClick={() => {
        actions.openSummon("keep", [...ctx.selectedMessageIds]);
        ctx.exitSelection();
      }}
      data-task-ask-agent-selected=""
    >
      {tt("交给智能体")}
    </button>
  );
}

function SpinOffAction({ ctx }: { ctx: MessageSelectionContext }) {
  const tt = useUI();
  const actions = useContext(RoomActionsContext);
  if (!actions?.room) return null;
  return (
    <button
      type="button"
      className={BAR_BUTTON}
      disabled={!ctx.selectedMessageIds.size}
      onClick={() => actions.openSpinOff(ctx.selectedMessages.map((message) => message.id), ctx.exitSelection)}
      data-task-spin-off=""
    >
      {tt("新建任务")}
    </button>
  );
}

const ROOM_SELECTION_ACTIONS: MessageSelectionAction[] = [
  { id: "task-room.select-all", order: -30, Component: SelectAllAction },
  { id: "task-room.ask-agent", order: -20, Component: AskAgentAction },
  { id: "task-room.spin-off", order: -10, Component: SpinOffAction },
];

const STATUS_DOT: Record<TaskCardStatus, string> = {
  working: "bg-sky-500",
  waiting: "bg-amber-500",
  done: "bg-emerald-500",
  failed: "bg-rose-500",
};

function ChildrenStrip({ children, onOpen }: { children: TaskRoomChild[]; onOpen: (child: TaskRoomChild) => void }) {
  const tt = useUI();
  const agents = children.filter((child) => child.kind === "agent_task");
  const rooms = children.filter((child) => child.kind === "room");
  if (!children.length) return null;
  const statusLabel: Record<TaskCardStatus, string> = {
    working: tt("正在工作"),
    waiting: tt("等待回答"),
    done: tt("已完成"),
    failed: tt("失败了"),
  };
  const chip = (child: TaskRoomChild) => {
    const status = taskCardStatus(child.status);
    const locked = child.my_access === "none";
    return (
      <button
        key={`${child.kind}:${child.id}`}
        type="button"
        onClick={() => onOpen(child)}
        disabled={locked}
        title={locked ? tt("只有所有者允许的人才能打开") : status ? statusLabel[status] : undefined}
        className="flex max-w-[220px] shrink-0 items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        data-task-child={child.kind}
      >
        {status ? <span aria-label={statusLabel[status]} className={"h-1.5 w-1.5 shrink-0 rounded-full " + STATUS_DOT[status]} /> : null}
        <span className="truncate">{child.kind === "agent_task" ? subTaskLabel(child) : child.title}</span>
      </button>
    );
  };
  return (
    <div className="flex shrink-0 items-center gap-3 overflow-x-auto border-b border-neutral-200/80 px-3 py-1.5" data-task-children="">
      {agents.length ? (
        <div className="flex shrink-0 items-center gap-1.5" data-task-children-agents="">
          <span className="shrink-0 text-[11.5px] text-neutral-400">{tt("智能体工作")}</span>
          {agents.map(chip)}
        </div>
      ) : null}
      {rooms.length ? (
        <div className="flex shrink-0 items-center gap-1.5" data-task-children-rooms="">
          <span className="shrink-0 text-[11.5px] text-neutral-400">{tt("任务")}</span>
          {rooms.map(chip)}
        </div>
      ) : null}
    </div>
  );
}

export function RoomView({ roomId, surface, onOpenChild, onBack, className = "" }: RoomViewProps) {
  const tt = useUI();
  const viewerId = useViewerId();
  const { room, state } = useTaskRoom(roomId);
  const [detail, setDetail] = useState<ImConversationDetail | null>(null);
  const [handoffs, setHandoffs] = useState<TaskHandoff[]>([]);
  const [infoOpen, setInfoOpen] = useState(false);
  const [summonDraft, setSummonDraft] = useState<SummonDraft | null>(null);
  const [summonOpen, setSummonOpen] = useState(false);
  const [spinOff, setSpinOff] = useState<{ ids: string[]; done: () => void } | null>(null);
  const [selectionRequest, setSelectionRequest] = useState<{ ids: readonly string[]; nonce: number } | null>(null);
  const [notice, setNotice] = useState("");

  const open = useCallback(
    (detail: OpenTaskChildDetail) => (onOpenChild ?? openTaskChildAnywhere)(detail),
    [onOpenChild],
  );

  const loadDetail = useCallback(() => {
    void getConversationDetail(roomId).then(setDetail).catch(() => undefined);
  }, [roomId]);
  const loadHandoffs = useCallback(() => {
    void taskRoomsApi.listHandoffs(roomId).then((result) => {
      if (result.ok) setHandoffs(Array.isArray(result.data?.handoffs) ? result.data.handoffs : []);
    });
  }, [roomId]);
  useEffect(() => {
    loadDetail();
    loadHandoffs();
  }, [loadDetail, loadHandoffs]);
  useImEvent("member.changed", (event) => {
    if (event.conversation_id === roomId) {
      loadDetail();
      void readTaskRoom(roomId, true);
    }
  });
  useImEvent("task.card.updated", (event) => {
    if (event.conversation_id === roomId) loadHandoffs();
  });
  useImResync(() => {
    loadDetail();
    loadHandoffs();
  });

  const canSummon = Boolean(room?.can_summon);
  const summonBlockedReason = tt("项目的查看者可以在这里交流，但不能叫智能体。");
  const openSummon = useCallback((target: SummonTarget | "keep", messageIds: string[] | null) => {
    setSummonDraft((current) => {
      if (target === "keep") return current ? { ...current, messageIds } : newSummonDraft("new", messageIds);
      return newSummonDraft(target, messageIds);
    });
    setSummonOpen(true);
  }, []);

  const actions = useMemo<RoomActions>(
    () => ({
      room,
      canSummon,
      summonBlockedReason,
      openSummon: (target, ids) => openSummon(target, ids),
      openSpinOff: (ids, done) => setSpinOff({ ids, done }),
      selectDefault: (ctx) => {
        void taskRoomsApi
          .summonPreview(roomId, { target: "new", message_ids: null, prior_task_ids: [], imported: [] })
          .then((result) => {
            if (result.ok) ctx.setSelectedMessageIds(result.data.default_message_ids ?? []);
          });
      },
    }),
    [room, canSummon, summonBlockedReason, openSummon, roomId],
  );

  const marks = useMemo(() => {
    const titles = handoffTitles(handoffs, room?.children ?? []);
    const out: Record<string, string> = {};
    for (const [id, list] of Object.entries(titles)) out[id] = tt("已交给 {title}", { title: list.join(", ") });
    return out;
  }, [handoffs, room?.children, tt]);

  const composerExtras = useMemo<ComposerExtras | undefined>(() => {
    if (!room) return undefined;
    const sendAccessory = (
      <button
        type="button"
        disabled={!canSummon}
        title={canSummon ? undefined : summonBlockedReason}
        onClick={() => openSummon("new", null)}
        className="min-h-8 whitespace-nowrap rounded-lg px-2 text-[12.5px] text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
        data-task-ask-agent=""
      >
        {tt("叫智能体")}
      </button>
    );
    const extraMentions: ComposerExtraMention[] = canSummon
      ? [
          { key: "new", label: tt("新的智能体任务…"), onPick: () => openSummon("new", null) },
          ...sendableSubTasks(room.children).map((child) => ({
            key: child.id,
            label: subTaskLabel(child),
            onPick: () => openSummon(child.id, null),
          })),
        ]
      : [];
    return { sendAccessory, extraMentions };
  }, [room, canSummon, summonBlockedReason, openSummon, tt]);

  const chain = room?.chain ?? [];
  const titleSlot = room ? (
    <Breadcrumb
      label={tt("任务位置")}
      className="text-[13px]"
      items={(chain.length ? chain : [{ kind: "room" as const, id: room.id, title: room.title }]).map((item, index, all) =>
        index === all.length - 1
          ? { label: item.title || tt("未命名任务") }
          : { label: item.title || tt("未命名任务"), onClick: () => open({ kind: item.kind, id: item.id, title: item.title }) },
      )}
    />
  ) : undefined;

  const members = detail?.members ?? [];
  const headerActions = room ? (
    <>
      <button
        type="button"
        onClick={() => setInfoOpen(true)}
        className="flex items-center gap-1 rounded-lg px-1.5 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        aria-label={tt("任务成员")}
        title={tt("任务成员")}
        data-task-members=""
      >
        <span className="flex -space-x-1.5">
          {members.slice(0, 3).map((member) => (
            <Avatar key={member.user_id} profile={member.profile} size={20} />
          ))}
        </span>
        <span className="text-[12px] text-neutral-500">{room.members_count || detail?.member_count || members.length}</span>
      </button>
      <button
        type="button"
        disabled={!canSummon}
        title={canSummon ? undefined : summonBlockedReason}
        onClick={() => openSummon("new", null)}
        className="whitespace-nowrap rounded-lg px-2 py-1 text-[12.5px] text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-neutral-800"
        data-task-header-ask-agent=""
      >
        {tt("叫智能体")}
      </button>
    </>
  ) : null;

  const belowHeader = (
    <>
      {state === "unavailable" ? (
        <p className="shrink-0 border-b border-neutral-200/80 px-3 py-1.5 text-[12px] text-neutral-500" data-task-unavailable="">{tt("任务功能暂未开放。")}</p>
      ) : null}
      {room && !canSummon ? (
        <p className="shrink-0 px-3 pt-1.5 text-[12px] text-neutral-500" data-task-summon-blocked="">{summonBlockedReason}</p>
      ) : null}
      {notice ? <p role="status" className="shrink-0 px-3 pt-1.5 text-[12px] text-neutral-500">{notice}</p> : null}
      {room ? <ChildrenStrip children={room.children} onOpen={(child) => open({ kind: child.kind, id: child.id, title: child.title })} /> : null}
    </>
  );

  return (
    <RoomActionsContext.Provider value={actions}>
      <TaskChildOpenContext.Provider value={open}>
        <div className={`flex h-full min-h-0 min-w-0 flex-col ${className}`.trim()} data-task-room={roomId} data-task-room-surface={surface}>
          <div hidden={infoOpen} style={{ display: infoOpen ? "none" : "flex" }} className="min-h-0 min-w-0 flex-1 flex-col">
            <ConversationView
              conversationId={roomId}
              layout={surface === "panel" ? "docked" : "full"}
              active={!infoOpen}
              onBack={onBack}
              onOpenInfo={() => setInfoOpen(true)}
              selectionActions={room ? ROOM_SELECTION_ACTIONS : undefined}
              titleSlot={titleSlot}
              headerActions={headerActions}
              belowHeader={belowHeader}
              messageMarks={marks}
              selectionRequest={selectionRequest}
              composerExtras={composerExtras}
            />
          </div>
          {infoOpen ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-task-room-info="">
              <ConversationInfoPanel
                conversationId={roomId}
                onClose={() => setInfoOpen(false)}
                onOpenConversation={(id) => {
                  setInfoOpen(false);
                  openMessages({ conversationId: id });
                }}
              />
            </div>
          ) : null}
        </div>
        {room && summonOpen && summonDraft ? (
          <SummonDialog
            room={room}
            draft={summonDraft}
            onDraftChange={setSummonDraft}
            onChooseMessages={(current) => {
              setSummonOpen(false);
              setSelectionRequest({ ids: current, nonce: Date.now() });
            }}
            onClose={() => {
              setSummonOpen(false);
              setSummonDraft(null);
            }}
            onDone={(result, title) => {
              setSummonOpen(false);
              setSummonDraft(null);
              setNotice(result.as_file ? tt("内容较多，已作为一个文件交给智能体。") : "");
              void readTaskRoom(roomId, true);
              loadHandoffs();
              open({ kind: "agent_task", id: result.task_id, title });
            }}
          />
        ) : null}
        {spinOff ? (
          <SpinOffDialog
            roomId={roomId}
            messageIds={spinOff.ids}
            members={members}
            viewerId={viewerId}
            onClose={() => setSpinOff(null)}
            onDone={(childRoomId, title) => {
              spinOff.done();
              setSpinOff(null);
              void readTaskRoom(roomId, true);
              open({ kind: "room", id: childRoomId, title: title || tt("未命名任务") });
            }}
          />
        ) : null}
      </TaskChildOpenContext.Provider>
    </RoomActionsContext.Provider>
  );
}
