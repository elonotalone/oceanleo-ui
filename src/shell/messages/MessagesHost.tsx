"use client";

// 全局唯一的消息浮层（每个站挂一次，在 AppShell / 门户外壳里与 SettingsModalHost 并列）。
// 境内站与未登录：什么都不渲染、不连接、不监听深链。
// 浮层里：聊天 / 联系人 / Bay 三个视图 + 右侧会话；聊天搜索在聊天列表和已打开的对话里。提醒与拉黑在设置中心「消息」栏。同时挂工作回放播放层与邀请对话框。
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useImEnabled } from "../../lib/im/client";
import { cachedImSettings, refreshImSettingsInBackground } from "../../lib/im/notify-api";
import { DealConversationView } from "../bay/deal";
import { BayGuestHost } from "../bay/shell/BayGuestHost";
import { formatBayParam } from "../bay/shell/bay-links";
import { BayView } from "../bay/shell/BayView";
import { bayEnabledHere, useBayHasDetail, useBaySignedIn, useBayState } from "../bay/shell/bay-state";
import { LeoChatTabs } from "../leochat/LeoChatTabs";
import { leoChatPageHref } from "../leochat/leochat-links";
import { useBayNeedsAction } from "../leochat/leochat-store";
import { leoChatPageMounted } from "../leochat/page-presence";
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
      if (leoChatPageMounted()) return;
      const foreground =
        state.open && state.view === "inbox" && state.conversationId && !document.hidden ? state.conversationId : null;
      store.setForegroundConversation(foreground);
      if (foreground) store.clearConversationUnread(foreground);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      if (!leoChatPageMounted()) store.setForegroundConversation(null);
    };
  }, [enabled, state.open, state.view, state.conversationId]);

  if (!enabled) return bayEnabledHere() ? <BayGuestHost /> : null;
  return (
    <>
      <MessagesOverlay />
      <WorkReplayHost />
    </>
  );
}

function MessagesOverlay() {
  const state = useMessagesHost();
  const host = hostState();
  const unread = useImUnread();
  const router = useRouter();
  const bay = useBayState();
  const signedIn = useBaySignedIn();
  const bayNeeds = useBayNeedsAction(signedIn);
  const [newOpen, setNewOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [shown, setShown] = useState(state.open);
  const [overlayState, setOverlayState] = useState<"open" | "closed">(state.open ? "open" : "closed");

  useEffect(() => {
    if (state.open) {
      setShown(true);
      const frame = window.requestAnimationFrame(() => setOverlayState("open"));
      return () => window.cancelAnimationFrame(frame);
    }
    setOverlayState("closed");
    return undefined;
  }, [state.open]);

  // 换了会话就收起信息面板。
  useEffect(() => {
    setInfoOpen(false);
  }, [state.conversationId]);

  const bayHasDetail = useBayHasDetail();

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
  } else if (state.view === "people") {
    list = <PeopleView onOpenConversation={openConversation} />;
  } else {
    list = <BayView part="list" layout={state.layout} />;
  }

  const listWithTabs = (
    <div className="flex min-h-0 flex-1 flex-col">
      <LeoChatTabs
        active={state.view}
        onSelect={setView}
        badges={{ inbox: unread?.total ?? 0, people: unread?.requests ?? 0, bay: bayNeeds }}
      />
      <div key={state.view} data-im-view-body className="flex min-h-0 flex-1 flex-col">
        {list}
      </div>
    </div>
  );

  const bayParam = bay.current.kind === "feed" ? null : formatBayParam(bay.current);
  const pageHref = leoChatPageHref({
    tab: state.view,
    conversationId: state.conversationId,
    bay: bayParam,
  });

  let detail: ReactNode = null;
  if (state.view === "inbox" && state.conversationId) {
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
  } else if (state.view === "bay") {
    detail = <BayView part="detail" layout={state.layout} />;
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
          if (!state.open) setShown(false);
        }}
        title="LeoChat"
        pageHref={pageHref}
        onOpenPage={() => router.push(pageHref)}
        list={listWithTabs}
        detail={detail}
        showDetail={
          (Boolean(state.conversationId) && state.view === "inbox") ||
          (state.view === "bay" && bayHasDetail)
        }
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
