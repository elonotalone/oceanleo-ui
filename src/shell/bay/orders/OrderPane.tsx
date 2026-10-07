"use client";

// 一单的详情：概要、作品、时间线、里程碑、付款状态、交付/验收/改稿/取消、争议三层、评价、再来一单。
// 窗格不自带返回键、标题栏、滚动（外框约定第 12 条）。付款按钮只按 buyer_ready，绝不按 enabled。

import { useEffect, useMemo, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { BayApiError } from "../../../lib/bay/http";
import {
  acceptBayDelivery,
  approveBayMilestone,
  autoAcceptCountdown,
  autoAcceptText,
  cancelBayOrder,
  completeBayOrder,
  contractPaymentsOn,
  counterpartyName,
  deliverBayOrder,
  deliveryStateLabel,
  engagementKindLabel,
  extendBayReview,
  fetchBayContractSummary,
  formatOrderAmount,
  milestonePaymentStateLabel,
  milestoneStatusLabel,
  nextActionText,
  offPlatformMoneyRule,
  orderActionsFor,
  orderAmountText,
  orderPaymentStateLabel,
  orderRoleOf,
  paymentsHint,
  requestBayRevision,
  reviewExtensionRemainingDays,
  reviewExtensionWarning,
  safeHttpUrl,
  settlementRuleText,
  signBayOrder,
  sortedDeliveries,
  submitBayMilestone,
  type BayContractSummary,
  type BayOrder,
  type BayOrderMilestone,
} from "../../../lib/bay/orders";
import { startBayPayment } from "../../../lib/bay/payments";
import { pinBeforeRepeat, repeatOrderPlan } from "../../../lib/bay/repeat";
import { openMessages } from "../../messages/host-state";
import { openTradeThread } from "../deal/open-trade-thread";
import { openBaySettings } from "../settings/settings-open";
import { ensureBayTerms } from "../settings/terms-flow";
import { openBay, type BayPaneProps } from "../shell/bay-state";
import { OrderDisputeSection } from "./order-dispute";
import { bayOrderWorkLink } from "./order-links";
import { OrderReviewSection } from "./order-review";
import { storeBayOrder, useBayOrder, useBayPaymentsGate } from "./order-store";
import {
  ORDER_BUTTON,
  ORDER_BUTTON_DANGER,
  ORDER_BUTTON_QUIET,
  ORDER_INPUT,
  OrderLoadError,
  OrderLoading,
  OrderNote,
  OrderSignIn,
  OrderStatusChip,
  useOrderDate,
} from "./order-ui";

function orderIdOf(target: BayPaneProps["target"]): string {
  return target.kind === "order" && typeof target.id === "string" ? target.id : "";
}

function timelineOf(order: BayOrder, tt: (zh: string) => string): { at: string; text: string }[] {
  const rows: { at: string; text: string }[] = [];
  if (order.created_at) rows.push({ at: order.created_at, text: tt("订单已创建") });
  if (order.accepted_at) rows.push({ at: order.accepted_at, text: tt("合同已生效") });
  if (order.delivered_at) rows.push({ at: order.delivered_at, text: tt("卖家已提交交付") });
  if (order.disputed_at) rows.push({ at: order.disputed_at, text: tt("进入争议") });
  if (order.completed_at) rows.push({ at: order.completed_at, text: tt("订单已完成") });
  if (order.cancelled_at) rows.push({ at: order.cancelled_at, text: tt("订单已取消") });
  return rows.sort((a, b) => a.at.localeCompare(b.at));
}

export function OrderPane({ target }: BayPaneProps) {
  const tt = useUI();
  const formatDate = useOrderDate();
  const orderId = orderIdOf(target);
  const { order, error, loading, reload } = useBayOrder(orderId || null);
  const gate = useBayPaymentsGate();
  const [summary, setSummary] = useState<BayContractSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: "ok" | "error" } | null>(null);
  const [deliverNote, setDeliverNote] = useState("");
  const [deliverUrl, setDeliverUrl] = useState("");
  const [deliverName, setDeliverName] = useState("");
  const [revisionReason, setRevisionReason] = useState("");
  const [extendDays, setExtendDays] = useState(3);
  const [cancelReason, setCancelReason] = useState("");
  const [milestoneNote, setMilestoneNote] = useState("");

  useEffect(() => {
    if (!order?.thread_id || (order.work && order.im_conversation_id)) return;
    let live = true;
    void fetchBayContractSummary(order.thread_id).then((row) => {
      if (live) setSummary(row);
    });
    return () => {
      live = false;
    };
  }, [order?.id, order?.thread_id, order?.work, order?.im_conversation_id]);

  const actions = useMemo(() => orderActionsFor(order, gate), [order, gate]);
  const role = order ? orderRoleOf(order) : null;
  const work = order?.work ?? summary?.work ?? null;
  const workLink = bayOrderWorkLink(work, tt);
  const projectConversation = order?.im_conversation_id || summary?.im_conversation_id || null;
  const payReady = Boolean(gate.buyer_ready);
  const showPayHint = Boolean(order && role === "buyer" && contractPaymentsOn(order) && order.payment_state === "unfunded" && !payReady);

  function say(text: string, kind: "ok" | "error" = "ok") {
    setNotice({ text, kind });
  }

  async function run(key: string, workFn: () => Promise<BayOrder | void | { contract?: BayOrder }>, ok: string) {
    if (busy) return;
    setBusy(key);
    try {
      const result = await workFn();
      const next = result && typeof result === "object" && "contract" in result ? result.contract : result;
      if (next && typeof next === "object" && "id" in next) storeBayOrder(next as BayOrder, orderId);
      say(ok, "ok");
      reload();
    } catch (err) {
      say(err instanceof Error ? err.message : tt("没成功，请稍后再试。"), "error");
    } finally {
      setBusy(null);
    }
  }

  if (!orderId) {
    return (
      <section data-bay-pane="order" className="p-4">
        <OrderNote kind="error">{tt("找不到这笔订单。")}</OrderNote>
      </section>
    );
  }
  if (error && (error.status === 401 || error.code === "unauthorized")) {
    return <OrderSignIn pane="order" text={tt("登录后才能查看这笔订单。")} />;
  }
  if (loading && !order) return <OrderLoading pane="order" />;
  if (error && (error.status === 403 || error.status === 404)) {
    return (
      <section data-bay-pane="order" data-bay-no-permission className="p-4">
        <OrderNote kind="error">{tt("没有权限")}</OrderNote>
      </section>
    );
  }
  if (error && !order) {
    return <OrderLoadError pane="order" message={error.message} onRetry={reload} />;
  }
  if (!order || !role) {
    return (
      <section data-bay-pane="order" data-bay-no-permission className="p-4">
        <OrderNote kind="error">{tt("没有权限")}</OrderNote>
      </section>
    );
  }

  const countdown = autoAcceptText(tt, autoAcceptCountdown(order.auto_accept_at));
  const deliveries = sortedDeliveries(order);
  const milestones = [...(order.milestones || [])].sort((a, b) => a.seq - b.seq);
  const pendingMilestone = milestones.find((item) => item.status === "pending") ?? null;
  const submittedMilestone = milestones.find((item) => item.status === "submitted") ?? null;

  return (
    <section data-bay-pane="order" data-order-id={order.id} data-role={role} className="space-y-5 p-4">
      {notice ? <OrderNote kind={notice.kind === "error" ? "error" : "ok"}>{notice.text}</OrderNote> : null}

      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusChip status={order.status} />
          <span className="text-[13px] font-semibold text-neutral-900">{order.title || tt("订单")}</span>
        </div>
        <p className="text-[13px] text-neutral-700">
          {orderAmountText(tt, order)}
          {" · "}
          {tt("对方：{name}", { name: counterpartyName(tt, order) })}
          {engagementKindLabel(tt, order.engagement_kind || order.pricing_model) ? ` · ${engagementKindLabel(tt, order.engagement_kind || order.pricing_model)}` : ""}
        </p>
        <p className="text-[12.5px] text-sky-800">{tt("下一步：{text}", { text: nextActionText(tt, order, gate) })}</p>
        <p className="text-[12px] text-neutral-500">{settlementRuleText(tt, order)}</p>
        <p className="text-[12px] text-neutral-500">{paymentsHint(tt, gate.enabled)}</p>
        {order.delivery_mode === "off_platform" ? <p className="text-[12px] text-neutral-500">{offPlatformMoneyRule(tt, gate.enabled)}</p> : null}
      </header>

      {workLink ? (
        <p>
          <a
            data-bay-work-link
            href={workLink.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13px] font-medium text-sky-800 underline underline-offset-2"
          >
            {workLink.label}
          </a>
          {work?.title ? <span className="ms-2 text-[12px] text-neutral-500">{work.title}</span> : null}
        </p>
      ) : null}

      {timelineOf(order, tt).length ? (
        <ol data-bay-order-timeline className="space-y-1 text-[12.5px] text-neutral-600">
          {timelineOf(order, tt).map((item) => (
            <li key={`${item.at}-${item.text}`}>
              <span className="text-neutral-400">{formatDate(item.at, true)}</span>
              <span className="ms-2">{item.text}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {milestones.length ? (
        <section data-bay-order-milestones className="space-y-2">
          <h3 className="text-[13px] font-semibold">{tt("里程碑")}</h3>
          <ul className="space-y-2">
            {milestones.map((item) => (
              <MilestoneRow key={item.id} item={item} order={order} />
            ))}
          </ul>
          {actions.submitMilestone && pendingMilestone ? (
            <div className="space-y-2 rounded-xl border border-neutral-200 p-3">
              <textarea
                data-bay-milestone-note
                value={milestoneNote}
                onChange={(event) => setMilestoneNote(event.target.value)}
                rows={3}
                placeholder={tt("这一段交付了什么")}
                className={ORDER_INPUT}
              />
              <button
                type="button"
                data-bay-action="submit-milestone"
                disabled={busy !== null}
                onClick={() =>
                  void run("submit-ms", () => submitBayMilestone(order.id, pendingMilestone.id, milestoneNote).then(() => undefined), tt("里程碑已提交。"))
                }
                className={ORDER_BUTTON}
              >
                {tt("提交里程碑")}
              </button>
            </div>
          ) : null}
          {actions.approveMilestone && submittedMilestone ? (
            <button
              type="button"
              data-bay-action="approve-milestone"
              disabled={busy !== null}
              onClick={() => void run("approve-ms", () => approveBayMilestone(order.id, submittedMilestone.id).then(() => undefined), tt("里程碑已验收。"))}
              className={ORDER_BUTTON}
            >
              {tt("验收这一段")}
            </button>
          ) : null}
          {actions.completeAll ? (
            <button
              type="button"
              data-bay-action="complete-all"
              disabled={busy !== null}
              onClick={() => void run("complete", () => completeBayOrder(order.id), tt("订单已完成。"))}
              className={ORDER_BUTTON}
            >
              {tt("确认整单完成")}
            </button>
          ) : null}
        </section>
      ) : null}

      <section data-bay-order-payment data-buyer-ready={payReady ? "true" : "false"} className="space-y-2">
        <h3 className="text-[13px] font-semibold">{tt("付款")}</h3>
        <p data-bay-payment-state className="text-[13px] text-neutral-700">
          {orderPaymentStateLabel(tt, order.payment_state)}
          {Number(order.total_fen || 0) > 0 ? ` · ${formatOrderAmount(order.total_fen, order.currency)}` : ""}
        </p>
        {showPayHint ? <OrderNote kind="warn">{tt("付款暂未开放")}</OrderNote> : null}
        {actions.pay ? (
          <button
            type="button"
            data-bay-action="pay"
            disabled={busy !== null}
            onClick={() =>
              void run(
                "pay",
                async () => {
                  const agreed = await ensureBayTerms("buyer");
                  if (!agreed) throw new BayApiError(tt("需要先同意买家条款。"), 403);
                  const paid = await startBayPayment(order.id);
                  if (paid.redirect_url && typeof window !== "undefined") window.location.assign(paid.redirect_url);
                },
                tt("付款已发起。"),
              )
            }
            className={ORDER_BUTTON}
          >
            {tt("去付款")}
          </button>
        ) : null}
        {actions.setupPayment ? (
          <button type="button" data-bay-action="setup-payment" onClick={() => openBaySettings("money")} className={ORDER_BUTTON_QUIET}>
            {tt("去设置付款方式")}
          </button>
        ) : null}
      </section>

      {actions.sign ? (
        <button
          type="button"
          data-bay-action="sign"
          disabled={busy !== null}
          onClick={() =>
            void run(
              "sign",
              async () => {
                const agreed = await ensureBayTerms(role === "seller" ? "seller" : "buyer");
                if (!agreed) throw new BayApiError(tt("需要先同意条款。"), 403);
                return signBayOrder(order.id);
              },
              tt("已确认条款。"),
            )
          }
          className={ORDER_BUTTON}
        >
          {tt("确认条款并签约")}
        </button>
      ) : null}

      {deliveries.length || actions.deliver ? (
        <section data-bay-order-deliveries className="space-y-2">
          <h3 className="text-[13px] font-semibold">{tt("交付")}</h3>
          {deliveries.map((item) => (
            <article key={item.id} data-bay-delivery={item.id} className="rounded-xl border border-neutral-200 p-3">
              <p className="text-[12.5px] font-medium">
                {tt("第 {n} 轮", { n: item.round })} · {deliveryStateLabel(tt, item.state)}
              </p>
              {item.note ? <p className="mt-1 whitespace-pre-wrap break-words text-[13px] text-neutral-700">{item.note}</p> : null}
              {item.attachments?.length ? (
                <ul className="mt-1 space-y-0.5">
                  {item.attachments.map((file, index) => {
                    const href = safeHttpUrl(file.url);
                    return href ? (
                      <li key={`${href}-${index}`}>
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-sky-800 underline">
                          {file.name || href}
                        </a>
                      </li>
                    ) : null;
                  })}
                </ul>
              ) : null}
              {item.revision_request?.reason ? (
                <p className="mt-2 text-[12.5px] text-amber-800">{tt("改稿要求")}：{item.revision_request.reason}</p>
              ) : null}
            </article>
          ))}
          {actions.deliver ? (
            <form
              className="space-y-2 rounded-xl border border-neutral-200 p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void run(
                  "deliver",
                  () =>
                    deliverBayOrder(order.id, {
                      note: deliverNote,
                      attachments: deliverUrl.trim() ? [{ url: deliverUrl.trim(), name: deliverName.trim() || "file", kind: "file" }] : [],
                    }),
                  tt("交付已提交。"),
                ).then(() => {
                  setDeliverNote("");
                  setDeliverUrl("");
                  setDeliverName("");
                });
              }}
            >
              <textarea
                data-bay-deliver-note
                value={deliverNote}
                onChange={(event) => setDeliverNote(event.target.value)}
                rows={4}
                placeholder={tt("说明这次交付了什么")}
                className={ORDER_INPUT}
              />
              <input
                data-bay-deliver-url
                value={deliverUrl}
                onChange={(event) => setDeliverUrl(event.target.value)}
                placeholder={tt("附件链接（https://…）")}
                className={ORDER_INPUT}
              />
              <input
                data-bay-deliver-name
                value={deliverName}
                onChange={(event) => setDeliverName(event.target.value)}
                placeholder={tt("附件名称")}
                className={ORDER_INPUT}
              />
              <button type="submit" data-bay-action="deliver" disabled={busy !== null} className={ORDER_BUTTON}>
                {tt("提交交付")}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {order.status === "delivered" ? (
        <section data-bay-order-review-window className="space-y-2">
          {countdown ? <OrderNote kind="info">{countdown}</OrderNote> : null}
          {actions.acceptDelivery ? (
            <button
              type="button"
              data-bay-action="accept-delivery"
              disabled={busy !== null}
              onClick={() => void run("accept", () => acceptBayDelivery(order.id), tt("已验收。"))}
              className={ORDER_BUTTON}
            >
              {tt("验收通过")}
            </button>
          ) : null}
          {actions.requestRevision ? (
            <div className="space-y-2">
              <textarea
                data-bay-revision-reason
                value={revisionReason}
                onChange={(event) => setRevisionReason(event.target.value)}
                rows={3}
                placeholder={tt("请说明要改什么")}
                className={ORDER_INPUT}
              />
              <button
                type="button"
                data-bay-action="request-revision"
                disabled={busy !== null || !revisionReason.trim()}
                onClick={() =>
                  void run("revision", () => requestBayRevision(order.id, revisionReason, deliveries[0]?.id), tt("已要求修改。"))
                }
                className={ORDER_BUTTON_QUIET}
              >
                {tt("要求修改")}
              </button>
            </div>
          ) : null}
          {actions.extendReview && reviewExtensionRemainingDays(order) > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                data-bay-extend-days
                type="number"
                min={1}
                max={reviewExtensionRemainingDays(order)}
                value={extendDays}
                onChange={(event) => setExtendDays(Number(event.target.value))}
                className={"w-20 " + ORDER_INPUT}
              />
              <button
                type="button"
                data-bay-action="extend-review"
                disabled={busy !== null || Boolean(reviewExtensionWarning(tt, order, extendDays))}
                onClick={() => void run("extend", () => extendBayReview(order.id, extendDays), tt("验收期已延长。"))}
                className={ORDER_BUTTON_QUIET}
              >
                {tt("延长验收")}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {actions.cancel ? (
        <div className="space-y-2">
          <textarea
            data-bay-cancel-reason
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            rows={2}
            placeholder={tt("取消原因（可选）")}
            className={ORDER_INPUT}
          />
          <button
            type="button"
            data-bay-action="cancel"
            disabled={busy !== null}
            onClick={() => void run("cancel", () => cancelBayOrder(order.id, cancelReason), tt("订单已取消。"))}
            className={ORDER_BUTTON_DANGER}
          >
            {tt("取消订单")}
          </button>
        </div>
      ) : null}

      <OrderDisputeSection
        order={order}
        paymentsEnabled={gate.enabled}
        canOpen={actions.dispute}
        busy={busy}
        onBusy={setBusy}
        onNotice={say}
        onOrderChanged={reload}
      />

      {actions.review || order.status === "completed" ? (
        <OrderReviewSection
          contractId={order.id}
          canWrite={actions.review}
          viewerRole={role}
          busy={busy}
          onBusy={setBusy}
          onNotice={say}
        />
      ) : null}

      {actions.repeat ? (
        <button
          type="button"
          data-bay-action="repeat"
          disabled={busy !== null}
          onClick={() =>
            void run(
              "repeat",
              async () => {
                const plan = repeatOrderPlan(order);
                if (!plan) throw new BayApiError(tt("这笔订单不能再来一单。"), 400);
                await pinBeforeRepeat(order);
                if (plan.kind === "checkout") {
                  openBay({ kind: "checkout", serviceId: plan.serviceId, tier: plan.tier });
                  return;
                }
                await openTradeThread({ kind: "direct", userId: plan.userId });
              },
              tt("已记下这次合作，正在打开下一单。"),
            )
          }
          className={ORDER_BUTTON}
        >
          {tt("再来一单")}
        </button>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {actions.openProject && projectConversation ? (
          <button type="button" data-bay-action="open-project" onClick={() => openMessages({ conversationId: projectConversation })} className={ORDER_BUTTON_QUIET}>
            {tt("打开项目群")}
          </button>
        ) : null}
        {actions.tradeThread && order.thread_id ? (
          <button
            type="button"
            data-bay-action="trade-thread"
            onClick={() => openBay({ kind: "conversation", threadId: order.thread_id as string })}
            className={ORDER_BUTTON_QUIET}
          >
            {tt("交易会话")}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function MilestoneRow({ item, order }: { item: BayOrderMilestone; order: BayOrder }) {
  const tt = useUI();
  const formatDate = useOrderDate();
  return (
    <li data-bay-milestone={item.id} className="rounded-xl border border-neutral-200 px-3 py-2">
      <p className="text-[13px] font-medium text-neutral-900">
        {item.title || tt("里程碑")}
        <span className="ms-2 text-[12px] font-normal text-neutral-500">{milestoneStatusLabel(tt, item.status)}</span>
      </p>
      <p className="mt-0.5 text-[12px] text-neutral-600">
        {formatOrderAmount(item.amount_fen, order.currency)}
        {item.payment_state ? ` · ${milestonePaymentStateLabel(tt, item.payment_state)}` : ""}
        {item.due_at ? ` · ${formatDate(item.due_at)}` : ""}
      </p>
      {item.detail ? <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] text-neutral-600">{item.detail}</p> : null}
      {item.deliverable_note ? <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] text-neutral-700">{item.deliverable_note}</p> : null}
    </li>
  );
}
