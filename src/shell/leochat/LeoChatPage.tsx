"use client";

// LeoChat 整页：聊天 / 联系人 / LeoBay 三个栏目。标准页框；LeoBay 栏第一次选中后切走只藏不卸。
import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { useImEnabled } from "../../lib/im/client";
import { APP_PAGE_FRAME_CLASS, APP_PAGE_HEADER_ROW_CLASS, APP_PAGE_TITLE_CLASS } from "../AppPageHeader";
import { useBayNeedsAction } from "../bay/shell/BayNavIcon";
import { BaySignInPrompt } from "../bay/shell/BayMine";
import { formatBayParam } from "../bay/shell/bay-links";
import {
  bayEnabledHere,
  bayStateSnapshot,
  registerBayPage,
  setBaySiteKey,
  useBaySignedIn,
  useBayState,
} from "../bay/shell/bay-state";
import { ensureMessagesSurfaceStyles } from "../messages/messages-surface";
import { useImUnread } from "../messages/realtime/hooks";
import { useAuthSettled } from "./auth-settled";
import { LEOCHAT_TAB_PARAM, parseLeoChatConversation, parseLeoChatTab, type LeoChatTab } from "./leochat-links";
import { onLeoChatPageRequest, registerLeoChatPage } from "./page-presence";
import { ChatsSection } from "./page-chats";
import { ContactsSection } from "./page-contacts";
import { LeoBayHeaderActions, LeoBaySection } from "./page-leobay";

export interface LeoChatPageProps {
  siteKey: string;
  /** 站点主色：LeoBay 栏里选中的类目用它填色。 */
  accent?: string;
  /** 地址里没有 ?tab= 时停在哪一栏。缺省 "inbox"；`/bay` 路由传 "bay"。 */
  initialTab?: LeoChatTab;
}

type Availability = "pending" | "on" | "off";

function subscribeNever(): () => void {
  return () => {};
}

function useAvailability(): Availability {
  return useSyncExternalStore(subscribeNever, (): Availability => (bayEnabledHere() ? "on" : "off"), (): Availability => "pending");
}

const FRAME_CLASS = `${APP_PAGE_FRAME_CLASS} h-[calc(100dvh-1px)]`;

