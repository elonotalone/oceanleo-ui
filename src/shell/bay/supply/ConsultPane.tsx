"use client";

// 答疑详情与预约（移植自 talent `app/consults/[id]/page.tsx`，外壳不搬）。
// 上面是知识区（能问什么、不能问什么、答疑口径），里面没有任何按钮；下面是预约区（价格、轮次或时长、回复时限、预约）。
// 医疗、法律、宠物医疗三个领域第一版不上架：遇到这些领域只显示「暂未开放」，不显示价格、不给预约（契约 §0 第 10 条）。
// 需执业核验的领域缺答疑口径时不开放预约（fail-closed），也绝不在前端编一段合规文案顶上去。

import { useState } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import type { UITranslate } from "../../../i18n/ui/useUI";
import {
  bookBayConsult,
  consultUnavailable,
  getBayConsult,
  getBayDomainPrompts,
  inlineDomainPrompts,
  listBayDomains,
  type BayConsult,
  type BayDomain,
} from "../../../lib/bay/consults";
import { loadBayPaymentConfig } from "../../../lib/bay/checkout";
import { profileDisplayName } from "../../../lib/bay/directory";
import { ensureBayTerms } from "../settings";
import { openBay, requireBayLogin, type BayPaneProps } from "../shell/bay-state";
import { consultPriceText, consultScopeText } from "./format";
import { PaneLoading, PaneMessage, PracticeLine } from "./parts";
import { errorText, useBayResource } from "./use-bay-resource";

export function ConsultPane({ target }: BayPaneProps) {
  const tt = useUI();
  const consultId = target.kind === "consult" ? target.id : "";
  const consult = useBayResource(consultId ? `consult:${consultId}` : null, () => getBayConsult(consultId).then((data) => data.consult));
  const domains = useBayResource("bay-consult-domains", listBayDomains);
  const payment = useBayResource("bay-payment-config", loadBayPaymentConfig);
  if (!consultId) return null;
  if (consult.loading) return <PaneLoading />;
  if (!consult.data) {
    const text = consult.status === 404 || !consult.error ? tt("这条答疑不存在或已下架") : tt(consult.error);
    return <PaneMessage text={text} onRetry={consult.reload} />;
  }
  if (consultUnavailable(consult.data)) return <PaneMessage text={tt("这个领域的答疑暂未开放")} />;
  const domain = (domains.data || []).find((item) => item.key === consult.data?.regulated_domain) || null;
  return <ConsultDetailView consult={consult.data} domain={domain} domainsLoading={domains.loading} buyerReady={payment.data?.buyer_ready === true} />;
}

function domainLabel(tt: UITranslate, key: string, fallback: string): string {
  switch (key) {
    case "tax":
      return tt("税务");
    case "psych":
      return tt("心理");
    case "edu_adult":
      return tt("成人教育");
    case "career":
      return tt("职业发展");
    case "research":
      return tt("科研");
    case "none":
      return tt("通用");
    default:
      return fallback;
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-white px-2.5 py-2">
      <dt className="text-[11px] text-neutral-500">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] font-medium text-neutral-900">{value}</dd>
    </div>
  );
}

export interface ConsultDetailViewProps {
  consult: BayConsult;
  domain: BayDomain | null;
  domainsLoading?: boolean;
  /** 付款是否就绪；没取到按没就绪写。预约只建合同，付款在订单里。 */
  buyerReady?: boolean;
}

