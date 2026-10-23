"use client";

// 下单（移植自 talent `app/orders/new/page.tsx` 的服务下单段，外壳不搬）。
// 先过买家条款（ensureBayTerms("buyer")），再建订单。下单这一步从不发起付款：
// `buyer_ready` 为 false 时写「付款暂未开放」、引到「我的订单」，界面上没有付款按钮；
// 为 true 时才出现付款按钮，由用户自己点（调 W09 的 startBayPayment）。契约 §7。

import { useState } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import type { UITranslate } from "../../../i18n/ui/useUI";
import { getUserId } from "../../../lib/auth/client";
import {
  BAY_CHECKOUT_LIMITS,
  checkoutInput,
  checkoutProblem,
  emptyCheckoutForm,
  loadBayPaymentConfig,
  placeBayServiceOrder,
  type BayCheckoutForm,
  type BayCheckoutProblem,
  type BayOrderContract,
  type BayPayStep,
} from "../../../lib/bay/checkout";
import type { BayPaymentConfig } from "../../../lib/bay/payments";
import { startBayPayment } from "../../../lib/bay/payments";
import {
  enabledTiers,
  getBayService,
  isOwnService,
  serviceSelection,
  type BayServiceDetail,
} from "../../../lib/bay/services";
import { formatDeadline } from "../form/bay-deadline";
import { BayDeadlineField } from "../form/BayDeadlineField";
import { BAY_FORM_LABEL_CLASS } from "../form/form-ui";
import { BayRevealForm, type BayRevealItem } from "../form/BayRevealForm";
import { ensureBayTerms } from "../settings";
import { openBay, requireBayLogin, type BayLayout, type BayPaneProps } from "../shell/bay-state";
import { deliveryDaysText, moneyOrFree, revisionsText, safeHttpUrl, tierLabel } from "./format";
import { DigitalTerms, DoneMeans, PaneLoading, PaneMessage } from "./parts";
import { errorText, useBayResource } from "./use-bay-resource";

export function CheckoutPane({ target, layout }: BayPaneProps) {
  const tt = useUI();
  const serviceId = target.kind === "checkout" ? target.serviceId : "";
  const tier = target.kind === "checkout" ? target.tier || "" : "";
  const service = useBayResource(serviceId ? `checkout:${serviceId}` : null, () => getBayService(serviceId).then((data) => data.service));
  const payment = useBayResource("bay-payment-config", loadBayPaymentConfig);
  const viewer = useBayResource("viewer", () => getUserId());
  if (!serviceId) return null;
  if (service.loading) return <PaneLoading />;
  if (!service.data) {
    const text = service.status === 404 || !service.error ? tt("这件商品不存在或已经下架") : tt(service.error);
    return <PaneMessage text={text} onRetry={service.reload} />;
  }
  if (isOwnService(service.data, viewer.data)) return <PaneMessage text={tt("这是你发布的商品")} />;
  return <CheckoutView service={service.data} initialTier={tier} payment={payment.data} layout={layout} />;
}

function problemText(tt: UITranslate, problem: BayCheckoutProblem): string {
  switch (problem) {
    case "tier":
      return tt("所选档位已停用，请换一个档位。");
    case "title":
      return tt("请写一句需求标题");
    default:
      return tt("请说明要做什么");
  }
}

function summaryLine(value: string): string | undefined {
  const line = value.trim().split("\n")[0];
  if (!line) return undefined;
  return line.length > 72 ? `${line.slice(0, 72)}…` : line;
}

export interface CheckoutViewProps {
  service: BayServiceDetail;
  initialTier?: string;
  /** 付款配置；null = 还没取到，按没就绪处理。 */
  payment: BayPaymentConfig | null;
  layout: BayLayout;
  /** 测试与复用：直接从「已下单」那一步开始画。 */
  initialPlaced?: { contract: BayOrderContract; payStep: BayPayStep } | null;
}

