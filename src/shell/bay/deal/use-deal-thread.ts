"use client";

// 交易会话的数据：首屏、补拉、加载更早、已读。做法照已提交的交易会话视图：
// 新消息经消息通道即时到达（`useImEvent`，会话 id 是 `talent:<threadId>`）；通道没连上时每 30 秒补一次。

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEAL_PAGE_SIZE,
  dealConversationId,
  fetchDealThread,
  markDealThreadRead,
  type DealContractSummary,
  type DealMessage,
  type DealOffer,
  type DealThread,
  type DealThreadPage,
} from "../../../lib/bay/threads";
import { useImConnection, useImEvent } from "../../messages/realtime/hooks";
import { mergeMessages, sortAscending } from "./deal-model";

export const DEAL_FALLBACK_POLL_MS = 30_000;
const EVENT_RELOAD_DELAY_MS = 250;

export type DealLoadError = "load" | "gone" | "login";

export interface DealThreadState {
  thread: DealThread | null;
  messages: DealMessage[];
  offers: DealOffer[];
  summary: DealContractSummary | null;
  contactHint: boolean;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: DealLoadError | null;
}

export const EMPTY_DEAL_STATE: DealThreadState = {
  thread: null,
  messages: [],
  offers: [],
  summary: null,
  contactHint: false,
  hasMore: false,
  loading: true,
  loadingMore: false,
  error: null,
};

export function loadErrorOf(error: unknown): DealLoadError {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401) return "login";
  if (status === 404 || status === 403) return "gone";
  return "load";
}

/** 一页并进状态：首屏替换；补拉合并（报价与合同摘要用最新的）；更早的一页只并消息。 */
export function applyDealPage(prev: DealThreadState, page: DealThreadPage, mode: "replace" | "merge" | "older"): DealThreadState {
  const fresh = sortAscending(page.messages);
  const messages =
    mode === "replace" ? fresh : mode === "merge" ? mergeMessages(prev.messages, fresh) : mergeMessages(fresh, prev.messages);
  return {
    thread: page.thread?.id ? page.thread : prev.thread,
    messages,
    offers: mode === "older" ? prev.offers : page.offers,
    summary: mode === "older" ? prev.summary : page.contract_summary,
    contactHint: prev.contactHint || page.contact_hint,
    hasMore: mode === "merge" ? prev.hasMore : page.messages.length >= DEAL_PAGE_SIZE,
    loading: false,
    loadingMore: false,
    error: null,
  };
}

export function useDealThread(threadId: string | null) {
  const [state, setState] = useState<DealThreadState>(EMPTY_DEAL_STATE);
  const alive = useRef(true);
  const markedFor = useRef<string | null>(null);
  const oldestRef = useRef<string | null>(null);
  oldestRef.current = state.messages[0]?.created_at ?? null;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(
    async (silent = false) => {
      if (!threadId) return;
      if (!silent) setState((prev) => ({ ...prev, loading: prev.messages.length === 0, error: null }));
      try {
        const page = await fetchDealThread(threadId);
        if (!alive.current) return;
        setState((prev) => applyDealPage(prev, page, silent ? "merge" : "replace"));
        if (typeof document === "undefined" || document.visibilityState !== "hidden") {
          const key = `${threadId}:${page.messages[0]?.id ?? ""}`;
          if (markedFor.current !== key) {
            markedFor.current = key;
            void markDealThreadRead(threadId).catch(() => undefined);
          }
        }
      } catch (error) {
        if (!alive.current || silent) return;
        setState((prev) => ({ ...prev, loading: false, error: loadErrorOf(error) }));
      }
    },
    [threadId],
  );

  const loadOlder = useCallback(async () => {
    const before = oldestRef.current;
    if (!threadId || !before) return;
    setState((prev) => ({ ...prev, loadingMore: true }));
    try {
      const page = await fetchDealThread(threadId, { before });
      if (alive.current) setState((prev) => applyDealPage(prev, page, "older"));
    } catch {
      if (alive.current) setState((prev) => ({ ...prev, loadingMore: false }));
    }
  }, [threadId]);

  useEffect(() => {
    setState(EMPTY_DEAL_STATE);
    markedFor.current = null;
    if (threadId) void reload(false);
  }, [threadId, reload]);

  const wanted = threadId ? dealConversationId(threadId) : "";
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
    if (wanted && event.conversation_id === wanted) scheduleReload();
  });
  useImEvent("message.updated", (event) => {
    if (wanted && event.conversation_id === wanted) scheduleReload();
  });

  const connection = useImConnection();
  useEffect(() => {
    if (!threadId || connection === "open") return;
    const timer = setInterval(() => void reload(true), DEAL_FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [threadId, connection, reload]);

  return { state, reload, loadOlder };
}
