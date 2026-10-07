"use client";

// 一笔交易一个会话（契约 §0 第 9、13 条）：消息窗的交易会话与 Bay 里的会话是同一个界面。
// 头部：对方、回到主题（服务 / 需求 / 求助 / 订单）、举报与拉黑；顶上固定交易卡；中间消息（文字、文件、报价、灰字）；
// 底部输入框（文字、文件、卖家可发报价）。签约后输入框换成「在项目群里沟通」，合同取消或完成后恢复。

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useUI, type UITranslate } from "../../../i18n/ui/useUI";
import { getUserId } from "../../../lib/auth/client";
import { fetchBayPaymentConfig } from "../../../lib/bay/payments";
import {
  blockDealUser,
  dealConversationId,
  dealSubjectId,
  fetchDealSubjectInfo,
  isDealId,
  listBlockedUserIds,
  unblockDealUser,
  type DealAttachment,
  type DealMessage,
  type DealOffer,
  type DealOfferAction,
  type DealOfferInput,
  type DealSubjectInfo,
} from "../../../lib/bay/threads";
import { openMessages } from "../../messages/host-state";
import { ReportDialog } from "../../messages/report/ReportDialog";
import { openBay, requireBayLogin, type BayLayout, type BayTarget } from "../shell/bay-state";
import { DealCard } from "./DealCard";
import { DealBlockedBar, DealComposer, DealLockedBar } from "./DealComposer";
import { DealMessageList } from "./DealMessageList";
import { DealOfferForm } from "./DealOfferForm";
import { acceptDealOffer, sendDealOffer, sendDealText, settleDealOffer } from "./deal-flows";
import { canOffer, composerLock, dealCardModel, dealRole, latestOffer, resolveViewerId } from "./deal-model";
import { useDealThread } from "./use-deal-thread";

export interface DealConversationViewProps {
  threadId: string;
  layout: BayLayout;
  onBack?: () => void;
}

type ReportTarget = { kind: "message" | "user" | "conversation"; id: string; label?: string };

function errorMessage(error: unknown): string | null {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : null;
}

/** 头部「回到主题」去哪：服务 / 需求 / 求助在 Bay 里打开；订单会话打开订单；私聊打开对方主页。 */
export function subjectTarget(
  kind: string,
  subjectId: string | null,
  contractId: string | null,
  peerHandle: string | null,
): BayTarget | null {
  if (kind === "service" && subjectId) return { kind: "service", id: subjectId };
  if (kind === "demand" && subjectId) return { kind: "demand", id: subjectId };
  if (kind === "handoff" && subjectId) return { kind: "help", id: subjectId };
  if (kind === "contract" && (contractId || subjectId)) return { kind: "order", id: (contractId || subjectId) as string };
  if (peerHandle) return { kind: "profile", handle: peerHandle };
  return null;
}

