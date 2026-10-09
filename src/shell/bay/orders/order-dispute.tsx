"use client";

// 订单页里的争议三层（照 TALENT `app/disputes/page.tsx`，只读外壳不搬）：
// 第一层验收期内自己解决；第二层「争议评估」没有约束力；第三层「平台裁定」按钮永远可点。
// 叫法只用这两个词。付款没开时结论只写进记录。

import { useEffect, useMemo, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  addBayDisputeEvidence,
  assessBayDispute,
  assessmentNonBindingNote,
  createBayDispute,
  currentDisputeLayer,
  DISPUTE_REASONS,
  disputeAssessmentOf,
  disputeCreateBody,
  disputeInputProblem,
  disputeLayers,
  disputeMoneyBanner,
  disputeReasonLabel,
  disputeStateLabel,
  disputeTimelineOf,
  elapsedSplit,
  escalateBayDispute,
  findBayDisputeForOrder,
  getBayDisputeDetail,
  respondBayDispute,
  withdrawBayDispute,
  type BayDispute,
  type BayDisputeAssessment,
  type BayDisputeDetail,
} from "../../../lib/bay/disputes";
import { safeHttpUrl, type BayOrder } from "../../../lib/bay/orders";
import { ORDER_BUTTON, ORDER_BUTTON_DANGER, ORDER_BUTTON_QUIET, ORDER_INPUT, OrderNote, useOrderDate } from "./order-ui";