export function CheckoutView({ service, initialTier = "", payment, layout, initialPlaced = null }: CheckoutViewProps) {
  const tt = useUI();
  const tiers = enabledTiers(service);
  const [tierName, setTierName] = useState(initialTier);
  const [form, setForm] = useState<BayCheckoutForm>(() => emptyCheckoutForm(service.title));
  const [phase, setPhase] = useState<"form" | "terms" | "placing">("form");
  const [placed, setPlaced] = useState(initialPlaced);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState("");
  const selection = serviceSelection(service, tierName || undefined);
  const problem = checkoutProblem(selection, form);
  const currency = selection.tier?.currency || service.currency;
  const total = moneyOrFree(tt, selection.totalFen, currency);
  const buyerReady = payment?.buyer_ready === true;
  const wide = layout === "page" || layout === "full";
  const digital = service.listing_kind === "digital";

  function patch(next: Partial<BayCheckoutForm>) {
    setForm((current) => ({ ...current, ...next }));
  }

  async function submit() {
    if (phase !== "form" || !requireBayLogin()) return;
    setTouched(true);
    setError("");
    const input = checkoutInput(service, tierName || undefined, form);
    if (!input) return;
    setPhase("terms");
    let accepted = false;
    try {
      accepted = await ensureBayTerms("buyer");
    } catch {
      accepted = false;
    }
    if (!accepted) {
      setPhase("form");
      return;
    }
    setPhase("placing");
    try {
      setPlaced(await placeBayServiceOrder(input, selection.totalFen));
    } catch (err) {
      setError(errorText(err) || tt("下单没成功，请稍后再试。"));
    } finally {
      setPhase("form");
    }
  }

  if (placed) return <PlacedView contract={placed.contract} payStep={placed.payStep} totalText={total} />;

  const summary = (
    <aside data-bay-checkout-summary className="space-y-1">
      <p className="text-[12px] text-neutral-600">{tt("你正在购买")}</p>
      <p className="mt-0.5 break-words text-[14px] font-semibold text-neutral-900">{service.title}</p>
      {selection.tier && !digital ? (
        <p className="mt-2 text-[12px] text-neutral-600">
          {tiers.length > 1 ? `${tierLabel(tt, selection.tier.tier)} · ` : ""}{selection.tier.title}
          {" · "}
          {revisionsText(tt, selection.tier.revisions)}
        </p>
      ) : null}
      <div className="mt-3 flex items-end justify-between gap-2 border-t border-neutral-200 pt-3">
        <span className="text-[13px] text-neutral-600">{tt("订单总额")}</span>
        <span data-bay-total className="text-[18px] font-semibold text-neutral-900">
          {selection.tier ? total : "—"}
        </span>
      </div>
      {digital ? null : <p className="mt-1 text-[12px] text-neutral-600">{deliveryDaysText(tt, selection.deliveryDays)}</p>}
      <p data-bay-pay-hint className="mt-2 text-[12px] text-neutral-600">
        {buyerReady ? tt("下单后去付款，验收通过后钱才付给卖家。") : tt("付款暂未开放：订单会先建好，开放后在「我的订单」里付款。")}
      </p>
    </aside>
  );

  const field = "w-full rounded-full border border-neutral-900 bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-neutral-400";
  const items: BayRevealItem[] = [
    {
      id: "title",
      label: tt("需求标题"),
      done: Boolean(form.title.trim()),
      summary: summaryLine(form.title),
      children: (
        <input data-bay-field="title" value={form.title} maxLength={BAY_CHECKOUT_LIMITS.title} onChange={(event) => patch({ title: event.target.value })} className={field} />
      ),
    },
    {
      id: "what",
      label: tt("要做什么"),
      done: Boolean(form.what.trim()),
      summary: summaryLine(form.what),
      children: (
        <textarea data-bay-field="what" value={form.what} rows={6} maxLength={BAY_CHECKOUT_LIMITS.what} onChange={(event) => patch({ what: event.target.value })} className={field} />
      ),
    },
    {
      id: "links",
      label: tt("参考链接"),
      done: Boolean(form.links.trim()),
      summary: summaryLine(form.links),
      children: (
        <textarea data-bay-field="links" value={form.links} rows={3} onChange={(event) => patch({ links: event.target.value })} className={field} />
      ),
    },
    {
      id: "deadline",
      label: tt("期望截止时间"),
      done: Boolean(form.deadline.trim()),
      optional: true,
      summary: formatDeadline(form.deadline) || undefined,
      children: <BayDeadlineField value={form.deadline} onChange={(deadline) => patch({ deadline })} />,
    },
    {
      id: "notes",
      label: tt("补充说明"),
      done: Boolean(form.notes.trim()),
      optional: true,
      summary: summaryLine(form.notes),
      children: (
        <textarea data-bay-field="notes" value={form.notes} rows={3} maxLength={BAY_CHECKOUT_LIMITS.notes} onChange={(event) => patch({ notes: event.target.value })} className={field} />
      ),
    },
  ];
  const formView = (
    <div className="flex min-w-0 flex-col gap-6">
      {/* 价格档位已下线：一件商品只有一个价格，不用选。只有没清理掉的旧多档商品才会走到这里。 */}
      {tiers.length > 1 ? (
      <fieldset>
        <legend className={BAY_FORM_LABEL_CLASS}>{tt("选择档位")}</legend>
        <div className="mt-2 space-y-1.5">
          {tiers.map((tier) => (
            <label
              key={tier.id}
              data-bay-tier={tier.tier}
              className={
                "flex cursor-pointer items-center gap-2.5 rounded-lg border bg-white px-3 py-2 " +
                (selection.tier?.tier === tier.tier ? "border-neutral-900 ring-1 ring-neutral-900" : "border-neutral-200")
              }
            >
              <input type="radio" name={`bay-tier-${service.id}`} checked={selection.tier?.tier === tier.tier} onChange={() => setTierName(tier.tier)} />
              <span className="min-w-0 flex-1 break-words text-[13px] text-neutral-800">
                {tierLabel(tt, tier.tier)} · {tier.title}
                {digital ? null : <span className="ml-1 text-[12px] text-neutral-600">{deliveryDaysText(tt, tier.delivery_days)}</span>}
              </span>
              <span className="shrink-0 text-[13px] font-medium text-neutral-900">{moneyOrFree(tt, tier.price_fen, tier.currency || service.currency)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      ) : null}

      <DigitalTerms
        listingKind={digital ? "digital" : "service"}
        deliveryDays={digital ? null : selection.deliveryDays ?? service.delivery_days}
        deadlineAt={service.deadline_at}
        customTerms={service.custom_terms}
      />
      {digital ? null : <DoneMeans service={service} />}

      <BayRevealForm items={items} />

      {wide ? null : <div>{summary}</div>}

      {problem && (touched || problem === "tier") ? <p data-bay-problem={problem} className="text-[12px] text-rose-600">{problemText(tt, problem)}</p> : null}
      {error ? <p data-bay-error className="text-[12px] text-rose-600">{tt(error)}</p> : null}
      <button
        type="button"
        data-bay-action="place-order"
        disabled={phase !== "form" || !selection.tier}
        onClick={() => void submit()}
        className="w-full rounded-full bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {phase === "terms" ? tt("正在核对条款…") : phase === "placing" ? tt("正在下单…") : tt("确认下单 · {price}", { price: selection.tier ? total : "—" })}
      </button>
    </div>
  );

  if (!wide) return <div data-bay-pane="checkout" className="p-4">{formView}</div>;
  return (
    <div data-bay-pane="checkout" className="grid items-start gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {formView}
      <div className="lg:sticky lg:top-4">{summary}</div>
    </div>
  );
}

function PlacedView({ contract, payStep, totalText }: { contract: BayOrderContract; payStep: BayPayStep; totalText: string }) {
  const tt = useUI();
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  async function pay() {
    if (payStep !== "pay" || paying) return;
    setPaying(true);
    setPayError("");
    try {
      const { redirect_url } = await startBayPayment(contract.id);
      const url = safeHttpUrl(redirect_url);
      if (url) window.location.assign(url);
      else openBay({ kind: "order", id: contract.id });
    } catch (err) {
      setPayError(errorText(err) || tt("付款没打开，请稍后再试，或在「我的订单」里继续。"));
    } finally {
      setPaying(false);
    }
  }

  const toOrder = (
    <button
      type="button"
      data-bay-action="open-order"
      onClick={() => openBay({ kind: "order", id: contract.id })}
      className={
        "rounded-lg px-4 py-2 text-[13px] font-medium " +
        (payStep === "pay" ? "border border-neutral-200 text-neutral-700 hover:bg-neutral-50" : "bg-neutral-900 text-white hover:bg-neutral-800")
      }
    >
      {tt("去我的订单")}
    </button>
  );

  return (
    <div data-bay-pane="checkout" data-bay-placed={payStep} className="p-4">
      <h2 className="text-[17px] font-semibold text-neutral-950">{tt("订单已建好")}</h2>
      {contract.title ? <p className="mt-1 break-words text-[13px] text-neutral-600">{contract.title}</p> : null}
      <p className="mt-1 text-[13px] text-neutral-600">
        {tt("订单总额")}：<span className="font-semibold text-neutral-900">{totalText}</span>
      </p>
      {payStep === "unavailable" ? (
        <div data-bay-pay-unavailable className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[14px] font-semibold text-amber-900">{tt("付款暂未开放")}</p>
          <p className="mt-1 text-[12.5px] text-amber-900">{tt("订单已经建好。付款开放后，可以在「我的订单」里继续。")}</p>
        </div>
      ) : payStep === "free" ? (
        <p className="mt-4 text-[12.5px] text-neutral-700">{tt("这是免费订单，不用付款。")}</p>
      ) : null}
      {payError ? <p className="mt-3 text-[12px] text-rose-600">{tt(payError)}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {payStep === "pay" ? (
          <button
            type="button"
            data-bay-pay
            disabled={paying}
            onClick={() => void pay()}
            className="rounded-full bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            {paying ? tt("正在跳转付款…") : tt("去付款 · {price}", { price: totalText })}
          </button>
        ) : null}
        {toOrder}
      </div>
    </div>
  );
}