function SectionTabs({
  tab,
  onTab,
  chatCount,
  peopleCount,
  bayCount,
}: {
  tab: LeoChatTab;
  onTab: (next: LeoChatTab) => void;
  chatCount: number;
  peopleCount: number;
  bayCount: number;
}): ReactElement {
  const tt = useUI();
  const items: ReadonlyArray<{ id: LeoChatTab; label: string; count: number }> = [
    { id: "inbox", label: tt("聊天"), count: chatCount },
    { id: "people", label: tt("联系人"), count: peopleCount },
    { id: "bay", label: "LeoBay", count: bayCount },
  ];
  return (
    <div role="tablist" aria-label="LeoChat" data-leochat-page-tabs className="inline-flex rounded-xl bg-neutral-100 p-1">
      {items.map((item) => {
        const selected = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            data-leochat-tab={item.id}
            onClick={() => onTab(item.id)}
            className={`rounded-lg px-4 py-1.5 text-[13px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
              selected ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {item.label}
            {item.count > 0 ? (
              <span className="ml-1.5 rounded-full bg-neutral-900 px-1.5 text-[10px] font-semibold leading-4 text-white">
                {item.count > 99 ? "99+" : item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function LeoChatPage({ siteKey, accent, initialTab }: LeoChatPageProps): ReactElement {
  const tt = useUI();
  const availability = useAvailability();
  const imEnabled = useImEnabled();
  const unread = useImUnread();
  const signedIn = useBaySignedIn();
  const bayCount = useBayNeedsAction(signedIn);
  const defaultTab: LeoChatTab = initialTab ?? "inbox";
  const [tab, setTab] = useState<LeoChatTab>(defaultTab);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [highlightSeq, setHighlightSeq] = useState<number | null>(null);
  const [bayVisited, setBayVisited] = useState(defaultTab === "bay");
  const [ready, setReady] = useState(false);
  // 登录态是懒加载的：刚打开页面的那一下还不知道这个人登没登录。查清之前聊天、联系人两栏先空着，
  // 不然已登录的人每次进来都会先看到一眼「请登录」。
  const authSettled = useAuthSettled();
  const seenBayKey = useRef("");
  const { current } = useBayState();
  const bayKey = current.kind === "feed" ? "" : formatBayParam(current);
  const bayBrowsing = current.kind === "feed";

  useEffect(() => {
    setBaySiteKey(siteKey);
  }, [siteKey]);

  // 小窗那份样式（筛选行、未读点、输入框）在整页上也要有：小窗没打开过时它还没注入。
  useEffect(() => {
    ensureMessagesSurfaceStyles();
  }, []);

  // 挂载：登记整页在场、接管 ?bay=，再按地址定栏目。
  useEffect(() => {
    if (availability !== "on") return undefined;
    const offBay = registerBayPage(); // 同步把 ?bay= 读进目标栈
    const offPage = registerLeoChatPage();
    const snap = bayStateSnapshot().current;
    seenBayKey.current = snap.kind === "feed" ? "" : formatBayParam(snap);
    const search = window.location.search;
    const urlTab = parseLeoChatTab(search);
    const urlConversation = parseLeoChatConversation(search);
    if (urlTab) setTab(urlTab);
    else if (seenBayKey.current) setTab("bay");
    else if (urlConversation) setTab("inbox");
    if (urlConversation) setConversationId(urlConversation);
    setReady(true);
    const onPop = () => {
      const next = parseLeoChatTab(window.location.search);
      if (next) setTab(next);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      offPage();
      offBay();
    };
  }, [availability]);

  // 别处要求「打开某个栏目 / 会话」（小窗入口、通知）：整页自己接。
  useEffect(
    () =>
      onLeoChatPageRequest((request) => {
        if (request.tab) setTab(request.tab);
        if (request.conversationId !== undefined) {
          setConversationId(request.conversationId);
          setHighlightSeq(request.seq ?? null);
        }
      }),
    [],
  );

  // 页面上任何地方打开了一条 LeoBay 详情：切到 LeoBay 栏。挂载时地址里本来就带的那一条不算。
  useEffect(() => {
    if (!ready) return;
    if (bayKey && bayKey !== seenBayKey.current) setTab("bay");
    seenBayKey.current = bayKey;
  }, [ready, bayKey]);

  useEffect(() => {
    if (tab === "bay") setBayVisited(true);
  }, [tab]);

  // 把栏目和会话写回地址（replace，不新增历史）；等于本页默认栏目时不写 tab。别的参数（含 bay）原样保留。
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    if (tab === defaultTab) params.delete(LEOCHAT_TAB_PARAM);
    else params.set(LEOCHAT_TAB_PARAM, tab);
    if (tab === "inbox" && conversationId) params.set("im", conversationId);
    else params.delete("im");
    const text = params.toString().replace(/%3A/gi, ":");
    const next = `${window.location.pathname}${text ? `?${text}` : ""}${window.location.hash || ""}`;
    const now = `${window.location.pathname}${window.location.search}${window.location.hash || ""}`;
    if (next === now) return;
    try {
      window.history.replaceState(window.history.state, "", next);
    } catch {
      /* 沙箱里不让改历史：页内照常切换 */
    }
  }, [ready, tab, conversationId, defaultTab]);

  if (availability !== "on") {
    return (
      <div className={FRAME_CLASS} data-leochat-page={availability === "off" ? "unavailable" : "pending"}>
        <header className={APP_PAGE_HEADER_ROW_CLASS}>
          <h1 className={APP_PAGE_TITLE_CLASS}>LeoChat</h1>
        </header>
        {availability === "off" ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="text-[13px] text-neutral-500">{tt("此功能暂未在本站开放")}</p>
          </div>
        ) : null}
      </div>
    );
  }

  const signInPrompt = authSettled ? <BaySignInPrompt text={tt("登录后查看聊天和联系人")} /> : null;

  return (
    <div className={FRAME_CLASS} data-leochat-page={tab}>
      <header className={APP_PAGE_HEADER_ROW_CLASS} data-leochat-page-header>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className={APP_PAGE_TITLE_CLASS}>LeoChat</h1>
          <SectionTabs
            tab={tab}
            onTab={setTab}
            chatCount={unread?.total ?? 0}
            peopleCount={unread?.requests ?? 0}
            bayCount={bayCount}
          />
        </div>
        {tab === "bay" && bayBrowsing ? <LeoBayHeaderActions /> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "inbox" ? (
          imEnabled ? (
            <ChatsSection
              conversationId={conversationId}
              highlightSeq={highlightSeq}
              onOpen={(id, seq) => {
                setConversationId(id);
                setHighlightSeq(seq ?? null);
              }}
              onClose={() => {
                setConversationId(null);
                setHighlightSeq(null);
              }}
            />
          ) : (
            signInPrompt
          )
        ) : null}
        {tab === "people"
          ? imEnabled
            ? (
                <ContactsSection
                  onOpenConversation={(id) => {
                    setConversationId(id);
                    setHighlightSeq(null);
                    setTab("inbox");
                  }}
                />
              )
            : signInPrompt
          : null}
        {bayVisited ? (
          <div className={tab === "bay" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <LeoBaySection accent={accent} active={tab === "bay"} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
