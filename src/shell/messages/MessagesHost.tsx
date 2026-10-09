"use client";

// 全局唯一的消息浮层（每个站挂一次，在 AppShell / 门户外壳里与 SettingsModalHost 并列）。
// 境内站与未登录：什么都不渲染、不连接、不监听深链。
// 浮层里：聊天 / 联系人两个栏目 + 会话（交易会话也在这里）；放大后左列表、右对话。LeoBay 不在小窗里，它是 `/bay` 那张页。
// LeoChat 还能在整页和右侧栏里显示，一次只显示一处，见 host-state.ts。小窗只在 surface === "window" 时画。
// 聊天搜索在聊天列表和已打开的对话里。提醒与拉黑在设置中心「消息」栏。同时挂工作回放播放层与邀请对话框。
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useImEnabled } from "../../lib/im/client";
import { cachedImSettings, refreshImSettingsInBackground } from "../../lib/im/notify-api";
import { DealConversationView } from "../bay/deal";
import { BayAuthHost } from "../bay/shell/bay-auth-host";
import { setBayNavigator } from "../bay/shell/bay-state";
import { LeoChatTabs } from "../leochat/LeoChatTabs";
import { WorkReplayHost } from "../replay/work/WorkReplayHost";
import { ConversationView } from "./conversation/ConversationView";
import { ConversationInfoPanel } from "./groups/ConversationInfoPanel";
import { NewConversationDialog } from "./groups/NewConversationDialog";
import { Inbox } from "./Inbox";
import { InviteAcceptDialog } from "./invite/InviteAcceptDialog";
import { closeMessages, hostState, useMessagesHost, type MessagesView } from "./host-state";
import { MessagesLayout } from "./MessagesLayout";
import { attachMessageSound, createBrowserMessageSound } from "./notify/sound";
import { attachBrowserTitleBadge } from "./notify/title-badge";
import { PeopleView } from "./people/PeopleView";
import { PrivacyNotice } from "./PrivacyNotice";
import { attachImRealtime, imStore, publishImDisabled, useImUnread } from "./realtime/hooks";

export function isTalentConversationId(id: string): boolean {
  return id.startsWith("talent:");
}

export function MessagesHost() {
  const enabled = useImEnabled();
  const state = useMessagesHost();
  const pathname = usePathname() || "/";
  const pathRef = useRef(pathname);
  const router = useRouter();

  // 别的页面上「去 LeoBay」的动作（任务页的找人帮忙、旧的 ?bay= 链接）= 站内跳到 /bay，不整页刷新。
  // 这个宿主每个站都挂一次，所以在这里把站内跳转交给 LeoBay。
  useEffect(() => {
    setBayNavigator((href) => router.push(href));
    return () => setBayNavigator(null);
  }, [router]);

  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    if (hostState().getSnapshot().open) closeMessages();
  }, [pathname]);

  // 深链、返回键、`oceanleo:im-open`：只在可用时监听。
  // cleanup 只卸监听，不能 setEnabled(false)——切页时外壳会重挂，那会把已经打开的浮层关掉。
  useEffect(() => {
    if (!enabled) {
      hostState().setEnabled(false);
      return undefined;
    }
    const host = hostState();
    host.setEnabled(true);
    return host.attach();
  }, [enabled]);

  // 实时连接：可用时就连（侧栏角标要实时），不依赖浮层是否打开。
  useEffect(() => {
    if (!enabled) {
      publishImDisabled();
      return undefined;
    }
    return attachImRealtime();
  }, [enabled]);

  // 标签页标题前的未读数（静音会话不计入，数字来自状态仓的 unread.total）。
  // 消息不可用（境内、未登录）时整段不挂，标题一个字都不动。
  useEffect(() => {
    if (!enabled) return undefined;
    const badge = attachBrowserTitleBadge();
    if (!badge) return undefined;
    const store = imStore();
    const sync = () => badge.setCount(store.unread()?.total ?? 0);
    sync();
    const off = store.subscribe(sync);
    return () => {
      off();
      badge.detach();
    };
  }, [enabled]);

  // 新消息提示音：设置里开着才响；规则与节流见 notify/sound.ts。
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return undefined;
    refreshImSettingsInBackground();
    return attachMessageSound({
      store: imStore(),
      sound: createBrowserMessageSound(),
      getSettings: () => {
        refreshImSettingsInBackground();
        return cachedImSettings();
      },
      gestureTarget: window,
    });
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

  // 登录框宿主：别的页面上点了要登录的 LeoBay 动作时由它弹（/bay 页自己也挂一份，只有最先挂上的渲染）。
  if (!enabled) return <BayAuthHost />;
  return (
    <>
      <MessagesOverlay />
      <WorkReplayHost />
      <BayAuthHost />
    </>
  );
}

function MessagesOverlay() {
  const state = useMessagesHost();
  const host = hostState();
  const unread = useImUnread();
  const windowOpen = state.open && state.surface === "window";
  const [newOpen, setNewOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [shown, setShown] = useState(windowOpen);
  const [overlayState, setOverlayState] = useState<"open" | "closed">(windowOpen ? "open" : "closed");

  useEffect(() => {
    if (windowOpen) {
      setShown(true);
      const frame = window.requestAnimationFrame(() => setOverlayState("open"));
      return () => window.cancelAnimationFrame(frame);
    }
    setOverlayState("closed");
    return undefined;
  }, [windowOpen]);

  // 换了会话就收起信息面板。
  useEffect(() => {
    setInfoOpen(false);
  }, [state.conversationId]);

  if (!shown) return null;

  const setView = (view: MessagesView) => host.setView(view);
  const openConversation = (id: string) => host.showConversation(id);
  const talent = state.conversationId ? isTalentConversationId(state.conversationId) : false;

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
    list = <PeopleView onOpenConversation={openConversation} />;
  }

  const listBody = (
    <div key={state.view} data-im-view-body className="flex min-h-0 flex-1 flex-col">
      {list}
    </div>
  );
  const tabs = (
    <LeoChatTabs active={state.view} onSelect={setView} badges={{ inbox: unread?.total ?? 0, people: unread?.requests ?? 0 }} />
  );

  // 放大后右边一直是当前会话（左边切到联系人也不收走）；小窗里只有聊天栏会滑进会话。
  const showConversation = Boolean(state.conversationId) && (state.view === "inbox" || state.layout === "full");
  let detail: ReactNode = null;
  if (showConversation && state.conversationId) {
    const conversation = talent ? (
      <DealConversationView
        key={state.conversationId}
        threadId={state.conversationId.replace(/^talent:/, "")}
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
        onUnavailable={() => host.showConversation(null)}
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
        overlayOffset={state.overlayOffset}
        onDockWidth={(width) => host.setDockWidth(width)}
        onOverlayOffset={(offset) => host.setOverlayOffset(offset)}
        onClose={closeMessages}
        overlayState={overlayState}
        onExitComplete={() => {
          if (!windowOpen) setShown(false);
        }}
        title="LeoChat"
        tabs={tabs}
        onToggleExpand={() => host.setExpanded(!state.expanded)}
        list={listBody}
        detail={detail}
        showDetail={showConversation}
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
