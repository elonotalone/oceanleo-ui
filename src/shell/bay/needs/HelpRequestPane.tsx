"use client";

// 求助详情：认领（先过卖家条款）、只看对方勾选的内容、聊天走交易会话、「去处理」。
// 没登录先登录。用户文字按纯文本。不自带返回栏。

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { formatFen } from "../../../api/talent-handoff";
import {
  cancelBayHandoff,
  claimBayHandoff,
  claimFailureKind,
  getBayHandoff,
  getBayHandoffContext,
  type BayHandoff,
} from "../../../lib/bay/handoffs";
import { useToast } from "../../../ui/Toast";
import { openTradeThread } from "../deal";
import { ensureBayTerms, openBaySettings } from "../settings";
import { openBay, requireBayLogin, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { categoryNameBySlug, useNeedCategories } from "./need-categories";
import { handoffStateText } from "./need-format";
import {
  AttachedWorkBlock,
  BTN_PRIMARY,
  BTN_QUIET,
  BTN_SECONDARY,
  HandleOnSiteLink,
  LoginPrompt,
  PaneBody,
  PaneLoading,
  PaneNotice,
  errorStatus,
  errorText,
  isSellerProfileError,
  useNeedLoader,
} from "./need-ui";

export function HelpRequestPane({ target, siteKey }: BayPaneProps) {
  if (target.kind !== "help" || !target.id) return null;
  return <HelpBody handoffId={target.id} siteKey={siteKey} />;
}

function HelpBody({ handoffId, siteKey }: { handoffId: string; siteKey: string }) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const detail = useNeedLoader(() => getBayHandoff(handoffId), [handoffId, signedIn]);
  const handoff = detail.data?.handoff ?? null;

  if (!signedIn) {
    return (
      <PaneBody pane="help">
        <LoginPrompt message={tt("登录后才能看求助详情、认领或聊天。")} />
      </PaneBody>
    );
  }
  if (detail.loading && !handoff) {
    return (
      <PaneBody pane="help">
        <PaneLoading />
      </PaneBody>
    );
  }
  if (!handoff) {
    const gone = errorStatus(detail.error) === 404;
    return (
      <PaneBody pane="help">
        <PaneNotice tone={gone ? "muted" : "error"}>
          {gone ? tt("这条求助不存在或已结束。") : errorText(tt, detail.error, tt("求助没读出来，请稍后再试。"))}
        </PaneNotice>
      </PaneBody>
    );
  }
  return (
    <PaneBody pane="help">
      <HelpSummary handoff={handoff} />
      <AttachedWorkBlock work={handoff.attached_work} />
      <HandleOnSiteLink currentSite={siteKey} handlingSite={handoff.handling_site} target={{ kind: "help", id: handoff.id }} />
      <GrantedContext handoffId={handoff.id} />
      <HelpActions handoff={handoff} onChanged={detail.reload} />
    </PaneBody>
  );
}

function HelpSummary({ handoff }: { handoff: BayHandoff }) {
  const tt = useUI();
  const { response } = useNeedCategories();
  const category = categoryNameBySlug(tt, handoff.category, response);
  return (
    <div className="space-y-2" data-bay-help-summary>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="whitespace-pre-wrap break-words text-[15px] font-semibold leading-6 text-stone-900">{handoff.brief}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-stone-500">
            <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600">
              {handoffStateText(tt, handoff.state)}
            </span>
            {category ? <span>{category}</span> : null}
            <span>{handoff.mode === "invited" ? tt("指定邀请") : tt("公开求助")}</span>
          </div>
        </div>
        <span className="shrink-0 text-[14px] font-semibold text-stone-900">
          {handoff.budget_fen > 0 ? formatFen(handoff.budget_fen, handoff.currency) : tt("预算面议")}
        </span>
      </div>
    </div>
  );
}

