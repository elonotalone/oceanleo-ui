"use client";

// 各站 `/leochat` 整页。属性是合同定的，不许改。栏目和会话读写 host-state；可用时认领 page 这一处。
import { useEffect, useSyncExternalStore, type ReactElement } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { accessToken } from "../../lib/auth/client";
import { useImEnabled } from "../../lib/im/client";
import { APP_PAGE_FRAME_CLASS, APP_PAGE_HEADER_ROW_CLASS, APP_PAGE_TITLE_CLASS } from "../AppPageHeader";
import { BaySignInPrompt } from "../bay/shell/BayMine";
import { bayEnabledHere, setBaySiteKey } from "../bay/shell/bay-state";
import { hostState, useMessagesHost } from "../messages/host-state";
import { ensureMessagesSurfaceStyles } from "../messages/messages-surface";
import { useImUnread } from "../messages/realtime/hooks";
import { LeoChatBody } from "./leochat-body";
import { LeoChatTabs } from "./LeoChatTabs";

export interface LeoChatPageProps {
  siteKey: string;
  /** 站点主色；这张页目前不用它，留着是为了各站路由文件的写法和 `/bay` 一样。 */
  accent?: string;
}

type Availability = "pending" | "on" | "off";

function subscribeNever(): () => void {
  return () => {};
}

function useAvailability(): Availability {
  return useSyncExternalStore(
    subscribeNever,
    (): Availability => (bayEnabledHere() ? "on" : "off"),
    (): Availability => "pending",
  );
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
  const availability = useAvailability();
  const imOn = useImEnabled();
  const authReady = useAuthSettled();
  const unread = useImUnread();
  const state = useMessagesHost();
  const wide = useWide();
  const available = availability === "on";

  useEffect(() => {
    setBaySiteKey(siteKey);
  }, [siteKey]);

  useEffect(() => {
    ensureMessagesSurfaceStyles();
  }, []);

  useEffect(() => {
    if (!available) return undefined;
    return hostState().claimSurface("page");
  }, [available]);

  const pageState =
    availability === "off" ? "unavailable" : availability === "pending" ? "pending" : imOn ? "ready" : authReady ? "signin" : "pending";

  return (
    <div className={FRAME_CLASS} data-leochat-page={pageState}>
      <header className={APP_PAGE_HEADER_ROW_CLASS}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className={APP_PAGE_TITLE_CLASS}>LeoChat</h1>
          {pageState === "ready" ? (
            <LeoChatTabs
              active={state.view}
              onSelect={(view) => hostState().setView(view)}
              badges={{ inbox: unread?.total ?? 0, people: unread?.requests ?? 0 }}
            />
          ) : null}
        </div>
      </header>
      {pageState === "unavailable" ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <p className="text-[13px] text-stone-500">{tt("此功能暂未在本站开放")}</p>
        </div>
      ) : null}
      {pageState === "signin" ? <BaySignInPrompt text={tt("登录后查看聊天和联系人")} /> : null}
      {pageState === "ready" ? (
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-stone-200 bg-white">
          <LeoChatBody wide={wide} />
        </div>
      ) : null}
    </div>
  );
}
