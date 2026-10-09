"use client";

// 卖家目录共用的小件：表单行、输入框、分区卡、提示条、被平台隐藏的说明。按窄宽度排版（浮窗与设置窗）。

import type { ReactNode } from "react";
import { portalHref } from "../../../contracts/domain-family";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayContentCase } from "../../../lib/bay/seller";

export const INPUT_CLASS =
  "h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-[13px] text-stone-900 outline-none focus:border-stone-400";
export const TEXTAREA_CLASS =
  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-[13px] leading-6 text-stone-900 outline-none focus:border-stone-400";
export const PRIMARY_BUTTON =
  "inline-flex h-9 items-center justify-center rounded-lg bg-stone-900 px-3 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40";
export const SECONDARY_BUTTON =
  "inline-flex h-9 items-center justify-center rounded-lg border border-stone-200 bg-white px-3 text-[13px] font-medium text-stone-700 disabled:cursor-not-allowed disabled:opacity-40";
export const DANGER_BUTTON =
  "inline-flex h-9 items-center justify-center rounded-lg border border-rose-200 bg-white px-3 text-[13px] font-medium text-rose-600 disabled:opacity-40";
export const LINK_BUTTON = "font-medium text-stone-900 underline underline-offset-2";

export function SellerField({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px] font-medium text-stone-800">
        <span>{label}</span>
        {hint ? <span className="text-[11.5px] font-normal text-stone-500">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function SellerCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-4">
      <div>
        <h3 className="text-[14px] font-semibold text-stone-900">{title}</h3>
        {hint ? <p className="mt-1 text-[12.5px] leading-5 text-stone-500">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function SellerNotice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const toneClass =
    tone === "warn"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "error"
        ? "border-rose-200 bg-rose-50 text-rose-900"
        : tone === "ok"
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-stone-200 bg-stone-50 text-stone-700";
  return (
    <div role={tone === "error" || tone === "warn" ? "alert" : "status"} className={`rounded-xl border px-3 py-2.5 text-[12.5px] leading-5 ${toneClass}`}>
      {children}
    </div>
  );
}

export function SellerEmpty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-stone-300 px-4 py-6 text-center text-[12.5px] text-stone-500">{children}</p>;
}

/** 门户「内容处理记录」页：查看完整原因、提交反通知或申诉。 */
export function contentCasesHref(): string {
  try {
    return portalHref("/account/content-cases");
  } catch {
    return "https://oceanleo.com/account/content-cases";
  }
}

/** 被平台隐藏：其他人看不到；写清原因（有处置记录时）和怎么申诉。 */
export function HiddenByPlatformNotice({ what, caseRow }: { what: "service" | "profile" | "showcase"; caseRow: BayContentCase | null }) {
  const tt = useUI();
  const headline =
    what === "service"
      ? tt("这项服务已被平台暂时隐藏，买家现在看不到。")
      : what === "profile"
        ? tt("你的卖家资料已被平台暂时隐藏，其他人现在看不到。")
        : tt("作品集里有内容被平台暂时隐藏，其他人现在看不到。");
  const reason = caseRow ? [caseRow.reason, caseRow.detail].map((part) => part.trim()).filter(Boolean).join(" · ") : "";
  return (
    <div role="status" data-bay-hidden={what} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-5 text-amber-950">
      <p className="font-semibold">{headline}</p>
      <p className="mt-1">{reason ? tt("原因：{reason}", { reason }) : tt("原因在内容处理记录里。")}</p>
      <p className="mt-1">
        {tt("觉得判错了：在内容处理记录里提交反通知或申诉，平台会重新看一遍。")}{" "}
        <a href={contentCasesHref()} target="_blank" rel="noopener noreferrer" className={LINK_BUTTON}>
          {tt("查看原因并申诉")}
        </a>
      </p>
    </div>
  );
}
