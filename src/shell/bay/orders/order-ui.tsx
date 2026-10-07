"use client";

// 订单列表与订单页共用的小件：状态标签、日期、按钮样式、读取中/出错/请登录的提示。全部按纯文本渲染。

import { useCallback, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { htmlLang, normalizeLocale } from "../../../i18n/config";
import { useUI } from "../../../i18n/ui/useUI";
import { orderStatusLabel, type BayOrderStatus } from "../../../lib/bay/orders";
import { requireBayLogin } from "../shell/bay-state";

export const ORDER_BUTTON =
  "rounded-lg bg-neutral-900 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50";
export const ORDER_BUTTON_QUIET =
  "rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-[12.5px] text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50";
export const ORDER_BUTTON_DANGER =
  "rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-[12.5px] text-rose-700 hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50";
export const ORDER_INPUT =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-900 outline-none focus:border-sky-400";

export function orderStatusTone(status: BayOrderStatus | string | undefined): string {
  switch (status) {
    case "completed":
      return "bg-emerald-50 text-emerald-700";
    case "cancelled":
      return "bg-neutral-100 text-neutral-500";
    case "disputed":
      return "bg-rose-50 text-rose-700";
    case "delivered":
      return "bg-sky-50 text-sky-700";
    default:
      return "bg-amber-50 text-amber-700";
  }
}

export function OrderStatusChip({ status }: { status: BayOrderStatus | string | undefined }) {
  const tt = useUI();
  return (
    <span data-bay-order-status={status ?? "unknown"} className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] " + orderStatusTone(status)}>
      {orderStatusLabel(tt, status)}
    </span>
  );
}

/** 日期按界面语言显示；读不出来的时间返回空串。 */
export function useOrderDate(): (value: string | null | undefined, withTime?: boolean) => string {
  const locale = useLocale();
  return useCallback(
    (value, withTime = false) => {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      try {
        return new Intl.DateTimeFormat(htmlLang(normalizeLocale(locale)), {
          year: "numeric",
          month: "short",
          day: "numeric",
          ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
        }).format(date);
      } catch {
        return date.toISOString().slice(0, withTime ? 16 : 10).replace("T", " ");
      }
    },
    [locale],
  );
}

export function OrderNote({ kind = "info", children }: { kind?: "info" | "error" | "warn" | "ok"; children: ReactNode }) {
  const tone =
    kind === "error"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : kind === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : kind === "ok"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-neutral-200 bg-neutral-50 text-neutral-600";
  return (
    <div role={kind === "error" ? "alert" : undefined} className={"rounded-xl border px-3 py-2 text-[12.5px] leading-5 " + tone}>
      {children}
    </div>
  );
}

export function OrderLoading({ pane }: { pane: string }) {
  const tt = useUI();
  return (
    <section data-bay-pane={pane} data-bay-loading className="p-4 text-[13px] text-neutral-500">
      {tt("正在读取订单…")}
    </section>
  );
}

export function OrderLoadError({ pane, message, onRetry }: { pane: string; message: string; onRetry: () => void }) {
  const tt = useUI();
  return (
    <section data-bay-pane={pane} data-bay-error className="p-4">
      <OrderNote kind="error">
        <p>{tt(message || "订单信息暂时取不到。")}</p>
        <button type="button" data-bay-action="retry" onClick={onRetry} className="mt-1.5 font-medium underline underline-offset-2">
          {tt("重试")}
        </button>
      </OrderNote>
    </section>
  );
}

export function OrderSignIn({ pane, text }: { pane: string; text: string }) {
  const tt = useUI();
  return (
    <section data-bay-pane={pane} data-bay-sign-in className="px-4 py-10 text-center text-[13px] text-neutral-600">
      <p>{text}</p>
      <button type="button" data-bay-action="login" onClick={() => requireBayLogin()} className={"mt-3 " + ORDER_BUTTON}>
        {tt("登录")}
      </button>
    </section>
  );
}