function GrantedContext({ handoffId }: { handoffId: string }) {
  const tt = useUI();
  const ctx = useNeedLoader(() => getBayHandoffContext(handoffId), [handoffId]);
  if (ctx.loading && !ctx.data) return null;
  if (!ctx.data) return null;
  const items = ctx.data.items || [];
  return (
    <section className="space-y-2" data-bay-help-context>
      <h3 className="text-[13px] font-medium text-stone-700">{tt("对方勾选给你看的内容")}</h3>
      {items.length === 0 ? (
        <p className="text-[12px] text-stone-400">{tt("对方没有勾选任何内容；你可以先聊，或等对方补。")}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={`${item.kind}:${item.ref}`} className="rounded-xl border border-stone-200 px-3 py-2">
              <p className="text-[11px] text-stone-400">{item.kind === "artifact" ? tt("产物") : tt("消息")}</p>
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-5 text-stone-700">{item.preview}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function HelpActions({ handoff, onChanged }: { handoff: BayHandoff; onChanged: () => void }) {
  const tt = useUI();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needProfile, setNeedProfile] = useState(false);
  const waiting = handoff.state === "open" || handoff.state === "draft";
  const live = handoff.state === "claimed" || handoff.state === "contracted";

  const claim = async () => {
    if (busy || !requireBayLogin()) return;
    setBusy("claim");
    setError(null);
    setNeedProfile(false);
    try {
      if (!(await ensureBayTerms("seller"))) return;
      const result = await claimBayHandoff(handoff.id);
      toast.success(tt("你接住了这条求助"));
      onChanged();
      if (result.thread_id) openBay({ kind: "conversation", threadId: result.thread_id });
      else await openTradeThread({ kind: "handoff", subjectRef: handoff.id });
    } catch (reason) {
      if (isSellerProfileError(reason)) {
        setNeedProfile(true);
        setError(tt("先建好并公开卖家资料，才能认领求助。"));
        return;
      }
      const kind = claimFailureKind(errorStatus(reason));
      setError(
        kind === "taken"
          ? tt("已经有人接住了")
          : kind === "gone"
            ? tt("这条求助不在了")
            : kind === "not_invited"
              ? tt("这次求助是指定给别人的")
              : errorText(tt, reason, tt("没接住，请稍后再试。")),
      );
    } finally {
      setBusy("");
    }
  };

  const cancel = async () => {
    if (busy || !requireBayLogin()) return;
    setBusy("cancel");
    setError(null);
    try {
      await cancelBayHandoff(handoff.id);
      toast.success(tt("已撤回这次求助"));
      onChanged();
    } catch (reason) {
      setError(errorText(tt, reason, tt("撤回失败，请稍后再试。")));
    } finally {
      setBusy("");
    }
  };

  const chat = async () => {
    if (busy || !requireBayLogin()) return;
    setBusy("chat");
    setError(null);
    try {
      if (handoff.thread_id) openBay({ kind: "conversation", threadId: handoff.thread_id });
      else await openTradeThread({ kind: "handoff", subjectRef: handoff.id });
    } catch (reason) {
      setError(errorText(tt, reason, tt("会话没打开，请稍后再试。")));
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="space-y-2 border-t border-stone-100 pt-4" data-bay-help-actions>
      <div className="flex flex-wrap gap-2">
        {waiting ? (
          <button type="button" className={BTN_PRIMARY} disabled={busy === "claim"} onClick={() => void claim()} data-bay-action="claim">
            {tt("认领这条求助")}
          </button>
        ) : null}
        {live || handoff.thread_id ? (
          <button type="button" className={BTN_SECONDARY} disabled={busy === "chat"} onClick={() => void chat()} data-bay-action="chat">
            {tt("和对方聊")}
          </button>
        ) : null}
        {waiting ? (
          <button type="button" className={BTN_QUIET} disabled={busy === "cancel"} onClick={() => void cancel()} data-bay-action="cancel">
            {tt("撤回这次求助")}
          </button>
        ) : null}
      </div>
      {needProfile ? (
        <PaneNotice
          tone="warn"
          action={
            <button type="button" className={BTN_SECONDARY} onClick={() => openBaySettings("profile")} data-bay-action="profile">
              {tt("去建资料")}
            </button>
          }
        >
          {tt("先建好并公开卖家资料，才能认领求助。")}
        </PaneNotice>
      ) : null}
      {error && !needProfile ? <PaneNotice tone="error">{error}</PaneNotice> : null}
    </section>
  );
}