export function OrderDisputeSection({
  order,
  paymentsEnabled,
  canOpen,
  busy,
  onBusy,
  onNotice,
  onOrderChanged,
}: {
  order: BayOrder;
  paymentsEnabled: boolean;
  canOpen: boolean;
  busy: string | null;
  onBusy: (key: string | null) => void;
  onNotice: (text: string, kind?: "ok" | "error") => void;
  onOrderChanged: () => void;
}) {
  const tt = useUI();
  const formatDate = useOrderDate();
  const [detail, setDetail] = useState<BayDisputeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState<(typeof DISPUTE_REASONS)[number]>("交付物与约定不符");
  const [story, setStory] = useState("");
  const [statement, setStatement] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceDesc, setEvidenceDesc] = useState("");

  async function reload() {
    const found = await findBayDisputeForOrder(order.id);
    if (!found) {
      setDetail(null);
      return;
    }
    setDetail(await getBayDisputeDetail(found.id));
  }

  useEffect(() => {
    let live = true;
    setLoading(true);
    void reload()
      .catch((error: unknown) => {
        if (live) onNotice(error instanceof Error ? error.message : tt("争议信息暂时取不到。"), "error");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // 只随订单 id 重取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const dispute: BayDispute | null = detail?.dispute ?? null;
  const assessment: BayDisputeAssessment | null = disputeAssessmentOf(detail);
  const timeline = disputeTimelineOf(detail);
  const layer = currentDisputeLayer(dispute, assessment);
  const layers = disputeLayers(tt);
  const split = useMemo(() => elapsedSplit(tt, order), [tt, order]);

  async function run(key: string, work: () => Promise<void>, ok: string) {
    if (busy) return;
    onBusy(key);
    try {
      await work();
      onNotice(ok, "ok");
      await reload();
      onOrderChanged();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : tt("没成功，请稍后再试。"), "error");
    } finally {
      onBusy(null);
    }
  }

  return (
    <section data-bay-order-disputes data-layer={layer} className="space-y-3">
      <h3 className="text-[13px] font-semibold text-neutral-900">{tt("争议")}</h3>
      <OrderNote kind="info">{disputeMoneyBanner(tt, paymentsEnabled)}</OrderNote>
      <ol className="space-y-2">
        {layers.map((item) => (
          <li
            key={item.key}
            data-dispute-layer={item.key}
            data-current={layer === item.key ? "true" : "false"}
            className={
              "rounded-xl border px-3 py-2 " +
              (layer === item.key ? "border-stone-300 bg-stone-50" : "border-neutral-200 bg-white")
            }
          >
            <p className="text-[12.5px] font-semibold text-neutral-900">{item.title}</p>
            <p className="mt-0.5 text-[12px] text-neutral-600">{item.what}</p>
            <p className="mt-0.5 text-[11.5px] text-neutral-500">{item.who}</p>
          </li>
        ))}
      </ol>

      {loading ? <p className="text-[12.5px] text-neutral-500">{tt("正在读取争议…")}</p> : null}

      {!loading && !dispute && canOpen ? (
        <form
          data-bay-dispute-form
          className="space-y-2 rounded-xl border border-neutral-200 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const problem = disputeInputProblem(tt, { contract_id: order.id, detail: story });
            if (problem) {
              onNotice(problem, "error");
              return;
            }
            const body = disputeCreateBody({ contract_id: order.id, reason, detail: story });
            void run("create-dispute", async () => {
              await createBayDispute(body);
            }, tt("争议已发起。"));
          }}
        >
          <p className="text-[12.5px] font-medium">{tt("发起争议")}</p>
          <label className="block text-[12px] text-neutral-600">
            {tt("主要原因")}
            <select
              data-bay-dispute-reason
              value={reason}
              onChange={(event) => setReason(event.target.value as (typeof DISPUTE_REASONS)[number])}
              className={"mt-1 " + ORDER_INPUT}
            >
              {DISPUTE_REASONS.map((item) => (
                <option key={item} value={item}>
                  {disputeReasonLabel(tt, item)}
                </option>
              ))}
            </select>
          </label>
          <textarea
            data-bay-dispute-detail
            value={story}
            onChange={(event) => setStory(event.target.value)}
            placeholder={tt("请说清发生了什么。")}
            rows={4}
            className={ORDER_INPUT}
          />
          <button type="submit" data-bay-action="open-dispute" disabled={busy !== null} className={ORDER_BUTTON_DANGER}>
            {tt("提交争议")}
          </button>
        </form>
      ) : null}

      {dispute ? (
        <div data-bay-dispute={dispute.id} data-dispute-state={dispute.state} className="space-y-2 rounded-xl border border-neutral-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold">{disputeStateLabel(tt, dispute.state)}</p>
            <span className="text-[11.5px] text-neutral-500">{disputeReasonLabel(tt, dispute.reason)}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-[13px] text-neutral-700">{dispute.detail}</p>
          {timeline.length ? (
            <ol className="space-y-1 text-[12px] text-neutral-600">
              {timeline.map((item, index) => (
                <li key={item.id || `${item.title}-${index}`}>
                  <span className="font-medium">{item.title}</span>
                  {item.detail ? <span> · {item.detail}</span> : null}
                  {item.created_at ? <span className="text-neutral-400"> · {formatDate(item.created_at, true)}</span> : null}
                </li>
              ))}
            </ol>
          ) : null}

          {assessment ? (
            <div data-bay-dispute-assessment className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <p className="text-[12.5px] font-semibold">{tt("争议评估")}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] text-neutral-800">{assessment.rationale_zh}</p>
              {assessment.verdict_hint ? <p className="mt-1 text-[12px] text-neutral-600">{assessment.verdict_hint}</p> : null}
              <p className="mt-1.5 text-[11.5px] text-neutral-500">{assessmentNonBindingNote(tt)}</p>
            </div>
          ) : (
            <button
              type="button"
              data-bay-action="assess-dispute"
              disabled={busy !== null}
              onClick={() => void run("assess", async () => {
                await assessBayDispute(dispute.id);
              }, tt("已给出争议评估。"))}
              className={ORDER_BUTTON_QUIET}
            >
              {tt("请求争议评估")}
            </button>
          )}

          {split ? (
            <div data-bay-elapsed-split className="rounded-lg border border-neutral-200 px-3 py-2 text-[12px] text-neutral-600">
              {split.steps.map((step) => (
                <p key={step}>{step}</p>
              ))}
              <p className="mt-1">{split.note}</p>
            </div>
          ) : null}

          <textarea
            data-bay-dispute-statement
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
            placeholder={tt("补充你的说法（可选）")}
            rows={3}
            className={ORDER_INPUT}
          />
          <button
            type="button"
            data-bay-action="respond-dispute"
            disabled={busy !== null || !statement.trim()}
            onClick={() =>
              void run("respond", async () => {
                await respondBayDispute(dispute.id, { statement });
                setStatement("");
              }, tt("说法已送出。"))
            }
            className={ORDER_BUTTON_QUIET}
          >
            {tt("补充说法")}
          </button>

          <div className="flex flex-wrap gap-2">
            <input
              data-bay-evidence-url
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
              placeholder={tt("证据链接（https://…）")}
              className={"min-w-[12rem] flex-1 " + ORDER_INPUT}
            />
            <input
              data-bay-evidence-desc
              value={evidenceDesc}
              onChange={(event) => setEvidenceDesc(event.target.value)}
              placeholder={tt("证据说明")}
              className={"min-w-[8rem] flex-1 " + ORDER_INPUT}
            />
            <button
              type="button"
              data-bay-action="add-evidence"
              disabled={busy !== null || !safeHttpUrl(evidenceUrl)}
              onClick={() =>
                void run("evidence", async () => {
                  await addBayDisputeEvidence(dispute.id, { url: evidenceUrl.trim(), description: evidenceDesc.trim() });
                  setEvidenceUrl("");
                  setEvidenceDesc("");
                }, tt("证据已补充。"))
              }
              className={ORDER_BUTTON_QUIET}
            >
              {tt("补充证据")}
            </button>
          </div>

          <button
            type="button"
            data-bay-action="escalate-dispute"
            disabled={busy !== null}
            onClick={() => void run("escalate", async () => {
              await escalateBayDispute(dispute.id);
            }, tt("已请求平台裁定。"))}
            className={ORDER_BUTTON}
          >
            {tt("请求平台裁定")}
          </button>

          {dispute.can_withdraw || dispute.viewer_role === "opener" ? (
            <button
              type="button"
              data-bay-action="withdraw-dispute"
              disabled={busy !== null}
              onClick={() => void run("withdraw", async () => {
                await withdrawBayDispute(dispute.id);
              }, tt("争议已撤回。"))}
              className={ORDER_BUTTON_DANGER}
            >
              {tt("撤回争议")}
            </button>
          ) : null}

          {dispute.resolution ? (
            <OrderNote kind="ok">
              <p className="font-medium">{tt("平台裁定")}</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{dispute.resolution}</p>
            </OrderNote>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
