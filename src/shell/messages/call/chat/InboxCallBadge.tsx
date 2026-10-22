"use client";

// 会话列表行上的通话标记（任务书 P5；合同 §1 A3、§3.2 `active_call`）：耳机 + 人数，点标记直接加入。
// 数据：实时 `call` 事件优先（conversation-calls），没有就用列表接口带来的 `active_call`。
// 列表行本身是 <button>，标记不能嵌在里面（按钮套按钮）：InboxRow 把它画在行外、叠在右列上。
import type { MouseEvent } from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import { conversationDisplayTitle } from "../../../../lib/im/people-api";
import { imStore } from "../../realtime/hooks";
import { isTalentConversation } from "./call-entry";
import { HeadphonesIcon } from "./call-visuals";
import type { ActiveCallSummary } from "./conversation-calls";
import { useCallEntry } from "./use-call-entry";
import { useActiveCallSummary } from "./use-conversation-call";

export interface InboxCallBadgeProps {
  conversationId: string;
  activeCall: ActiveCallSummary | null | undefined;
}

/** 点击加入时给引擎的会话标题（小窗里显示）；从收件箱状态里现取，取不到就不给。 */
function titleFromInbox(conversationId: string): string | undefined {
  try {
    const item = imStore()
      .inbox()
      .items.find((row) => row.id === conversationId);
    if (!item) return undefined;
    return conversationDisplayTitle(item) || item.title || item.peer?.display_name || undefined;
  } catch {
    return undefined;
  }
}

export interface InboxCallDecorProps {
  conversationId: string;
  /** 列表行原样的 `active_call`（没校验过的数据）。 */
  activeCall: unknown;
  /** slot = 行按钮右列里给标记留的空位；badge = 叠在空位上的标记本身（在行按钮外面）。 */
  part: "slot" | "badge";
}

/**
 * 列表行的通话装饰：由 Inbox 注入给 InboxRow（InboxRow 自己不静态依赖通话引擎，行组件保持轻）。
 * 行里渲染两次（slot 一次、badge 一次），两处读同一份状态，所以「有没有通话」总是一致的。
 */
export function InboxCallDecor({ conversationId, activeCall, part }: InboxCallDecorProps) {
  const live = useActiveCallSummary(isTalentConversation(conversationId) ? null : conversationId, activeCall);
  if (!live) return null;
  if (part === "slot") return <span aria-hidden="true" className="block h-5 w-11" data-inbox-call-slot="" />;
  return (
    <span className="absolute bottom-2.5 right-3">
      <InboxCallBadge conversationId={conversationId} activeCall={live} />
    </span>
  );
}

export function InboxCallBadge({ conversationId, activeCall }: InboxCallBadgeProps) {
  const tt = useUI();
  const live = useActiveCallSummary(conversationId, activeCall);
  const entry = useCallEntry(conversationId, isTalentConversation(conversationId));
  if (!live || entry.state === "hidden") return null;
  const count = live.participant_count;
  const mine = entry.state === "in_this_call";
  const label = mine ? tt("通话中，{n} 人", { n: count }) : tt("通话进行中，{n} 人，点击加入", { n: count });
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void entry.run({ title: titleFromInbox(conversationId), callId: live.call_id });
  };
  return (
    <>
      <button
        type="button"
        data-inbox-call-badge={mine ? "mine" : "active"}
        data-call-count={count}
        aria-label={label}
        title={label}
        disabled={entry.pending || entry.state === "busy"}
        onClick={onClick}
        className={
          "inline-flex h-5 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-semibold leading-none transition-colors disabled:opacity-60 " +
          (mine
            ? "bg-emerald-500 text-white hover:bg-emerald-600"
            : "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300")
        }
      >
        <HeadphonesIcon size={12} />
        <span>{count}</span>
      </button>
      {entry.dialog}
    </>
  );
}