export function ConsultDetailView({ consult, domain, domainsLoading = false, buyerReady = false }: ConsultDetailViewProps) {
  const tt = useUI();
  const inline = inlineDomainPrompts(domain);
  const needsFetch = Boolean(domain?.key) && !inline;
  const fetched = useBayResource(needsFetch && domain ? `consult-prompts:${domain.key}` : null, () => getBayDomainPrompts(domain?.key || ""));
  const prompts = inline || fetched.data;
  const promptsLoading = domainsLoading || fetched.loading;
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  if (consultUnavailable(consult)) return <PaneMessage text={tt("这个领域的答疑暂未开放")} />;

  const gated = Boolean(domain?.gated);
  const forbidden = (prompts?.forbidden_hint || domain?.forbidden_hint || "").trim();
  const disclaimer = (prompts?.answer_disclaimer || domain?.answer_disclaimer || "").trim();
  const disclaimerMissing = gated && !disclaimer && !promptsLoading;
  const waitingPrompts = !disclaimer && promptsLoading && (gated || !domain);
  const blocked = consult.status !== "published" ? tt("暂不接受预约") : disclaimerMissing ? tt("这个领域的答疑口径还没有下发，暂时不能预约") : "";
  const seller = consult.seller;
  const sellerName = profileDisplayName(seller);

  async function book() {
    if (booking || blocked || waitingPrompts || !requireBayLogin()) return;
    setError("");
    setNotice("");
    let accepted = false;
    try {
      accepted = await ensureBayTerms("buyer");
    } catch {
      accepted = false;
    }
    if (!accepted) return;
    setBooking(true);
    try {
      const result = await bookBayConsult(consult.id);
      if (result?.contract?.id) openBay({ kind: "order", id: result.contract.id });
      else if (result?.thread_id) openBay({ kind: "conversation", threadId: result.thread_id });
      else setNotice(tt("已建立答疑合同，接下来在会话里进行"));
    } catch (err) {
      setError(errorText(err) || tt("预约没成功，请稍后再试。"));
    } finally {
      setBooking(false);
    }
  }

  return (
    <div data-bay-pane="consult" className="p-4">
      <header>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md border border-neutral-200 px-2 py-0.5 text-[11px] text-neutral-600">{tt("答疑")}</span>
          {domain ? <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-700">{domainLabel(tt, domain.key, domain.name_zh)}</span> : null}
          {gated ? <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">{tt("需执业资质核验的领域")}</span> : null}
        </div>
        <h2 className="mt-2 break-words text-[18px] font-semibold text-neutral-950">{consult.title}</h2>
      </header>

      <div data-zone="knowledge" className="mt-4 space-y-3">
        <section className="rounded-xl border border-neutral-200 p-3">
          <h3 className="text-[13px] font-semibold text-neutral-900">{tt("能问什么")}</h3>
          {consult.summary ? <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-neutral-700">{consult.summary}</p> : null}
          {consult.scope_note ? <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] text-neutral-600">{consult.scope_note}</p> : null}
        </section>
        {forbidden ? (
          <section className="rounded-xl border border-neutral-200 p-3">
            <h3 className="text-[13px] font-semibold text-neutral-900">{tt("不能问什么")}</h3>
            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-neutral-700">{forbidden}</p>
          </section>
        ) : null}
        {disclaimer ? (
          <section data-bay-disclaimer className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <h3 className="text-[13px] font-semibold text-amber-900">{tt("答疑口径")}</h3>
            <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-amber-900">{disclaimer}</p>
          </section>
        ) : gated && promptsLoading ? (
          <p className="rounded-xl border border-dashed border-neutral-200 px-3 py-4 text-center text-[12px] text-neutral-500">{tt("正在取这个领域的答疑口径…")}</p>
        ) : null}
      </div>

      <hr className="my-5 border-neutral-200" />

      <section data-zone="conversion" className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
        <h3 className="text-[14px] font-semibold text-neutral-900">{tt("预约这次答疑")}</h3>
        <p className="mt-1 text-[12px] text-neutral-500">{tt("对话本身就是交付物：按轮次或按时长验收，全过程有时间戳。")}</p>
        <p data-bay-pay-hint className="mt-1 text-[12px] text-neutral-500">
          {buyerReady ? tt("下单后去付款，验收通过后钱才付给卖家。") : tt("付款暂未开放：订单会先建好，开放后在「我的订单」里付款。")}
        </p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-3">
          <Fact label={tt("价格")} value={consultPriceText(tt, consult.price_fen, consult.price_unit, consult.currency)} />
          <Fact label={tt("一次给到什么")} value={consultScopeText(tt, consult)} />
          <Fact label={tt("回复时限")} value={consult.response_window || tt("以答复人挂牌为准")} />
        </dl>
        {seller ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3 text-[12px] text-neutral-600">
            {seller.handle ? (
              <button type="button" data-bay-seller onClick={() => openBay({ kind: "profile", handle: seller.handle })} className="font-medium text-neutral-800 hover:underline">
                {sellerName}
              </button>
            ) : (
              <span className="font-medium text-neutral-800">{sellerName}</span>
            )}
            <PracticeLine source={seller} domain={consult.regulated_domain} fallback={tt("未填写自述身份")} />
          </div>
        ) : null}
        {error ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}
        {notice ? <p className="mt-2 text-[12px] text-neutral-600">{notice}</p> : null}
        <button
          type="button"
          data-bay-action="book"
          disabled={booking || Boolean(blocked) || waitingPrompts}
          onClick={() => void book()}
          className="mt-3 w-full rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:opacity-50 sm:w-auto"
        >
          {blocked || (booking ? tt("正在建立答疑合同…") : tt("预约答疑"))}
        </button>
        {disclaimerMissing ? (
          <p className="mt-2 text-[11px] leading-5 text-neutral-500">{tt("这个领域要先有平台下发的答疑口径，买家才知道这次对话能得到什么、不能得到什么。")}</p>
        ) : null}
      </section>
    </div>
  );
}