export function DealConversationView({ threadId, layout, onBack }: DealConversationViewProps) {
  const tt = useUI();
  const validId = isDealId(threadId) ? threadId : null;
  const { state, reload, loadOlder } = useDealThread(validId);
  const [signedInId, setSignedInId] = useState<string | null>(null);
  const [subject, setSubject] = useState<DealSubjectInfo | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyOffer, setBusyOffer] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<{ offerId: string; message: string } | null>(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);

  useEffect(() => {
    let live = true;
    void getUserId()
      .then((id) => {
        if (live) setSignedInId(id);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const thread = state.thread;
  const threadKey = thread ? `${thread.id}|${thread.kind}|${thread.subject_ref ?? ""}|${thread.contract_id ?? ""}` : "";
  useEffect(() => {
    if (!thread) return;
    let live = true;
    void fetchDealSubjectInfo(thread).then((info) => {
      if (live) setSubject(info);
    });
    return () => {
      live = false;
    };
    // 主题只随会话本身变化，不随每次补拉
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey]);

  const peer = thread?.counterparty ?? null;
  const peerId = peer?.user_id ?? null;
  useEffect(() => {
    if (!peerId) return;
    let live = true;
    void listBlockedUserIds()
      .then((ids) => {
        if (live) setBlocked(ids.has(peerId));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [peerId]);

  const summary = state.summary;
  const needsPay = summary?.next_action === "pay";
  useEffect(() => {
    if (!needsPay) return;
    let live = true;
    void fetchBayPaymentConfig()
      .then((config) => {
        if (live) setPaymentReady(Boolean(config.buyer_ready));
      })
      .catch(() => {
        if (live) setPaymentReady(false);
      });
    return () => {
      live = false;
    };
  }, [needsPay]);

  const offersById = useMemo(() => {
    const byId: Record<string, DealOffer> = {};
    for (const offer of state.offers) byId[offer.id] = offer;
    return byId;
  }, [state.offers]);
  const viewerId = useMemo(
    () => resolveViewerId(signedInId, peerId, state.messages, state.offers),
    [signedInId, peerId, state.messages, state.offers],
  );
  const role = thread ? dealRole(thread, subject, viewerId, state.offers) : "unknown";
  const lock = composerLock(summary);
  const offerAllowed = thread ? canOffer(thread, role, lock) && !blocked : false;
  const contractId = summary?.id ?? thread?.contract_id ?? latestOffer(state.offers)?.contract_id ?? null;
  const card = thread
    ? dealCardModel({ thread, summary, offers: state.offers, viewerId, role, subjectTitle: subject?.title, paymentReady })
    : null;
  const subjectId = thread ? dealSubjectId(thread) : null;
  const goSubject = thread ? subjectTarget(thread.kind, subjectId, contractId, peer?.handle ?? null) : null;
  const title = peer?.display_name || thread?.title || tt("交易会话");
  const conversationId = validId ? dealConversationId(validId) : "";
  const currency = summary?.currency || latestOffer(state.offers)?.currency || "usd";
  const termsScope = role === "seller" ? "seller" : "buyer";

  const openOrder = useCallback((id: string) => openBay({ kind: "order", id }), []);

  async function send(body: string, attachments: DealAttachment[]): Promise<boolean> {
    if (!validId) return false;
    setSendError(null);
    try {
      const sent = await sendDealText(validId, body, attachments, termsScope);
      if (sent) await reload(true);
      return sent;
    } catch (error) {
      const message = errorMessage(error);
      setSendError(message ? tt(message) : tt("没发出去，请稍后再试。"));
      throw error;
    }
  }

  async function submitOffer(input: DealOfferInput): Promise<boolean> {
    if (!validId) return false;
    const sent = await sendDealOffer(validId, input);
    if (sent) {
      setNotice(tt("报价已发到会话里。"));
      await reload(true);
    }
    return sent;
  }

  async function actOnOffer(offerId: string, action: DealOfferAction) {
    setBusyOffer(offerId);
    setOfferError(null);
    setNotice(null);
    try {
      if (action === "accept") {
        const result = await acceptDealOffer(offerId);
        if (result.accepted) setNotice(tt("报价已被接受，订单已生成。"));
      } else {
        await settleDealOffer(offerId, action);
      }
      await reload(true);
    } catch (error) {
      const message = errorMessage(error);
      setOfferError({ offerId, message: message ? tt(message) : tt("没成功，请稍后再试。") });
    } finally {
      setBusyOffer(null);
    }
  }

  async function toggleBlock(next: boolean) {
    if (!peerId || blockBusy) return;
    setBlockBusy(true);
    try {
      if (next) await blockDealUser(peerId);
      else await unblockDealUser(peerId);
      setBlocked(next);
      setNotice(next ? tt("对方已被你拉黑。") : tt("已解除拉黑。"));
    } catch (error) {
      const message = errorMessage(error);
      setNotice(message ? tt(message) : tt("没成功，请稍后再试。"));
    } finally {
      setBlockBusy(false);
    }
  }

  const wide = layout === "page" || layout === "full";

  if (!validId) {
    return (
      <div data-deal-view="invalid" className="flex h-full items-center justify-center p-6 text-[13px] text-neutral-500">
        {tt("这个会话打不开。")}
      </div>
    );
  }

  const menu = (
    <details className="relative" data-deal-menu>
      <summary
        aria-label={tt("更多")}
        className="cursor-pointer list-none rounded-lg px-2 py-1 text-[14px] text-neutral-600 hover:bg-neutral-100"
      >
        ⋯
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-neutral-200 bg-white py-1 text-[13px] shadow-lg">
        {peerId ? (
          <button
            type="button"
            data-action="report-user"
            onClick={() => setReport({ kind: "user", id: peerId, label: title })}
            className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50"
          >
            {tt("举报对方")}
          </button>
        ) : null}
        <button
          type="button"
          data-action="report-conversation"
          onClick={() => setReport({ kind: "conversation", id: conversationId, label: title })}
          className="block w-full px-3 py-1.5 text-left hover:bg-neutral-50"
        >
          {tt("举报这个会话")}
        </button>
        {peerId ? (
          <button
            type="button"
            data-action={blocked ? "unblock-user" : "block-user"}
            disabled={blockBusy}
            onClick={() => void toggleBlock(!blocked)}
            className="block w-full px-3 py-1.5 text-left text-red-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            {blocked ? tt("解除拉黑") : tt("拉黑对方")}
          </button>
        ) : null}
      </div>
    </details>
  );

  const header = (
    <header className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
      {onBack && layout !== "full" ? (
        <button
          type="button"
          data-action="back"
          onClick={onBack}
          aria-label={tt("返回")}
          className="rounded-lg px-2 py-1 text-[14px] text-neutral-600 hover:bg-neutral-100"
        >
          ‹
        </button>
      ) : null}
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-[13px] font-semibold text-neutral-700"
      >
        {(title.trim()[0] || "·").toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p data-deal-title className="truncate text-[15px] font-semibold">
          {title}
        </p>
        {goSubject ? (
          <button
            type="button"
            data-deal-subject={goSubject.kind}
            onClick={() => openBay(goSubject)}
            className="block max-w-full truncate text-left text-[11.5px] text-sky-700 hover:text-sky-800"
          >
            {subjectLinkLabel(tt, goSubject.kind, subject?.title || thread?.title || "")}
          </button>
        ) : (
          <p className="text-[11px] text-neutral-500">{tt("交易会话")}</p>
        )}
      </div>
      {menu}
    </header>
  );

  const cardNode = card ? (
    <DealCard
      model={card}
      compact={!wide}
      onOpen={card.contractId ? () => openOrder(card.contractId as string) : goSubject && goSubject.kind !== "profile" ? () => openBay(goSubject) : null}
    />
  ) : null;

  let body: ReactNode;
  if (state.error === "login") {
    body = (
      <div data-deal-error="login" className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-[13px] text-neutral-500">
        <p>{tt("登录后才能查看这个会话。")}</p>
        <button
          type="button"
          data-action="login"
          onClick={() => {
            if (requireBayLogin()) void reload(false);
          }}
          className="rounded-lg bg-neutral-900 px-3 py-1 text-[12px] text-white hover:bg-neutral-800"
        >
          {tt("登录")}
        </button>
      </div>
    );
  } else if (state.error) {
    body = (
      <div data-deal-error={state.error} className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-[13px] text-neutral-500">
        <p>{state.error === "gone" ? tt("这个会话不存在，或你不在其中。") : tt("没能加载这个会话。")}</p>
        {state.error === "load" ? (
          <button
            type="button"
            data-action="retry"
            onClick={() => void reload(false)}
            className="rounded-lg border border-neutral-200 px-3 py-1 text-[12px] text-neutral-700 hover:bg-neutral-50"
          >
            {tt("重试")}
          </button>
        ) : null}
      </div>
    );
  } else if (state.loading) {
    body = (
      <p data-deal-loading className="flex-1 p-6 text-center text-[13px] text-neutral-400">
        {tt("加载中…")}
      </p>
    );
  } else {
    body = (
      <DealMessageList
        messages={state.messages}
        offers={offersById}
        viewerId={viewerId}
        peerName={peer?.display_name}
        contractId={contractId}
        busyOfferId={busyOffer}
        offerError={offerError}
        onOfferAct={(offerId, action) => void actOnOffer(offerId, action)}
        onOpenOrder={openOrder}
        onReport={(message: DealMessage) =>
          setReport({ kind: "message", id: `talent:${message.id}`, label: (message.body || "").slice(0, 60) || tt("这条消息") })
        }
        hasMore={state.hasMore}
        loadingMore={state.loadingMore}
        onLoadMore={() => void loadOlder()}
        emptyHint={offerAllowed ? tt("还没有消息。先打个招呼，谈好了就发一份报价。") : tt("还没有消息，先打个招呼吧。")}
      />
    );
  }

  let footer: ReactNode = null;
  if (!state.error && !state.loading) {
    if (lock.locked && lock.conversationId) {
      const target = lock.conversationId;
      footer = <DealLockedBar onOpenProject={() => openMessages({ conversationId: target })} />;
    } else if (blocked) {
      footer = <DealBlockedBar busy={blockBusy} onUnblock={() => void toggleBlock(false)} />;
    } else {
      footer = (
        <>
          {offerOpen && offerAllowed ? (
            <DealOfferForm
              currency={currency}
              defaultTitle={subject?.title || thread?.title || ""}
              onSubmit={submitOffer}
              onCancel={() => setOfferOpen(false)}
            />
          ) : null}
          <DealComposer
            onSend={send}
            error={sendError}
            canOffer={offerAllowed}
            offerOpen={offerOpen}
            onToggleOffer={() => setOfferOpen((open) => !open)}
          />
        </>
      );
    }
  }

  const banners = (
    <>
      {state.contactHint ? (
        <p data-contact-hint className="bg-amber-50 px-3 py-1.5 text-[12px] text-amber-800">
          {tt("对话里出现了联系方式。站外成交平台不担保，请尽量在平台内完成交易。")}
        </p>
      ) : null}
      {notice ? (
        <p role="status" data-deal-notice className="flex items-center justify-between gap-2 bg-sky-50 px-3 py-1.5 text-[12px] text-sky-800">
          <span>{notice}</span>
          <button type="button" aria-label={tt("关闭")} onClick={() => setNotice(null)} className="text-sky-700 hover:text-sky-900">
            ×
          </button>
        </p>
      ) : null}
    </>
  );

  return (
    <div data-deal-view={layout} className="flex h-full min-h-0 flex-col bg-white text-neutral-900">
      {header}
      {wide ? (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {cardNode ? <div className="border-b border-neutral-100 px-3 py-2 lg:hidden">{cardNode}</div> : null}
            {banners}
            {body}
            {footer}
          </div>
          {cardNode ? (
            <aside data-deal-aside className="hidden w-[300px] shrink-0 border-l border-neutral-200 p-3 lg:block">
              {cardNode}
            </aside>
          ) : null}
        </div>
      ) : (
        <>
          {cardNode ? <div className="border-b border-neutral-100 px-3 py-2">{cardNode}</div> : null}
          {banners}
          {body}
          {footer}
        </>
      )}
      {report ? (
        <ReportDialog
          target={report}
          conversationId={report.kind === "user" ? conversationId : null}
          onClose={() => setReport(null)}
        />
      ) : null}
    </div>
  );
}

function subjectLinkLabel(tt: UITranslate, kind: BayTarget["kind"], title: string): string {
  const name = title.trim();
  switch (kind) {
    case "service":
      return name ? tt("服务：{title}", { title: name }) : tt("查看服务");
    case "demand":
      return name ? tt("需求：{title}", { title: name }) : tt("查看需求");
    case "help":
      return tt("查看求助");
    case "order":
      return name ? tt("订单：{title}", { title: name }) : tt("查看订单");
    case "profile":
      return tt("查看对方主页");
    default:
      return tt("交易会话");
  }
}
