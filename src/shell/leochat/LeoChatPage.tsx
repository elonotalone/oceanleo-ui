"use client";

// 各站 `/leochat` 整页。属性是合同定的，不许改。栏目和会话读写 host-state；挂上就认领 page 这一处。
// 境内外同一页、同一条代码路径：这里不看域名家族，也不看 LeoBay 在不在本站（2026-10-23：此前境内显示「暂未开放」，与小窗不一致）。
// 登录后左边是聊天列表（最上面固定一行「通知」），右边是会话 / 通知 / 内容处置。
import { useEffect, useSyncExternalStore, type ReactElement } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { accessToken } from "../../lib/auth/client";
import { useImEnabled } from "../../lib/im/client";
import { IconRightPanelToggle } from "../SplitWorkspace";
import { TaskWorkspaceShell, useTaskWorkspaceState } from "../TaskWorkspaceShell";
import { BaySignInPrompt } from "../bay/shell/BayMine";
import { setBaySiteKey } from "../bay/shell/bay-state";
import { hostState, tabOfView, useMessagesHost } from "../messages/host-state";
import { ensureMessagesSurfaceStyles } from "../messages/messages-surface";
import { useLeoChatUnread } from "../messages/notices/use-notices";
import { consumeCallDeepLink } from "../messages/call/incoming/deep-link";
import { LeoChatBody } from "./leochat-body";
import { LeoChatTabs } from "./LeoChatTabs";
import { RoutePageSkeleton } from "../nav-source/route-boundary";

export interface LeoChatPageProps {
  siteKey: string;
  /** 站点主色；这张页目前不用它，留着是为了各站路由文件的写法和 `/bay` 一样。 */
  accent?: string;
}

let authSettled = false;
let authAsked = false;
const authListeners = new Set<() => void>();

function subscribeAuthSettled(listener: () => void): () => void {
  authListeners.add(listener);
  if (!authAsked) {
    authAsked = true;
    const done = () => {
      authSettled = true;
      for (const each of Array.from(authListeners)) each();
    };
    void accessToken().then(done, done);
  }
  return () => {
    authListeners.delete(listener);
  };
}

/** 服务端与水合首帧为 false；查清之后为 true，不再变回去。 */
function useAuthSettled(): boolean {
  return useSyncExternalStore(subscribeAuthSettled, () => authSettled, () => false);
}

function subscribeWide(onStoreChange: () => void): () => void {
  const mq = window.matchMedia("(min-width: 768px)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function useWide(): boolean {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia("(min-width: 768px)").matches, () => true);
}

const NO_CHAT_TABS = ["bay", "leochat"] as const;

export function LeoChatPage({ siteKey }: LeoChatPageProps): ReactElement {
  const tt = useUI();
  const imOn = useImEnabled();
  const authReady = useAuthSettled();
  const unread = useLeoChatUnread(imOn);
  const state = useMessagesHost();
  const viewportWide = useWide();
  const workspace = useTaskWorkspaceState({ siteKey });
  const wide = viewportWide && !workspace.rightOpen;

  useEffect(() => {
    setBaySiteKey(siteKey);
  }, [siteKey]);

  useEffect(() => {
    ensureMessagesSurfaceStyles();
  }, []);

  useEffect(() => hostState().claimSurface("page"), []);

  const pageState = imOn ? "ready" : authReady ? "signin" : "pending";

  useEffect(() => {
    if (pageState !== "ready" || new URLSearchParams(window.location.search).get("find") !== "1") return;
    hostState().showConversation(null);
    hostState().open({ view: "people" });
  }, [pageState]);

  // 通话推送深链 `/leochat?c=<会话>&call=<通话>`（calls-v2 §3.3）：打开该会话，通话仍在进行就弹接听卡片。
  useEffect(() => {
    if (pageState === "ready") consumeCallDeepLink();
  }, [pageState]);

  const sidebarToggle = (
    <button type="button" onClick={() => workspace.setRightOpen((open) => !open)}
      aria-label={tt(workspace.rightOpen ? "收起" : "展开")}
      aria-expanded={workspace.rightOpen}
      title={tt(workspace.rightOpen ? "收起" : "展开")}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-stone-500 hover:bg-stone-100">
      <IconRightPanelToggle className="h-4 w-4" />
    </button>
  );

  const listHeader = (
    <div data-leochat-list-header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-3 py-2">
      <h1 className="text-[15px] font-semibold text-stone-900">LeoChat</h1>
      <div className="flex items-center gap-1">
        <LeoChatTabs
          active={tabOfView(state.view)}
          onSelect={(view) => hostState().setView(view)}
          badges={{ inbox: unread.total, people: unread.requests }}
        />
        {sidebarToggle}
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100dvh-1px)] w-full min-w-0" data-leochat-page={pageState}>
      <TaskWorkspaceShell
        state={workspace}
        tabs={[]}
        canvas={{ siteId: siteKey, showTemplate: siteKey !== "oceanleo", showLeoChat: false, showBay: false, showMyTasks: true }}
        ignoredWorkspaceTabs={NO_CHAT_TABS}
        fillParent
        soloMaxWidth={null}
        defaultRatio={0.5}
        storageKey="oceanleo_leochat_split"
        library={{ open: workspace.rightOpen, onOpenChange: workspace.setRightOpen, hideToggle: true }}
        left={pageState === "ready" ? (
          <LeoChatBody wide={wide} listHeader={listHeader} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-center justify-between px-3 py-2">
              <h1 className="text-[15px] font-semibold text-stone-900">LeoChat</h1>
              {sidebarToggle}
            </div>
            {pageState === "pending" ? <RoutePageSkeleton variant="list" label={tt("正在加载…")} /> : <BaySignInPrompt text={tt("登录后查看聊天和联系人")} />}
          </div>
        )}
      />
    </div>
  );
}
