"use client";

// 整页和右侧栏共用的 LeoChat 正文。栏目、会话一律读写 host-state；小窗的「前台会话」仍留在 MessagesHost。
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { DealConversationView } from "../bay/deal";
import { ConversationView } from "../messages/conversation/ConversationView";
import { ConversationInfoPanel } from "../messages/groups/ConversationInfoPanel";
import { NewConversationDialog } from "../messages/groups/NewConversationDialog";
import { Inbox } from "../messages/Inbox";
import { InviteAcceptDialog } from "../messages/invite/InviteAcceptDialog";
import { hostState, useMessagesHost } from "../messages/host-state";
import { PeopleView } from "../messages/people/PeopleView";

export interface LeoChatBodyProps {
  /** wide：左列表（340px）右会话，两边同时在；窄：一次只显示一边，有会话时显示会话。 */
  wide: boolean;
}

export function LeoChatBody({ wide }: LeoChatBodyProps): ReactElement {
  const tt = useUI();
  const state = useMessagesHost();
  const host = hostState();
  const [newOpen, setNewOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    setInfoOpen(false);
  }, [state.conversationId]);

  const openConversation = (id: string, seq?: number | null) => {
    host.showConversation(id, seq ?? null);
  };
  const closeConversation = () => host.showConversation(null);
  const layout = wide ? "full" : "docked";

  let list: ReactNode;
  if (state.view === "inbox") {
    list = (
      <Inbox
        activeConversationId={state.conversationId}
        initialFilter={state.filter}
        onFilterChange={(next) => host.setFilter(next)}
        onOpenConversation={(id, seq) => host.showConversation(id, seq ?? null)}
        onNew={() => setNewOpen(true)}
      />
    );
  } else {
    list = <PeopleView onOpenConversation={(id) => host.showConversation(id)} />;
  }

  const talent = state.conversationId ? state.conversationId.startsWith("talent:") : false;
  let thread: ReactNode = null;
  if (state.conversationId) {
    const conversation = talent ? (
      <DealConversationView
        key={state.conversationId}
        threadId={state.conversationId.replace(/^talent:/, "")}
        layout={layout}
        onBack={closeConversation}
      />
    ) : (
      <ConversationView
        key={state.conversationId}
        conversationId={state.conversationId}
        layout={layout}
        onBack={closeConversation}
        onOpenInfo={() => setInfoOpen(true)}
        highlightSeq={state.highlightSeq}
        onUnavailable={closeConversation}
      />
    );
    thread =
      infoOpen && !talent ? (
        <div className="flex min-h-0 flex-1">
          {wide ? <div className="flex min-w-0 flex-1 flex-col">{conversation}</div> : null}
          <div
            className={`flex min-h-0 flex-col ${
              wide ? "w-[320px] shrink-0 border-l border-stone-200" : "flex-1"
            }`}
          >
            <ConversationInfoPanel
              conversationId={state.conversationId}
              onClose={() => setInfoOpen(false)}
              onOpenConversation={(id) => {
                setInfoOpen(false);
                openConversation(id);
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">{conversation}</div>
      );
  }

  const dialogs = (
    <>
      <NewConversationDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => {
          setNewOpen(false);
          openConversation(id);
        }}
      />
      {state.inviteCode ? (
        <InviteAcceptDialog
          code={state.inviteCode}
          onClose={() => host.clearInvite()}
          onDone={({ conversationId }) => {
            host.clearInvite();
            if (conversationId) openConversation(conversationId);
          }}
        />
      ) : null}
    </>
  );

  if (wide) {
    return (
      <div data-leochat-body="wide" className="flex min-h-0 flex-1">
        <div data-leochat-list className="flex min-h-0 w-[340px] shrink-0 flex-col border-r border-stone-200">
          {list}
        </div>
        <div data-leochat-thread className="flex min-h-0 min-w-0 flex-1 flex-col">
          {thread ?? (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-[13px] text-stone-400">{tt("选一个聊天开始。")}</p>
            </div>
          )}
        </div>
        {dialogs}
      </div>
    );
  }

  const showThread = state.view === "inbox" && Boolean(state.conversationId);
  return (
    <div data-leochat-body="narrow" className="flex min-h-0 flex-1 flex-col">
      {showThread ? (
        <div data-leochat-thread className="flex min-h-0 min-w-0 flex-1 flex-col">
          {thread}
        </div>
      ) : (
        <div data-leochat-list className="flex min-h-0 min-w-0 flex-1 flex-col">
          {list}
        </div>
      )}
      {dialogs}
    </div>
  );
}
