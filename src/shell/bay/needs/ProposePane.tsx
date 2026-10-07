"use client";

// 给一条需求报价：价格、交付天数、说明。提交前先过卖家条款；
// 后端说还没有卖家资料 → 去设置里建。没登录先登录。不自带返回栏。

import { useMemo, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  PROPOSAL_MESSAGE_MAX_LENGTH,
  getDemand,
  parseMoneyInput,
  submitProposal,
  type BayDemandDetail,
} from "../../../lib/bay/demands";
import { useToast } from "../../../ui/Toast";
import { openBaySettings, ensureBayTerms } from "../settings";
import { openBay, requireBayLogin, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { budgetText } from "./need-format";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  Field,
  INPUT,
  LoginPrompt,
  PaneBody,
  PaneLoading,
  PaneNotice,
  errorStatus,
  errorText,
  isSellerProfileError,
  useNeedLoader,
} from "./need-ui";

export function ProposePane({ target }: BayPaneProps) {
  if (target.kind !== "propose" || !target.demandId) return null;
  return <ProposeBody demandId={target.demandId} />;
}

function ProposeBody({ demandId }: { demandId: string }) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  const detail = useNeedLoader(() => getDemand(demandId), [demandId, signedIn]);
  const demand = detail.data?.demand ?? null;

  if (detail.loading && !demand) {
    return (
      <PaneBody pane="propose">
        <PaneLoading />
      </PaneBody>
    );
  }
  if (!demand) {
    const gone = errorStatus(detail.error) === 404;
    return (
      <PaneBody pane="propose">
        <PaneNotice tone={gone ? "muted" : "error"}>
          {gone ? tt("这条需求不存在或已下架。") : errorText(tt, detail.error, tt("需求没读出来，请稍后再试。"))}
        </PaneNotice>
      </PaneBody>
    );
  }
  if (demand.is_owner) {
    return (
      <PaneBody pane="propose">
        <PaneNotice>{tt("这是你自己发的需求，不能给自己报价。")}</PaneNotice>
      </PaneBody>
    );
  }
  if (demand.status !== "open") {
    return (
      <PaneBody pane="propose">
        <PaneNotice>{tt("这条需求已停止接收报价。")}</PaneNotice>
      </PaneBody>
    );
  }
  return (
    <PaneBody pane="propose">
      {!signedIn ? <LoginPrompt message={tt("登录后才能报价。")} /> : null}
      <ProposeForm demand={demand} />
    </PaneBody>
  );
}

function ProposeForm({ demand }: { demand: BayDemandDetail }) {
  const tt = useUI();
  const toast = useToast();
  const mine = demand.my_proposal ?? null;
  const [price, setPrice] = useState(mine && Number.isFinite(mine.price_fen) ? String(mine.price_fen / 100) : "");
  const [days, setDays] = useState(mine?.delivery_days ? String(mine.delivery_days) : "");
  const [message, setMessage] = useState(mine?.message || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needProfile, setNeedProfile] = useState(false);

  const priceFen = useMemo(() => parseMoneyInput(price), [price]);
  const deliveryDays = useMemo(() => {
    const raw = days.trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : Number.NaN;
  }, [days]);

  const submit = async () => {
    if (busy) return;
    if (!requireBayLogin()) return;
    if (Number.isNaN(priceFen) || priceFen === null) {
      setError(tt("请填写报价金额"));
      return;
    }
    if (Number.isNaN(deliveryDays)) {
      setError(tt("交付天数要填大于 0 的整数，或不填"));
      return;
    }
    setError(null);
    setNeedProfile(false);
    if (!(await ensureBayTerms("seller"))) return;
    setBusy(true);
    try {
      await submitProposal(demand.id, {
        price_fen: priceFen,
        delivery_days: deliveryDays,
        message: message.trim().slice(0, PROPOSAL_MESSAGE_MAX_LENGTH),
      });
      toast.success(mine ? tt("报价已更新") : tt("报价已送出"));
      openBay({ kind: "demand", id: demand.id });
    } catch (reason) {
      if (isSellerProfileError(reason)) {
        setNeedProfile(true);
        setError(tt("先建好并公开卖家资料，才能报价。"));
      } else {
        setError(errorText(tt, reason, tt("报价没送出，请稍后再试。")));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-bay-propose>
      <div>
        <p className="text-[13px] font-medium text-stone-800">{demand.title}</p>
        <p className="mt-0.5 text-[12px] text-stone-500">
          {tt("买家预算")} · {budgetText(tt, demand.budget_min_fen, demand.budget_max_fen, demand.currency)}
        </p>
      </div>
      <Field label={tt("你的报价")}>
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          inputMode="decimal"
          placeholder={tt("填金额")}
          className={INPUT}
          data-bay-propose-price
        />
      </Field>
      <Field label={tt("交付天数")} hint={tt("不填就是交期可协商。")}>
        <input
          value={days}
          onChange={(event) => setDays(event.target.value)}
          inputMode="numeric"
          placeholder={tt("例如 5")}
          className={INPUT}
          data-bay-propose-days
        />
      </Field>
      <Field label={tt("方案说明")} hint={`${message.length} / ${PROPOSAL_MESSAGE_MAX_LENGTH}`}>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value.slice(0, PROPOSAL_MESSAGE_MAX_LENGTH))}
          rows={5}
          placeholder={tt("写你会怎么做、以前做过什么、需要对方准备什么")}
          className={`${INPUT} resize-y leading-5`}
          data-bay-propose-message
        />
      </Field>
      {needProfile ? (
        <PaneNotice
          tone="warn"
          action={
            <button type="button" className={BTN_SECONDARY} onClick={() => openBaySettings("profile")} data-bay-action="profile">
              {tt("去建资料")}
            </button>
          }
        >
          {tt("先建好并公开卖家资料，才能报价。")}
        </PaneNotice>
      ) : null}
      {error && !needProfile ? <PaneNotice tone="error">{error}</PaneNotice> : null}
      <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void submit()} data-bay-submit>
        {busy ? tt("正在提交…") : mine ? tt("更新报价") : tt("送出报价")}
      </button>
    </div>
  );
}
