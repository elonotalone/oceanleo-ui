"use client";

// 全局唯一的消息浮层（每个站挂一次，在 AppShell / 门户外壳里与 SettingsModalHost 并列）。
// 境内站与未登录：什么都不渲染、不连接、不监听深链。
// 浮层里：收件箱 / 联系人 / 搜索 / 设置四个视图 + 右侧会话；同时挂工作回放播放层与邀请对话框。
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useUI } from "../../i18n/ui/useUI";
import { useImEnabled } from "../../lib/im/client";
import { cachedImSettings, refreshImSettingsInBackground } from "../../lib/im/notify-api";
import { DealConversationView } from "../bay/deal";
import { BayGuestHost } from "../bay/shell/BayGuestHost";
import { BayIcon } from "../bay/shell/bay-icons";
import { bayPageHref } from "../bay/shell/bay-expand";
import { BayView } from "../bay/shell/BayView";
import { bayEnabledHere, useBayHasDetail } from "../bay/shell/bay-state";
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
import { SearchView } from "./search/SearchView";
import { SettingsView } from "./SettingsView";
export function isTalentConversationId(id: string): boolean {
  return id.startsWith("talent:");
}

const tabSvg = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-5 w-5",
  "aria-hidden": true,
};

function ViewTabIcon({ view }: { view: MessagesView }) {
  if (view === "bay") {
    return <BayIcon className="h-5 w-5" />;
  }
  if (view === "inbox") {
    return (
      <svg {...tabSvg}>
        <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.4a.6.6 0 0 1-1-.47V16h-.3A2.5 2.5 0 0 1 4 13.5z" />
        <path d="M8.5 9.5h7M8.5 12.5h4.5" />
      </svg>
    );
  }
  if (view === "people") {
    return (
      <svg {...tabSvg}>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19c.6-3.2 2.9-4.8 5.5-4.8s4.9 1.6 5.5 4.8M16 11.2a3 3 0 1 0 0-6M17.5 14.6c1.8.5 3 1.9 3.5 4.4" />
      </svg>
    );
  }
  if (view === "search") {
    return (
      <svg {...tabSvg}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20 20l-4.2-4.2" />
      </svg>
    );
  }
  return (
    <svg {...tabSvg}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  );
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

  if (!enabled) return bayEnabledHere() ? <BayGuestHost /> : null;
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
  const unread = useImUnread();
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

  const tabs: ReadonlyArray<{ id: MessagesView; label: string; badge?: number }> = [
    { id: "inbox", label: "聊天" },
    { id: "bay", label: "Bay" },
    { id: "people", label: "联系人", badge: unread?.requests ?? 0 },
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
      />
    );
  } else if (state.view === "bay") {
    list = <BayView part="list" layout={state.layout} />;
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
    list = <SettingsView onOpenBlocks={() => setView("people")} />;
  }

  const listWithTabs = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label={tt("消息")} data-im-icon-tabs className="flex shrink-0 items-center border-b border-black/10 dark:border-white/10">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-label={tt(tab.label)}
            title={tt(tab.label)}
            aria-selected={state.view === tab.id}
            data-view={tab.id}
            onClick={() => setView(tab.id)}
            className="relative flex flex-1 items-center justify-center py-3"
          >
            <ViewTabIcon view={tab.id} />
            {tab.badge && tab.badge > 0 ? (
              <span className="absolute right-[calc(50%-1.45rem)] top-1 min-w-[1rem] rounded-full bg-neutral-900 px-1 text-center text-[10px] font-semibold leading-4 text-white dark:bg-white dark:text-neutral-900">
                {tab.badge > 99 ? "99+" : tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <div key={state.view} data-im-view-body className="flex min-h-0 flex-1 flex-col">
        {list}
      </div>
    </div>
  );

  let detail: ReactNode = null;
  if (state.conversationId) {
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
        onToggleExpand={
          state.view === "bay"
            ? () => { window.location.assign(bayPageHref()); }
            : () => host.setExpanded(!state.expanded)
        }
        overlayState={overlayState}
        onExitComplete={() => {
          if (!state.open) setShown(false);
        }}
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
