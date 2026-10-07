"use client";

// 收件箱里的 talent 交易会话（work-chat 契约 §8.2、§9.10）。
// 收发、报价、合同都走 talent 现有接口，规则与 talent 站 `/messages` 一模一样；已读未读两边是同一份数据。
// 新消息经消息通道即时到达（`useImEvent`）；通道没连上时每 30 秒补一次。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { ImMessage, ImProfile } from "../../../lib/im/types";
import { useImConnection, useImEvent } from "../realtime/hooks";
import { ImBackIcon, ImMoreIcon } from "../messages-surface";
import { ReportDialog } from "../report/ReportDialog";
import { TalentComposer } from "./TalentComposer";
import { TalentMessageList } from "./TalentMessageList";
import {
  TALENT_PAGE_SIZE,
  actOnTalentOffer,
  counterpartyProfile,
  fetchTalentThread,
  markTalentThreadRead,
  mergeMessages,
  pageToMessages,
  parseTalentConversationId,
  sendTalentMessage,
  talentConversationId,
  talentThreadUrl,
  type TalentOffer,
  type TalentOfferAction,
  type TalentThreadInfo,
  type TalentThreadPage,
} from "./talent-api";

export interface TalentConversationViewProps {
  conversationId: string;
  layout: "docked" | "full" | "mobile";
  onBack?: () => void;
}

const FALLBACK_POLL_MS = 30_000;
const EVENT_RELOAD_DELAY_MS = 250;

/** 我是谁：对方之外的那个人。没发过消息也没有报价时不知道，但那时也没有需要区分「我」的内容。 */
export function inferViewerId(peerId: string | null, messages: ImMessage[], offers: TalentOffer[]): string | null {
  for (const offer of offers) {
    const other = [offer.from_user_id, offer.to_user_id].find((id) => id && id !== peerId);
    if (other) return other;
  }
  for (const message of messages) {
    if (message.sender_kind === "user" && message.sender_id && message.sender_id !== peerId) return message.sender_id;
  }
  return null;
}

interface ThreadState {
  info: TalentThreadInfo | null;
  messages: ImMessage[];
  offers: TalentOffer[];
  contactHint: boolean;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: "load" | "gone" | null;
}

const EMPTY: ThreadState = {
  info: null,
  messages: [],
  offers: [],
  contactHint: false,
  hasMore: false,
  loading: true,
  loadingMore: false,
  error: null,
};

export function useTalentThread(threadId: string | null) {
  const [state, setState] = useState<ThreadState>(EMPTY);
  const alive = useRef(true);
  const markedFor = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const apply = useCallback((page: TalentThreadPage, mode: "replace" | "merge" | "older") => {
    const fresh = pageToMessages(page);
    setState((prev) => {
      const messages =
        mode === "replace" ? fresh : mode === "merge" ? mergeMessages(prev.messages, fresh) : mergeMessages(fresh, prev.messages);
      const offers = mode === "older" ? prev.offers : page.offers || [];
      return {
        info: page.thread || prev.info,
        messages,
        offers,
        contactHint: prev.contactHint || Boolean(page.contact_hint),
        hasMore: mode === "merge" ? prev.hasMore : (page.messages || []).length >= TALENT_PAGE_SIZE,
        loading: false,
        loadingMore: false,
        error: null,
      };
    });
  }, []);

  const reload = useCallback(
    async (silent = false) => {
      if (!threadId) return;
      if (!silent) setState((prev) => ({ ...prev, loading: prev.messages.length === 0, error: null }));
      try {
        const page = await fetchTalentThread(threadId);
        if (!alive.current) return;
        apply(page, silent ? "merge" : "replace");
        if (typeof document === "undefined" || document.visibilityState !== "hidden") {
          const newest = page.messages?.[0]?.id ?? "";
          const key = `${threadId}:${newest}`;
          if (markedFor.current !== key) {
            markedFor.current = key;
            void markTalentThreadRead(threadId).catch(() => undefined);
          }
        }
      } catch (error) {
        if (!alive.current) return;
        const status = (error as { status?: number } | null)?.status;
        if (silent) return;
        setState((prev) => ({ ...prev, loading: false, error: status === 404 ? "gone" : "load" }));
      }
    },
    [threadId, apply],
  );

  const loadOlder = useCallback(async () => {
    if (!threadId) return;
    const oldest = state.messages[0];
    if (!oldest) return;
    setState((prev) => ({ ...prev, loadingMore: true }));
    try {
      const page = await fetchTalentThread(threadId, { before: oldest.created_at });
      if (alive.current) apply(page, "older");
    } catch {
      if (alive.current) setState((prev) => ({ ...prev, loadingMore: false }));
    }
  }, [threadId, state.messages, apply]);

  useEffect(() => {
    setState(EMPTY);
    markedFor.current = null;
    if (threadId) void reload(false);
  }, [threadId, reload]);

  return { state, reload, loadOlder, setState };
}

