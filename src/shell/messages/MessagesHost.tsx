"use client";

// 全局唯一的消息浮层（每个站挂一次，在 AppShell / 门户外壳里与 SettingsModalHost 并列）。
// 境内站与未登录：什么都不渲染、不连接、不监听深链。
// 浮层里：收件箱 / 联系人 / 搜索 / 设置四个视图 + 右侧会话；同时挂工作回放播放层与邀请对话框。
import { useEffect, useState, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { useImEnabled } from "../../lib/im/client";
import { WorkReplayHost } from "../replay/work/WorkReplayHost";
import { ConversationView } from "./conversation/ConversationView";
import { ConversationInfoPanel } from "./groups/ConversationInfoPanel";
import { NewConversationDialog } from "./groups/NewConversationDialog";
import { Inbox } from "./Inbox";
import { InviteAcceptDialog } from "./invite/InviteAcceptDialog";
import { closeMessages, hostState, useMessagesHost, type MessagesView } from "./host-state";
import { MessagesLayout } from "./MessagesLayout";
import { PeopleView } from "./people/PeopleView";
import { PrivacyNotice } from "./PrivacyNotice";
import { attachImRealtime, imStore, publishImDisabled } from "./realtime/hooks";
import { SearchView } from "./search/SearchView";
import { SettingsView } from "./SettingsView";
import { TalentConversationView } from "./talent/TalentConversationView";

export function isTalentConversationId(id: string): boolean {
  return id.startsWith("talent:");
}

export function MessagesHost() {
  const enabled = useImEnabled();
  const state = useMessagesHost();

  // 深链、返回键、`oceanleo:im-open`：只在可用时监听。
  useEffect(() => {
    if (!enabled) return undefined;
    const host = hostState();
    host.setEnabled(true);
    const detach = host.attach();
    return () => {
      detach();
      host.setEnabled(false);
    };
  }, [enabled]);

  // 实时连接：可用时就连（侧栏角标要实时），不依赖浮层是否打开。
  useEffect(() => {
    if (!enabled) {
      publishImDisabled();
      return undefined;
    }
    return attachImRealtime();
  }, [enabled]);

  // 前台会话：浮层开着、选中了会话、标签页可见 → 这个会话的新消息不计未读。
  useEffect(() => {
    if (!enabled) return undefined;
    const store = imStore();
    const sync = () => {
      const foreground =
        state.open && state.view === "inbox" && state.conversationId && !document.hidden ? state.conversationId : null;
      store.setForegroundConversation(foreground);
      if (foreground) store.clearConversationUnread(foreground);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      store.setForegroundConversation(null);
    };
  }, [enabled, state.open, state.view, state.conversationId]);

  if (!enabled) return null;
  return (
    <>
      <MessagesOverlay />
      <WorkReplayHost />
    </>
  );
}

function MessagesOverlay() {
  const tt = useUI();
  const state = useMessagesHost();
  const host = hostState();
  const [newOpen, setNewOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  // 换了会话就收起信息面板。
  useEffect(() => {
    setInfoOpen(false);
  }, [state.conversationId]);

  if (!state.open) return null;

  const setView = (view: MessagesView) => host.setView(view);
  const openConversation = (id: string) => host.showConversation(id);
  const talent = state.conversationId ? isTalentConversationId(state.conversationId) : false;

  const tabs: ReadonlyArray<{ id: MessagesView; label: string }> = [
    { id: "inbox", label: "收件箱" },
    { id: "people", label: "联系人" },
    { id: "search", label: "搜索" },
    { id: "settings", label: "设置" },
  ];

  let list: ReactNode;
  if (state.view === "inbox") {
    list = (
      <Inbox
        activeConversationId={state.conversationId}
        initialFilter={state.filter}
        onFilterChange={(next) => host.setFilter(next)}
        onOpenConversation={openConversation}
        onNew={() => setNewOpen(true)}
        onSearch={() => setView("search")}
        onPeople={() => setView("people")}
        onSettings={() => setView("settings")}
      />
    );
  } else if (state.view === "people") {
    list = <PeopleView onOpenConversation={openConversation} />;
  } else if (state.view === "search") {
    list = (
      <SearchView
        onOpenResult={(conversationId, seq) => host.showConversation(conversationId, seq)}
        conversationId={null}
      />
    );
  } else {
    list = <SettingsView onBack={() => setView("inbox")} onOpenBlocks={() => setView("people")} />;
  }

  const listWithTabs = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label={tt("消息")} className="flex shrink-0 border-b border-black/10 text-xs dark:border-white/10">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={state.view === tab.id}
            data-view={tab.id}
            onClick={() => setView(tab.id)}
            className={`flex-1 px-2 py-2 transition-colors ${
              state.view === tab.id
                ? "border-b-2 border-sky-500 font-medium text-sky-600 dark:text-sky-400"
                : "text-black/55 hover:bg-black/5 dark:text-white/55 dark:hover:bg-white/5"
            }`}
          >
            {tt(tab.label)}
          </button>
        ))}
      </div>
      {list}
    </div>
  );

  let detail: ReactNode = null;
  if (state.conversationId) {
    const conversation = talent ? (
      <TalentConversationView
        key={state.conversationId}
        conversationId={state.conversationId}
        layout={state.layout}
        onBack={() => host.showConversation(null)}
      />
    ) : (
      <ConversationView
        key={state.conversationId}
        conversationId={state.conversationId}
        layout={state.layout}
        onBack={() => host.showConversation(null)}
        onOpenInfo={() => setInfoOpen(true)}
        highlightSeq={state.highlightSeq}
      />
    );
    detail =
      infoOpen && !talent ? (
        <div className="flex min-h-0 flex-1">
          {state.layout === "full" ? <div className="flex min-w-0 flex-1 flex-col">{conversation}</div> : null}
          <div
            className={`flex min-h-0 flex-col ${
              state.layout === "full" ? "w-[320px] shrink-0 border-l border-black/10 dark:border-white/10" : "flex-1"
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

  return (
    <>
      <MessagesLayout
        layout={state.layout}
        dockWidth={state.dockWidth}
        onDockWidth={(width) => host.setDockWidth(width)}
        onClose={closeMessages}
        onToggleExpand={() => host.setExpanded(!state.expanded)}
        list={listWithTabs}
        detail={detail}
        showDetail={Boolean(state.conversationId) && state.view === "inbox"}
      >
        <PrivacyNotice />
      </MessagesLayout>
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
}
