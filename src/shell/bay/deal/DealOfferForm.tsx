"use client";

// 卖家发新报价：价格、交付天数、修改次数、范围。发出后，会话里之前没处理的报价由服务端自动撤回。

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { DealOfferInput } from "../../../lib/bay/threads";
import { checkOfferForm, parseAmountToFen, type OfferFormProblem } from "./deal-model";

export interface DealOfferFormProps {
  currency: string;
  defaultTitle?: string;
  /** 发报价；返回 false 表示没发（比如关掉了条款窗），表单保留。抛错时显示错误。 */
  onSubmit: (input: DealOfferInput) => Promise<boolean>;
  onCancel: () => void;
}

export function DealOfferForm({ currency, defaultTitle = "", onSubmit, onCancel }: DealOfferFormProps) {
  const tt = useUI();
  const [title, setTitle] = useState(defaultTitle);
  const [amount, setAmount] = useState("");
  const [days, setDays] = useState("7");
  const [revisions, setRevisions] = useState("2");
  const [unlimited, setUnlimited] = useState(false);
  const [scope, setScope] = useState("");
  const [problem, setProblem] = useState<OfferFormProblem>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function problemText(value: OfferFormProblem): string | null {
    switch (value) {
      case "title":
        return tt("请写一句报价标题");
      case "amount":
        return tt("请填写正确的价格");
      case "days":
        return tt("交付天数要在 1 到 3650 天之间");
      case "revisions":
        return tt("修改次数要在 0 到 100 次之间");
      default:
        return null;
    }
  }

  async function submit() {
    if (busy) return;
    const form = { title, amount, days, revisions: unlimited ? "-1" : revisions };
    const found = checkOfferForm(form);
    setProblem(found);
    setError(null);
    if (found) return;
    setBusy(true);
    try {
      const sent = await onSubmit({
        title: title.trim(),
        description: scope.trim(),
        priceFen: parseAmountToFen(amount) ?? 0,
        deliveryDays: Number(days),
        revisions: unlimited ? -1 : Number(revisions),
      });
      if (sent) onCancel();
    } catch (err) {
      const message = (err as { message?: string } | null)?.message;
      setError(message ? tt(message) : tt("报价没发出去，请稍后再试。"));
    } finally {
      setBusy(false);
    }
  }

  const label = "block text-[11.5px] font-medium text-neutral-600";
  const input =
    "mt-1 w-full rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[13px] text-neutral-900 focus:border-neutral-400 focus:outline-none";
  return (
    <form
      data-deal-offer-form
      className="border-t border-neutral-200 bg-neutral-50 px-3 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-neutral-900">{tt("发一份新报价")}</p>
        <button type="button" data-action="offer-cancel" onClick={onCancel} className="text-[12px] text-neutral-500 hover:text-neutral-800">
          {tt("取消")}
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className={label + " col-span-2"}>
          {tt("报价标题")}
          <input
            data-offer-field="title"
            value={title}
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            className={input}
          />
        </label>
        <label className={label}>
          {tt("价格（{currency}）", { currency: currency.toUpperCase() })}
          <input
            data-offer-field="amount"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            className={input}
          />
        </label>
        <label className={label}>
          {tt("交付天数")}
          <input
            data-offer-field="days"
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className={input}
          />
        </label>
        <label className={label}>
          {tt("修改次数")}
          <input
            data-offer-field="revisions"
            type="number"
            min={0}
            max={100}
            disabled={unlimited}
            value={unlimited ? "" : revisions}
            onChange={(event) => setRevisions(event.target.value)}
            className={input + " disabled:bg-neutral-100"}
          />
        </label>
        <label className="flex items-end gap-1.5 pb-1.5 text-[12px] text-neutral-600">
          <input
            data-offer-field="unlimited"
            type="checkbox"
            checked={unlimited}
            onChange={(event) => setUnlimited(event.target.checked)}
          />
          {tt("不限改稿")}
        </label>
        <label className={label + " col-span-2"}>
          {tt("范围说明")}
          <textarea
            data-offer-field="scope"
            rows={3}
            maxLength={20000}
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            placeholder={tt("写清楚包含什么、不包含什么")}
            className={input + " resize-y"}
          />
        </label>
      </div>
      <p className="mt-1.5 text-[11.5px] text-neutral-500">{tt("发出新报价后，之前没处理的报价会自动撤回。")}</p>
      {problem || error ? (
        <p role="alert" data-offer-form-error className="mt-1.5 text-[12px] text-red-600">
          {problemText(problem) ?? error}
        </p>
      ) : null}
      <div className="mt-2 flex justify-end">
        <button
          type="submit"
          disabled={busy}
          data-action="offer-submit"
          className="rounded-lg bg-neutral-900 px-4 py-1.5 text-[13px] text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy ? tt("发送中…") : tt("发送报价")}
        </button>
      </div>
    </form>
  );
}
