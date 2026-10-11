"use client";

// 课程 / 套餐详情右侧主按钮：购买或免费领取先弹确认再扣款；本人是编辑，已拥有是继续学习或已拥有。
import { useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";
import { purchaseBayLesson } from "../../../lib/bay/lessons";
import { formatBayMoney } from "../../../lib/bay/services";
import { useLedgerCurrency } from "../../../lib/money";
import { openBay, requireBayLogin } from "../shell/bay-state";
import { moneyOrFree } from "../supply/format";
import { errorText } from "../supply/use-bay-resource";

export function BuyButton({
  itemKind,
  itemId,
  title,
  priceFen,
  isOwner,
  owned,
  onReload,
  onContinue,
}: {
  itemKind: "lesson" | "bundle";
  itemId: string;
  title: string;
  priceFen: number;
  isOwner: boolean;
  owned: boolean;
  onReload: () => void;
  onContinue?: () => void;
}): ReactElement {
  const tt = useUI();
  const currency = useLedgerCurrency();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paid = priceFen > 0;
  const priceLabel = moneyOrFree(tt, priceFen, currency);
  const paidLabel = formatBayMoney(priceFen, currency);

  if (isOwner) {
    return (
      <button
        type="button"
        data-bay-action="edit"
        onClick={() =>
          openBay(itemKind === "bundle" ? { kind: "bundle-editor", bundleId: itemId } : { kind: "lesson-editor", lessonId: itemId })
        }
        className="shrink-0 rounded-lg border border-neutral-200 px-3 py-2 text-[13px] text-neutral-700 hover:bg-neutral-50"
      >
        {tt("编辑")}
      </button>
    );
  }

  if (owned) {
    if (itemKind === "bundle") {
      return (
        <span data-bay-owned className="shrink-0 rounded-lg border border-neutral-200 px-3 py-2 text-[13px] font-medium text-neutral-700">
          {tt("已拥有")}
        </span>
      );
    }
    return (
      <button
        type="button"
        data-bay-action="continue"
        onClick={() => onContinue?.()}
        className="shrink-0 rounded-lg bg-neutral-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-neutral-800"
      >
        {tt("继续学习")}
      </button>
    );
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await purchaseBayLesson(itemKind, itemId);
      setConfirming(false);
      onReload();
    } catch (err) {
      setError(errorText(err) || tt("购买没成功，请稍后再试。"));
    } finally {
      setBusy(false);
    }
  }

  function startBuy() {
    if (!requireBayLogin()) return;
    setError("");
    setConfirming(true);
  }

  return (
    <div className="w-56 shrink-0 text-right">
      <button
        type="button"
        data-bay-action="buy"
        disabled={busy}
        onClick={startBuy}
        className="w-full rounded-lg bg-neutral-900 px-3 py-2 text-[13px] font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {paid
          ? tt(itemKind === "bundle" ? "购买套餐 · {price}" : "购买 · {price}", { price: paidLabel })
          : tt("免费领取")}
      </button>
      {paid ? <p className="mt-1.5 text-left text-[11px] leading-4 text-neutral-500">{tt("另加支付通道费，平台不抽成。付款后 7 天内可申请退款")}</p> : null}
      {confirming ? (
        <div data-bay-confirm="buy" className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-left">
          <p className="text-[12px] font-semibold text-neutral-900">{paid ? tt("确认购买") : tt("确认领取")}</p>
          <p className="mt-1 break-words text-[13px] text-neutral-800">{title}</p>
          <p className="mt-1 text-[13px] font-medium text-neutral-900">{priceLabel}</p>
          {paid ? <p className="mt-1 text-[11px] leading-4 text-neutral-500">{tt("另加支付通道费，平台不抽成。付款后 7 天内可申请退款")}</p> : null}
          {error ? <p className="mt-2 text-[12px] text-rose-600">{tt(error)}</p> : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 disabled:opacity-60"
            >
              {tt("取消")}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-60"
            >
              {busy ? tt("正在处理…") : tt("确认")}
            </button>
          </div>
        </div>
      ) : error ? (
        <p className="mt-2 text-left text-[12px] text-rose-600">{tt(error)}</p>
      ) : null}
    </div>
  );
}
