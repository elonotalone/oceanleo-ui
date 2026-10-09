"use client";

// 需求详情。发布者：看报价（接受 / 拒绝 / 和 TA 聊）、编辑、关闭或重新开放、复制邀请链接；
// 别人：报价、联系发布者、看附带作品的只读预览。没登录也能看，点动作先登录。
// 逻辑照 talent 站 DemandDetailView，外壳不搬；用户文字一律纯文本。

import { useMemo, useState } from "react";
import { useUI, type UITranslate } from "../../../i18n/ui/useUI";
import { currentDomainProfile } from "../../../contracts/domain-family";
import {
  acceptProposal,
  bayDemandInvitePath,
  closeDemand,
  createDemandInviteLink,
  declineProposal,
  getDemand,
  listProposals,
  reopenDemand,
  revokeDemandInviteLink,
  withdrawProposal,
  type BayDemandDetail,
  type BayProposal,
} from "../../../lib/bay/demands";
import { useToast } from "../../../ui/Toast";
import { openMessages } from "../../messages/host-state";
import { openTradeThread } from "../deal";
import { ensureBayTerms } from "../settings";
import { openBay, requireBayLogin, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { DemandEditor } from "./DemandEditor";
import { categoryNameBySlug, useNeedCategories } from "./need-categories";
import {
  authorName,
  budgetText,
  deadlineText,
  deliveryDaysText,
  demandStatusText,
  levelText,
  proposalStatusText,
  ratingText,
  timeAgoText,
} from "./need-format";
import { safeHttpLink } from "./need-links";
import {
  AttachedWorkBlock,
  BTN_PRIMARY,
  BTN_QUIET,
  BTN_SECONDARY,
  HandleOnSiteLink,
  INPUT,
  PaneBody,
  PaneLoading,
  PaneNotice,
  errorStatus,
  errorText,
  useNeedLoader,
} from "./need-ui";

const CLOSE_REASON_MAX = 500;

/** 邀请链接给出去的是门户上的绝对地址（W10 的公开页）；token 不安全就不给。 */
export function demandInviteUrl(token: string | null | undefined): string | null {
  const path = bayDemandInvitePath(String(token || ""));
  if (!path) return null;
  try {
    return `${currentDomainProfile().portalOrigin.replace(/\/+$/, "")}${path}`;
  } catch {
    return null;
  }
}

/** 报价排序：还在等回复的在前，其余按报价时间。 */
export function sortProposals(items: readonly BayProposal[]): BayProposal[] {
  return [...items].sort((a, b) => {
    const pending = Number(b.status === "pending") - Number(a.status === "pending");
    if (pending) return pending;
    return Date.parse(a.created_at || "") - Date.parse(b.created_at || "") || 0;
  });
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* 落到手动复制 */
  }
  return false;
}

async function openDealAfterAccept(contract: { id: string; thread_id?: string | null }): Promise<void> {
  if (contract.thread_id) {
    openMessages({ conversationId: "talent:" + contract.thread_id });
    return;
  }
  try {
    await openTradeThread({ kind: "contract", subjectRef: contract.id });
  } catch {
    openBay({ kind: "order", id: contract.id });
  }
}

export function DemandPane({ target, siteKey }: BayPaneProps) {
  if (target.kind !== "demand" || !target.id) return null;
  return <DemandPaneBody demandId={target.id} siteKey={siteKey} />;
}

