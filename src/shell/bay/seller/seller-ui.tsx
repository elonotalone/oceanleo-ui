"use client";

// 卖家目录共用的小件：表单行、输入框、分区卡、提示条、被平台隐藏的说明。按窄宽度排版（浮窗与设置窗）。

import type { ReactNode } from "react";
import { portalHref } from "../../../contracts/domain-family";
import { useUI } from "../../../i18n/ui/useUI";
import type { BayContentCase } from "../../../lib/bay/seller";
import { reasonCodeOf } from "../../../lib/moderation/case-model";
import { reasonLabel } from "../../messages/cases/case-labels";
import {
  BAY_FORM_DANGER_BUTTON_CLASS,
  BAY_FORM_INPUT_CLASS,
  BAY_FORM_PRIMARY_BUTTON_CLASS,
  BAY_FORM_SECONDARY_BUTTON_CLASS,
  BAY_FORM_TEXTAREA_CLASS,
} from "../form/form-ui";

export const INPUT_CLASS = BAY_FORM_INPUT_CLASS;
export const TEXTAREA_CLASS = BAY_FORM_TEXTAREA_CLASS;
export const PRIMARY_BUTTON = BAY_FORM_PRIMARY_BUTTON_CLASS;
export const SECONDARY_BUTTON = BAY_FORM_SECONDARY_BUTTON_CLASS;
export const DANGER_BUTTON = BAY_FORM_DANGER_BUTTON_CLASS;
export const LINK_BUTTON = "font-medium text-stone-900 underline underline-offset-2";

export function SellerField({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px] font-medium text-stone-900">
        <span>{label}</span>
        {hint ? <span className="text-[12px] font-normal text-stone-600">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function SellerCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
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

const CASE_ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * LeoChat 里的「内容处置」（门户 `/leochat?im=cases`；合同 I-4）：查看完整原因、提交反通知或申诉。
 * 给了案件 id 就直接展开那一件（`?im=cases:<id>`）；id 不像案件 id 就当没给。
 */
export function contentCasesHref(caseId?: string | null): string {
  const id = typeof caseId === "string" ? caseId.trim() : "";
  const path = CASE_ID_SHAPE.test(id) ? `/leochat?im=cases:${id}` : "/leochat?im=cases";
  try {
    return portalHref(path);
  } catch {
    return `https://oceanleo.com${path}`;
  }
}

/** 被平台隐藏：其他人看不到；写清原因（有处置记录时）和怎么申诉。 */
export function HiddenByPlatformNotice({ what, caseRow }: { what: "service" | "profile" | "showcase"; caseRow: BayContentCase | null }) {
  const tt = useUI();
  const headline =
    what === "service"
      ? tt("这项人工服务已被平台暂时隐藏，买家现在看不到。")
      : what === "profile"
        ? tt("你的卖家资料已被平台暂时隐藏，其他人现在看不到。")
        : tt("作品集里有内容被平台暂时隐藏，其他人现在看不到。");
  // 认得的原因代码翻成当前语言（sexual、machine:… 之类不亮原文）；认不出的自由文本照旧原样写。
  const known = caseRow ? reasonLabel(tt, caseRow.reason) : "";
  const reason = caseRow
    ? [known || (reasonCodeOf(caseRow.reason) ? "" : caseRow.reason), caseRow.detail]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" · ")
    : "";
  return (
    <div role="status" data-bay-hidden={what} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-5 text-amber-950">
      <p className="font-semibold">{headline}</p>
      <p className="mt-1">{reason ? tt("原因：{reason}", { reason }) : tt("原因在内容处置里。")}</p>
      <p className="mt-1">
        {tt("觉得判错了：在 LeoChat 的内容处置里提交反通知或申诉，平台会重新看一遍。")}{" "}
        <a href={contentCasesHref(caseRow?.id)} target="_blank" rel="noopener noreferrer" className={LINK_BUTTON}>
          {tt("查看原因并申诉")}
        </a>
      </p>
    </div>
  );
}
