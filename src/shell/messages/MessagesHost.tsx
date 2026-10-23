"use client";

// 全局唯一的消息浮层（每个站挂一次，在 AppShell / 门户外壳里与 SettingsModalHost 并列）。
// 未登录：什么都不渲染、不连接、不监听深链。境内外同一条路径，不按域名家族分叉。
// 浮层里：聊天 / 联系人两个栏目 + 会话（交易会话也在这里）；放大后左列表、右对话。LeoBay 不在小窗里，它是 `/bay` 那张页。
// 平台通知：聊天列表最上面固定一行「通知」，点开进通知视图（二级视图，占详情位）；内容处置（cases）同为二级视图，
// 只经通知或深链 `?im=cases[:<案件>]` 进入。通知的轮询、标签页标题的未读数（会话 + 通知）都在这里接线。
// LeoChat 还能在整页和右侧栏里显示，一次只显示一处，见 host-state.ts。小窗只在 surface === "window" 时画。
// 聊天搜索在聊天列表和已打开的对话里。提醒与拉黑在设置中心「消息」栏。同时挂工作回放播放层与邀请对话框。
// 通话 v2（calls-v2 合同 §3.9）：消息可用时挂通话小窗 / 放大视图（W07 CallHost）、来电浮层（W08 IncomingCallHost）、
// 远程控制被控方处理（W09 CallControlHost）。旧的会话会议弹窗与「会议邀请」处理已移除（A20）。
// Leo 实时通话（RealtimeCallHost）不依赖消息是否可用，挂在最外层，两种状态下是同一个实例。
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
import { closeMessages, hostState, isSubView, tabOfView, useMessagesHost, type MessagesView } from "./host-state";
import { MessagesLayout } from "./MessagesLayout";
import { MessagesSubView } from "./notices/MessagesSubView";
import { combineUnread } from "./notices/notice-unread";
import { setNoticeNavigator } from "./notices/open-notice";
import { noticeStore, useLeoChatUnread, useNoticePolling } from "./notices/use-notices";
import { attachMessageSound, createBrowserMessageSound } from "./notify/sound";
import { attachBrowserTitleBadge } from "./notify/title-badge";
import { PeopleView } from "./people/PeopleView";
import { CallHost } from "./call/ui";
import { IncomingCallHost } from "./call/incoming";
import { CallControlHost } from "./call/control";
import { RealtimeCallHost } from "../realtime-call/RealtimeCallHost";
import { PrivacyNotice } from "./PrivacyNotice";
import { attachImRealtime, imStore, publishImDisabled } from "./realtime/hooks";

export function isTalentConversationId(id: string): boolean {
  return id.startsWith("talent:");
}

export function MessagesHost() {
  return (
    <>
      <MessagesHostBody />
      <RealtimeCallHost />
    </>
  );
}

function MessagesHostBody() {
  const enabled = useImEnabled();
  const state = useMessagesHost();
  const pathname = usePathname() || "/";
  const pathRef = useRef(pathname);
  const router = useRouter();

  // 别的页面上「去 LeoBay」的动作（任务页的找人帮忙、旧的 ?bay= 链接）= 站内跳到 /bay，不整页刷新。
  // 这个宿主每个站都挂一次，所以在这里把站内跳转交给 LeoBay；平台通知里的站内链接（订单、任务……）同走这一条。
  useEffect(() => {
    setBayNavigator((href) => router.push(href));
    setNoticeNavigator((href) => router.push(href));
    return () => {
      setBayNavigator(null);
      setNoticeNavigator(null);
    };
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

  // 平台通知（订单、任务、账单、内容处置……）：登录就轮询（60 秒一次，切回标签页立即取一次），登出清空。
  // 和 IM 连接用同一个开关——境内外同一条路径，不按域名家族分叉。
  useNoticePolling(enabled);
  // LeoChat 一打开（小窗 / 整页 / 右侧栏）就取一次最新的，不让人看 59 秒前的通知。
  useEffect(() => {
    if (enabled && state.open) void noticeStore().refresh();
  }, [enabled, state.open]);

  // 标签页标题前的未读数 = 会话未读（静音会话不计入，数字来自状态仓的 unread.total）+ 平台通知未读。
  // 消息不可用（未登录）时整段不挂，标题一个字都不动。
  useEffect(() => {
    if (!enabled) return undefined;
    const badge = attachBrowserTitleBadge();
    if (!badge) return undefined;
    const store = imStore();
    const notices = noticeStore();
    const sync = () => badge.setCount(combineUnread(store.unread()?.total, notices.getState().unread));
    sync();
    const offChat = store.subscribe(sync);
    const offNotices = notices.subscribe(sync);
    return () => {
      offChat();
      offNotices();
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
      <CallHost />
      <IncomingCallHost />
      <CallControlHost />
    </>
  );
}

function MessagesOverlay() {
  const state = useMessagesHost();
  const host = hostState();
  // 「聊天」标签上的数字 = 会话未读 + 平台通知未读；联系人标签只是联系请求。
  const unread = useLeoChatUnread(true);
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

  // 通知 / 内容处置是二级视图：左边仍是聊天列表（最上面那行「通知」亮着），右边（小窗里是整块）是它们。
  const subView = isSubView(state.view);
  let list: ReactNode;
  if (state.view === "people") {
    list = <PeopleView onOpenConversation={openConversation} />;
  } else {
    list = (
      <Inbox
        activeConversationId={state.conversationId}
        onOpenConversation={(id, seq) => host.showConversation(id, seq ?? null)}
        onNew={() => setNewOpen(true)}
        onOpenNotices={() => setView("notices")}
        noticesActive={state.view === "notices"}
      />
    );
  }

  const listBody = (
    <div key={tabOfView(state.view)} data-im-view-body className="flex min-h-0 flex-1 flex-col">
      {list}
    </div>
  );
  const tabs = (
    <LeoChatTabs active={tabOfView(state.view)} onSelect={setView} badges={{ inbox: unread.total, people: unread.requests }} />
  );

  // 放大后右边一直是当前会话（左边切到联系人也不收走）；小窗里只有聊天栏会滑进会话。
  const showConversation = Boolean(state.conversationId) && (state.view === "inbox" || state.layout === "full");
  let detail: ReactNode = null;
  if (subView) {
    detail = <MessagesSubView view={state.view} caseId={state.caseId} onSelectView={setView} />;
  } else if (showConversation && state.conversationId) {
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
        showDetail={subView || showConversation}
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