export function TalentConversationView({ conversationId, layout, onBack }: TalentConversationViewProps) {
  const tt = useUI();
  const threadId = useMemo(() => parseTalentConversationId(conversationId), [conversationId]);
  const { state, reload, loadOlder } = useTalentThread(threadId);
  const connection = useImConnection();
  const [sendError, setSendError] = useState<string | null>(null);
  const [busyOffer, setBusyOffer] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<{ offerId: string; message: string } | null>(null);
  const [report, setReport] = useState<{ kind: "message" | "user" | "conversation"; id: string; label?: string } | null>(null);

  const wanted = threadId ? talentConversationId(threadId) : "";
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = useCallback(() => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      pending.current = null;
      void reload(true);
    }, EVENT_RELOAD_DELAY_MS);
  }, [reload]);
  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  useImEvent("message.created", (event) => {
    if (event.conversation_id === wanted) scheduleReload();
  });
  useImEvent("message.updated", (event) => {
    if (event.conversation_id === wanted) scheduleReload();
  });

  // 通道没连上时 30 秒补一次；连上了就不轮询。
  useEffect(() => {
    if (!threadId || connection === "open") return;
    const timer = setInterval(() => void reload(true), FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [threadId, connection, reload]);

  const peer: ImProfile | null = counterpartyProfile(state.info);
  const peerId = peer?.user_id ?? null;
  const offers = useMemo(() => {
    const byId: Record<string, TalentOffer> = {};
    for (const offer of state.offers) byId[offer.id] = offer;
    return byId;
  }, [state.offers]);
  const viewerId = useMemo(() => inferViewerId(peerId, state.messages, state.offers), [peerId, state.messages, state.offers]);
  const openUrl = threadId ? talentThreadUrl(threadId) : null;
  const title = peer?.display_name || state.info?.title || tt("交易会话");

  async function send(body: string) {
    if (!threadId) return;
    setSendError(null);
    try {
      await sendTalentMessage(threadId, body);
      // 发出去之后立刻补拉：自己的消息与随后到达的事件按 id 去重
      await reload(true);
    } catch (error) {
      const message = (error as { message?: string } | null)?.message;
      setSendError(message || tt("没发出去，请稍后再试。"));
      throw error;
    }
  }

  async function actOnOffer(offerId: string, action: TalentOfferAction) {
    setBusyOffer(offerId);
    setOfferError(null);
    try {
      await actOnTalentOffer(offerId, action);
      await reload(true);
    } catch (error) {
      const message = (error as { message?: string } | null)?.message;
      setOfferError({ offerId, message: message || tt("没成功，请稍后再试。") });
    } finally {
      setBusyOffer(null);
    }
  }

  if (!threadId) {
    return (
      <div data-talent-view="invalid" className="flex h-full items-center justify-center p-6 text-[13px] text-neutral-500">
        {tt("这个会话打不开。")}
      </div>
    );
  }

  return (
    <div data-talent-view={layout} className="flex h-full min-h-0 flex-col text-neutral-900">
      <header className="flex items-center gap-1 border-b border-neutral-200/80 px-2 py-2">
        {onBack && layout !== "full" && (
          <button
            type="button"
            data-action="back"
            data-im-chrome-btn
            onClick={onBack}
            aria-label={tt("返回")}
          >
            <ImBackIcon />
          </button>
        )}
        <div className="min-w-0 flex-1 px-1">
          <p data-talent-title className="truncate text-[13px] font-semibold tracking-tight">
            {title}
          </p>
          <p className="text-[12px] text-neutral-400">{tt("交易会话")}</p>
        </div>
        {openUrl && (
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-talent-open
            className="text-[12px] text-neutral-600 underline-offset-2 hover:underline"
          >
            {tt("在 Bay 打开")}
          </a>
        )}
        <details className="relative">
          <summary
            aria-label={tt("更多")}
            className="cursor-pointer list-none"
            data-im-chrome-btn
          >
            <ImMoreIcon />
          </summary>
          <div className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-neutral-200 bg-white py-1 text-[13px] shadow-lg">
            {peerId && (
              <button
                type="button"
                data-action="report-user"
                onClick={() => setReport({ kind: "user", id: peerId, label: title })}
                className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50"
              >
                {tt("举报对方")}
              </button>
            )}
            <button
              type="button"
              data-action="report-conversation"
              onClick={() => setReport({ kind: "conversation", id: wanted, label: title })}
              className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50"
            >
              {tt("举报这个会话")}
            </button>
          </div>
        </details>
      </header>

      {state.contactHint && (
        <p data-contact-hint className="px-3 py-1.5 text-[12px] text-neutral-500">
          {tt("对话里出现了联系方式。站外成交平台不担保，请尽量在平台内完成交易。")}
        </p>
      )}

      {state.error ? (
        <div data-talent-error={state.error} className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-[13px] text-neutral-500">
          <p>{state.error === "gone" ? tt("这个会话不存在，或你不在其中。") : tt("没能加载这个会话。")}</p>
          {state.error === "load" && (
            <button
              type="button"
              data-action="retry"
              onClick={() => void reload(false)}
              className="rounded-lg border border-neutral-200 px-3 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50"
            >
              {tt("重试")}
            </button>
          )}
        </div>
      ) : state.loading ? (
        <p data-talent-loading className="flex-1 p-6 text-center text-[13px] text-neutral-400">
          {tt("加载中…")}
        </p>
      ) : (
        <TalentMessageList
          messages={state.messages}
          viewerId={viewerId}
          offers={offers}
          onOfferAct={(offerId, action) => void actOnOffer(offerId, action)}
          busyOfferId={busyOffer}
          offerError={offerError}
          openUrl={openUrl}
          hasMore={state.hasMore}
          loadingMore={state.loadingMore}
          onLoadMore={() => void loadOlder()}
          peerName={peer?.display_name}
          onReport={(message) =>
            setReport({
              kind: "message",
              id: `talent:${message.id}`,
              label: (message.body || "").slice(0, 60) || tt("这条消息"),
            })
          }
        />
      )}

      {!state.error && <TalentComposer disabled={state.loading} onSend={send} openUrl={openUrl} error={sendError} />}

      {report && (
        <ReportDialog
          target={report}
          conversationId={report.kind === "user" ? wanted : null}
          onClose={() => setReport(null)}
        />
      )}
    </div>
  );
}
