"use client";

// 各站 `/leochat` 整页。属性是合同定的，不许改。栏目和会话读写 host-state；挂上就认领 page 这一处。
// 境内外同一页、同一条代码路径：这里不看域名家族，也不看 LeoBay 在不在本站（2026-10-23：此前境内显示「暂未开放」，与小窗不一致）。
// 登录后左边是聊天列表（最上面固定一行「通知」），右边是会话 / 通知 / 内容处置。
import { useEffect, useSyncExternalStore, type ReactElement } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { accessToken } from "../../lib/auth/client";
import { useImEnabled } from "../../lib/im/client";
import { APP_PAGE_FRAME_CLASS, APP_PAGE_HEADER_ROW_CLASS, APP_PAGE_TITLE_CLASS } from "../AppPageHeader";
import { BaySignInPrompt } from "../bay/shell/BayMine";
import { setBaySiteKey } from "../bay/shell/bay-state";
import { hostState, tabOfView, useMessagesHost } from "../messages/host-state";
import { ensureMessagesSurfaceStyles } from "../messages/messages-surface";
import { useLeoChatUnread } from "../messages/notices/use-notices";
import { consumeCallDeepLink } from "../messages/call/incoming/deep-link";
import { LeoChatBody } from "./leochat-body";
import { LeoChatTabs } from "./LeoChatTabs";

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

const FRAME_CLASS = `${APP_PAGE_FRAME_CLASS} h-[calc(100dvh-1px)]`;

export function LeoChatPage({ siteKey }: LeoChatPageProps): ReactElement {
  const tt = useUI();
  const imOn = useImEnabled();
  const authReady = useAuthSettled();
  const unread = useLeoChatUnread(imOn);
  const state = useMessagesHost();
  const wide = useWide();

  useEffect(() => {
    setBaySiteKey(siteKey);
  }, [siteKey]);

  useEffect(() => {
    ensureMessagesSurfaceStyles();
  }, []);

  useEffect(() => hostState().claimSurface("page"), []);

  const pageState = imOn ? "ready" : authReady ? "signin" : "pending";

  // 通话推送深链 `/leochat?c=<会话>&call=<通话>`（calls-v2 §3.3）：打开该会话，通话仍在进行就弹接听卡片。
  useEffect(() => {
    if (pageState === "ready") consumeCallDeepLink();
  }, [pageState]);

  return (
    <div className={FRAME_CLASS} data-leochat-page={pageState}>
      <header className={APP_PAGE_HEADER_ROW_CLASS}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className={APP_PAGE_TITLE_CLASS}>LeoChat</h1>
          {pageState === "ready" ? (
            <LeoChatTabs
              active={tabOfView(state.view)}
              onSelect={(view) => hostState().setView(view)}
              badges={{ inbox: unread.total, people: unread.requests }}
            />
          ) : null}
        </div>
      </header>
      {pageState === "signin" ? <BaySignInPrompt text={tt("登录后查看聊天和联系人")} /> : null}
      {pageState === "ready" ? (
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-stone-200 bg-white">
          <LeoChatBody wide={wide} />
        </div>
      ) : null}
    </div>
  );
}
