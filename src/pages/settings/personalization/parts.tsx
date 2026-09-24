"use client";

import type { CSSProperties } from "react";
import type { UITranslate } from "../../../i18n/ui/useUI";
import type { MemoryKind, PersonalizationApiCode } from "../../../lib/personalization-api";

export const CARD = "rounded-2xl border border-neutral-200 p-5";
export const FIELD =
  "w-full rounded-lg border border-neutral-200 px-3 py-2 text-[14px] outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] focus:border-sky-500 focus:ring-2 focus:ring-sky-100";
export const PRIMARY =
  "rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-800 active:scale-[0.99] disabled:opacity-60";
export const QUIET =
  "rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 disabled:opacity-50";
export const CARD_TITLE = "text-[14px] font-medium text-neutral-900";
export const CARD_DESC = "mt-1 text-[12px] leading-relaxed text-neutral-500";

/** 站点传了主色就染主按钮；不传时与相邻设置面板同一套中性色。 */
export function accentStyle(accent: string | undefined): CSSProperties | undefined {
  return accent ? { backgroundColor: accent } : undefined;
}

export function Note({ kind, text }: { kind: "error" | "ok" | "info"; text: string }) {
  const className =
    kind === "error"
      ? "bg-red-50 text-red-700"
      : kind === "ok"
        ? "bg-emerald-50 text-emerald-700"
        : "bg-neutral-50 text-neutral-600";
  return (
    <div
      data-personalization-note={kind}
      role={kind === "error" ? "alert" : "status"}
      className={`v-fade-in rounded-lg px-3 py-2 text-[13px] ${className}`}
    >
      {text}
    </div>
  );
}

export function notAvailableCopy(tt: UITranslate): string {
  return tt("这项设置还没在你连接的服务上启用。");
}

export function errorCopy(code: PersonalizationApiCode | null | undefined, tt: UITranslate): string {
  switch (code) {
    case "signed_out":
      return tt("登录状态失效了，请重新登录。");
    case "not_available":
      return notAvailableCopy(tt);
    case "not_found":
      return tt("这条记忆已经不在了。");
    case "invalid":
      return tt("内容不符合要求，请修改后再试。");
    case "offline":
      return tt("连不上服务器，检查一下网络再试。");
    case "rate_limited":
      return tt("操作太频繁了，缓一会儿再试。");
    case "server_error":
      return tt("服务器出了点问题，稍后再试。");
    default:
      return tt("这一步没有完成，请稍后重试。");
  }
}

export function kindLabel(kind: MemoryKind, tt: UITranslate): string {
  switch (kind) {
    case "preference":
      return tt("偏好");
    case "recipe":
      return tt("做法");
    default:
      return tt("事实");
  }
}

export const KIND_BADGE: Record<MemoryKind, string> = {
  preference: "bg-sky-50 text-sky-700",
  fact: "bg-emerald-50 text-emerald-700",
  recipe: "bg-amber-50 text-amber-700",
};

/**
 * 导入时被跳过的原因。网关给的是机器码（去重、上限、空行），按词根认，
 * 认不出的中文句子原样给，其余一律收成「没有导入」—— 不把英文码摆到用户脸上。
 */
export function skipReasonCopy(reason: string, tt: UITranslate): string {
  const code = reason.trim().toLowerCase();
  if (/dup|exist|same|repeat/.test(code)) return tt("和已有的记忆重复");
  if (/empty|blank/.test(code)) return tt("内容是空的");
  if (/long|length|char/.test(code)) return tt("内容太长");
  if (/limit|quota|full|max|cap|many|exceed/.test(code)) return tt("记忆条数已到上限");
  if (/[\u3400-\u9fff]/.test(reason)) return reason.trim();
  return tt("没有导入");
}