function DemandPaneBody({ demandId, siteKey }: { demandId: string; siteKey: string }) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const [editing, setEditing] = useState(false);
  // 登录态变了要重取：`is_owner`、`my_proposal`、附带作品的预览地址都只对登录的人给。
  const detail = useNeedLoader(() => getDemand(demandId), [demandId, signedIn]);
  const demand = detail.data?.demand ?? null;

  if (detail.loading && !demand) {
    return (
      <PaneBody pane="demand">
        <PaneLoading />
      </PaneBody>
    );
  }
  if (!demand) {
    const gone = errorStatus(detail.error) === 404;
    return (
      <PaneBody pane="demand">
        <PaneNotice
          tone={gone ? "muted" : "error"}
          action={
            gone ? null : (
              <button type="button" className={BTN_SECONDARY} onClick={detail.reload}>
                {tt("重试")}
              </button>
            )
          }
        >
          {gone ? tt("这条需求不存在或已下架。") : errorText(tt, detail.error, tt("需求没读出来，请稍后再试。"))}
        </PaneNotice>
      </PaneBody>
    );
  }
  if (editing && demand.is_owner) {
    return (
      <PaneBody pane="demand-edit">
        <DemandEditor
          siteKey={siteKey}
          initial={demand}
          onDone={() => {
            setEditing(false);
            detail.reload();
          }}
          onCancel={() => setEditing(false)}
        />
      </PaneBody>
    );
  }
  return (
    <PaneBody pane="demand">
      <DemandSummary demand={demand} />
      <AttachedWorkBlock work={demand.attached_work} />
      <HandleOnSiteLink currentSite={siteKey} handlingSite={demand.handling_site} target={{ kind: "demand", id: demand.id }} />
      {demand.is_owner ? (
        <OwnerSection demand={demand} onEdit={() => setEditing(true)} onChanged={detail.reload} />
      ) : (
        <VisitorSection demand={demand} signedIn={signedIn} onChanged={detail.reload} />
      )}
    </PaneBody>
  );
}

