"use client";

import { type ReactElement } from "react";
import { useLocale } from "next-intl";
import { normalizeLocale, type Locale } from "../../../i18n/config";
import { useUI } from "../../../i18n/ui/useUI";

function displayDate(value: string, locale: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

/** 截止日期：短胶囊，点开系统日历。不用整行原生日期框。 */
export function BayDeadlineField(props: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}): ReactElement {
  const tt = useUI();
  let locale: Locale = "zh";
  try {
    locale = normalizeLocale(useLocale());
  } catch {
    locale = "zh";
  }
  const filled = Boolean(props.value);
  return (
    <div
      data-bay-deadline-field=""
      className={`relative inline-flex h-11 w-40 items-center gap-2 overflow-hidden rounded-full bg-neutral-200/80 px-4${props.disabled ? " opacity-50" : ""}`}
    >
      <span
        className={`pointer-events-none min-w-0 flex-1 truncate text-[13px] tabular-nums ${filled ? "text-neutral-900" : "text-neutral-400"}`}
      >
        {filled ? displayDate(props.value, locale) : tt("选日期")}
      </span>
      <svg className="pointer-events-none h-4 w-4 shrink-0 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="4" y="6" width="16" height="14" rx="2" />
        <path d="M8 4v4M16 4v4M4 10h16" />
      </svg>
      <input
        type="date"
        data-bay-field="deadline"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        disabled={props.disabled}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </div>
  );
}