function DemandSummary({ demand }: { demand: BayDemandDetail }) {
  const tt = useUI();
  const { response } = useNeedCategories();
  const category = categoryNameBySlug(tt, demand.category, response);
  const links = (demand.reference_links || []).map((href) => safeHttpLink(href)).filter((href): href is string => Boolean(href));
  const buyer = demand.buyer;
  return (
    <div className="space-y-3" data-bay-demand-summary>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-[16px] font-semibold leading-6 text-stone-900">{demand.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-stone-500">
            <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600" data-bay-demand-status={demand.status}>
              {demandStatusText(tt, demand.status)}
            </span>
            {category ? <span>{category}</span> : null}
            <span>{deadlineText(tt, demand.deadline_at)}</span>
            <span>{tt("{n} 份报价", { n: Math.max(0, Number(demand.proposal_count) || 0) })}</span>
          </div>
        </div>
        <span className="shrink-0 text-[14px] font-semibold text-stone-900">
          {budgetText(tt, demand.budget_min_fen, demand.budget_max_fen, demand.currency)}
        </span>
      </div>
      {demand.skills?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {demand.skills.map((skill) => (
            <span key={skill} className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">
              {skill}
            </span>
          ))}
        </div>
      ) : null}
      <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-stone-700">
        {demand.description || tt("发布者还没有补充详细说明。")}
      </p>
      {demand.supplemental_notes ? (
        <div className="rounded-xl bg-stone-50 px-3 py-2.5">
          <p className="text-[12px] font-medium text-stone-700">{tt("补充说明")}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-5 text-stone-600">{demand.supplemental_notes}</p>
        </div>
      ) : null}
      {links.length ? (
        <div>
          <p className="text-[12px] font-medium text-stone-700">{tt("参考链接")}</p>
          <ul className="mt-1 space-y-0.5">
            {links.map((href) => (
              <li key={href}>
                <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-[12px] font-medium text-stone-900 underline underline-offset-2">
                  {href}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {demand.close_reason ? (
        <p className="rounded-xl bg-stone-100 px-3 py-2 text-[12px] text-stone-600">
          {tt("关闭原因：{reason}", { reason: demand.close_reason })}
        </p>
      ) : null}
      <div className="flex items-center gap-2 text-[12px] text-stone-500">
        <span>{tt("发布者")}</span>
        {buyer?.handle ? (
          <button
            type="button"
            className="font-medium text-stone-700 hover:underline"
            onClick={() => openBay({ kind: "profile", handle: buyer.handle as string })}
          >
            {authorName(tt, buyer)}
          </button>
        ) : (
          <span className="font-medium text-stone-700">{authorName(tt, buyer)}</span>
        )}
        {demand.created_at ? <span>· {timeAgoText(tt, demand.created_at)}</span> : null}
      </div>
    </div>
  );
}

function VisitorSection({
  demand,
  signedIn,
  onChanged,
}: {
  demand: BayDemandDetail;
  signedIn: boolean;
  onChanged: () => void;
}) {
  const tt = useUI();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mine = demand.my_proposal ?? null;
  const open = demand.status === "open";

  const propose = () => {
    if (!requireBayLogin()) return;
    openBay({ kind: "propose", demandId: demand.id });
  };

  const contact = async () => {
    if (busy || !requireBayLogin()) return;
    setBusy("contact");
    setError(null);
    try {
      await openTradeThread({ kind: "demand", subjectRef: demand.id, userId: demand.user_id });
    } catch (reason) {
      setError(errorText(tt, reason, tt("会话没打开，请稍后再试。")));
    } finally {
      setBusy("");
    }
  };

  const withdraw = async () => {
    if (!mine || busy || !requireBayLogin()) return;
    setBusy("withdraw");
    setError(null);
    try {
      await withdrawProposal(mine.id);
      toast.success(tt("报价已撤回"));
      onChanged();
    } catch (reason) {
      setError(errorText(tt, reason, tt("撤回失败，请稍后再试。")));
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="space-y-3 border-t border-stone-100 pt-4" data-bay-demand-visitor>
      {mine ? (
        <div className="rounded-xl border border-stone-200 px-3 py-2.5" data-bay-my-proposal={mine.status}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-stone-800">{tt("我的报价")}</p>
            <span className="text-[11px] text-stone-500">{proposalStatusText(tt, mine.status)}</span>
          </div>
          <p className="mt-1 text-[13px] text-stone-700">
            {budgetText(tt, mine.price_fen, mine.price_fen, mine.currency)} · {deliveryDaysText(tt, mine.delivery_days)}
          </p>
          {mine.message ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] text-stone-500">{mine.message}</p> : null}
        </div>
      ) : null}
      {!signedIn ? <p className="text-[12px] text-stone-500">{tt("登录后可以报价、联系发布者；报价只有发布者看得到。")}</p> : null}
      <div className="flex flex-wrap gap-2">
        {open ? (
          <button type="button" className={BTN_PRIMARY} onClick={propose} data-bay-action="propose">
            {mine ? tt("修改报价") : tt("报价")}
          </button>
        ) : null}
        <button type="button" className={BTN_SECONDARY} disabled={busy === "contact"} onClick={() => void contact()} data-bay-action="contact">
          {tt("联系发布者")}
        </button>
        {mine?.status === "pending" ? (
          <button type="button" className={BTN_QUIET} disabled={busy === "withdraw"} onClick={() => void withdraw()} data-bay-action="withdraw">
            {tt("撤回报价")}
          </button>
        ) : null}
      </div>
      {!open ? <p className="text-[12px] text-stone-400">{tt("这条需求已停止接收报价。")}</p> : null}
      {error ? <PaneNotice tone="error">{error}</PaneNotice> : null}
    </section>
  );
}

function OwnerSection({
  demand,
  onEdit,
  onChanged,
}: {
  demand: BayDemandDetail;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const tt = useUI();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState("");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const proposals = useNeedLoader(() => listProposals(demand.id), [demand.id]);
  const sorted = useMemo(() => sortProposals(proposals.data?.items || []), [proposals.data]);
  const editable = demand.status === "open" || demand.status === "draft";

  const run = async (key: string, work: () => Promise<void>, fallback: string) => {
    if (busy || !requireBayLogin()) return;
    setBusy(key);
    setError(null);
    try {
      await work();
    } catch (reason) {
      setError(errorText(tt, reason, fallback));
    } finally {
      setBusy("");
    }
  };

  const accept = (proposal: BayProposal) =>
    run(
      proposal.id,
      async () => {
        if (!(await ensureBayTerms("buyer"))) return;
        const { contract } = await acceptProposal(proposal.id);
        toast.success(tt("已生成合同草稿，还没有付款"));
        onChanged();
        await openDealAfterAccept(contract);
      },
      tt("接受报价失败，请稍后再试。"),
    );

  const decline = (proposal: BayProposal) =>
    run(
      proposal.id,
      async () => {
        await declineProposal(proposal.id);
        toast.success(tt("已拒绝这条报价，不会群发落选通知"));
        proposals.reload();
      },
      tt("操作失败，请稍后再试。"),
    );

  const chat = (proposal: BayProposal) =>
    run(
      `chat:${proposal.id}`,
      () => openTradeThread({ kind: "demand", subjectRef: demand.id, userId: proposal.user_id }),
      tt("会话没打开，请稍后再试。"),
    );

  const confirmClose = () => {
    const text = reason.trim();
    if (!text) {
      setError(tt("请写一句关闭原因"));
      return;
    }
    void run(
      "close",
      async () => {
        await closeDemand(demand.id, text);
        toast.success(tt("需求已关闭"));
        setClosing(false);
        setReason("");
        onChanged();
      },
      tt("关闭失败，请稍后再试。"),
    );
  };

  const reopen = () =>
    run(
      "reopen",
      async () => {
        if (!(await ensureBayTerms("buyer"))) return;
        await reopenDemand(demand.id);
        toast.success(tt("需求已重新开放"));
        onChanged();
      },
      tt("操作失败，请稍后再试。"),
    );

  const copyInvite = () =>
    run(
      "invite",
      async () => {
        const existing = demand.invite && !demand.invite.claimed ? demand.invite.token : null;
        const token = existing || (await createDemandInviteLink(demand.id)).invite?.token || null;
        const url = demandInviteUrl(token);
        if (!url) throw new Error(tt("邀请链接没生成出来，请稍后再试。"));
        setInviteUrl(url);
        if (await copyText(url)) toast.success(tt("邀请链接已复制"));
      },
      tt("邀请链接没生成出来，请稍后再试。"),
    );

  const revokeInvite = () =>
    run(
      "revoke",
      async () => {
        await revokeDemandInviteLink(demand.id);
        setInviteUrl(null);
        toast.success(tt("邀请链接已作废"));
        onChanged();
      },
      tt("操作失败，请稍后再试。"),
    );

  return (
    <>
      <section className="space-y-2 border-t border-stone-100 pt-4" data-bay-demand-owner>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <button type="button" className={BTN_SECONDARY} onClick={onEdit} data-bay-action="edit">
              {tt("编辑需求")}
            </button>
          ) : null}
          {demand.status === "open" ? (
            <button type="button" className={BTN_SECONDARY} disabled={busy === "invite"} onClick={() => void copyInvite()} data-bay-action="invite">
              {tt("复制邀请链接")}
            </button>
          ) : null}
          {demand.status === "open" ? (
            <button type="button" className={BTN_QUIET} onClick={() => setClosing((value) => !value)} data-bay-action="close">
              {tt("关闭需求")}
            </button>
          ) : null}
          {demand.status === "closed" ? (
            <button type="button" className={BTN_SECONDARY} disabled={busy === "reopen"} onClick={() => void reopen()} data-bay-action="reopen">
              {tt("重新开放")}
            </button>
          ) : null}
        </div>
        {inviteUrl ? (
          <div className="space-y-1.5 rounded-xl border border-stone-200 px-3 py-2.5" data-bay-invite-url>
            <p className="text-[12px] text-stone-600">{tt("把这个链接发给你认识的人，对方打开就能看到这条需求并报价。链接只能被领取一次。")}</p>
            <input readOnly value={inviteUrl} className={INPUT} onFocus={(event) => event.currentTarget.select()} aria-label={tt("邀请链接")} />
            <button type="button" className={BTN_QUIET} disabled={busy === "revoke"} onClick={() => void revokeInvite()}>
              {tt("作废这个链接")}
            </button>
          </div>
        ) : null}
        {closing ? (
          <div className="space-y-2 rounded-xl border border-stone-200 px-3 py-2.5" data-bay-close-form>
            <p className="text-[12px] text-stone-600">{tt("写一句原因，报过价的人能知道这条需求为什么不再开放。")}</p>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, CLOSE_REASON_MAX))}
              rows={3}
              placeholder={tt("例如：计划调整，暂时不找人做了")}
              className={`${INPUT} resize-none`}
            />
            <div className="flex gap-2">
              <button type="button" className={BTN_PRIMARY} disabled={busy === "close"} onClick={confirmClose}>
                {busy === "close" ? tt("正在关闭…") : tt("确认关闭")}
              </button>
              <button type="button" className={BTN_SECONDARY} onClick={() => setClosing(false)}>
                {tt("取消")}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-2" data-bay-proposals>
        <div>
          <h3 className="text-[14px] font-semibold text-stone-900">{tt("收到的报价")}</h3>
          <p className="mt-0.5 text-[12px] text-stone-500">{tt("只有你看得到这些报价。拒绝只处理这一条，不群发落选消息。")}</p>
        </div>
        {proposals.loading && !proposals.data ? <PaneLoading /> : null}
        {proposals.error && !proposals.data ? (
          <PaneNotice
            tone="warn"
            action={
              <button type="button" className={BTN_SECONDARY} onClick={proposals.reload}>
                {tt("重试")}
              </button>
            }
          >
            {errorText(tt, proposals.error, tt("报价没读出来，请稍后再试。"))}
          </PaneNotice>
        ) : null}
        {proposals.data && sorted.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-200 py-6 text-center text-[12px] text-stone-500">
            {tt("还没有人报价。可以先复制邀请链接发给认识的人。")}
          </p>
        ) : null}
        <ul className="space-y-2">
          {sorted.map((proposal) => (
            <ProposalRow
              key={proposal.id}
              tt={tt}
              proposal={proposal}
              busy={busy === proposal.id || busy === `chat:${proposal.id}`}
              onAccept={() => void accept(proposal)}
              onDecline={() => void decline(proposal)}
              onChat={() => void chat(proposal)}
            />
          ))}
        </ul>
      </section>
      {error ? <PaneNotice tone="error">{error}</PaneNotice> : null}
    </>
  );
}

function ProposalRow({
  tt,
  proposal,
  busy,
  onAccept,
  onDecline,
  onChat,
}: {
  tt: UITranslate;
  proposal: BayProposal;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onChat: () => void;
}) {
  const seller = proposal.seller;
  return (
    <li className="rounded-xl border border-stone-200 px-3 py-2.5" data-bay-proposal={proposal.status}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {seller?.handle ? (
            <button
              type="button"
              className="truncate text-[13px] font-semibold text-stone-900 hover:underline"
              onClick={() => openBay({ kind: "profile", handle: seller.handle as string })}
            >
              {authorName(tt, seller)}
            </button>
          ) : (
            <p className="truncate text-[13px] font-semibold text-stone-900">{authorName(tt, seller)}</p>
          )}
          <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-stone-500">
            <span>{levelText(tt, seller?.level)}</span>
            <span>{ratingText(tt, seller?.rating_avg, seller?.rating_count)}</span>
            <span>{tt("{n} 单完成", { n: Math.max(0, Number(seller?.completed_contracts) || 0) })}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[14px] font-semibold text-stone-900">{budgetText(tt, proposal.price_fen, proposal.price_fen, proposal.currency)}</p>
          <p className="text-[11px] text-stone-500">{deliveryDaysText(tt, proposal.delivery_days)}</p>
        </div>
      </div>
      {proposal.message ? (
        <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-[12px] leading-5 text-stone-700">{proposal.message}</p>
      ) : (
        <p className="mt-2 text-[12px] text-stone-400">{tt("没有写方案说明")}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {proposal.status === "pending" ? (
          <>
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={onAccept} data-bay-action="accept">
              {tt("接受并生成合同")}
            </button>
            <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={onDecline} data-bay-action="decline">
              {tt("拒绝")}
            </button>
          </>
        ) : (
          <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">{proposalStatusText(tt, proposal.status)}</span>
        )}
        <button type="button" className={BTN_QUIET} disabled={busy} onClick={onChat} data-bay-action="chat">
          {tt("和 TA 聊")}
        </button>
      </div>
    </li>
  );
}
