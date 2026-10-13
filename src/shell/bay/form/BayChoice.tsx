"use client";

import type { ReactElement, ReactNode } from "react";
import { BAY_FORM_HELP_CLASS } from "./form-ui";

export type BayChoiceOption<T extends string> = {
  value: T;
  title: string;
  detail?: ReactNode;
  disabled?: boolean;
};

const COLUMNS = {
  1: "grid gap-3",
  2: "grid gap-3 sm:grid-cols-2",
  3: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3",
} as const;

const TILE = "flex w-full items-start gap-3 rounded-xl border bg-white px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const TILE_ON = "border-neutral-900 ring-1 ring-neutral-900";
const TILE_OFF = "border-neutral-200 hover:border-neutral-300";

/**
 * 几选一：每个选项一块白底圆角小块，标题加一行说明。选中的那块是深色边框加勾，
 * 没选的是浅边框加空圈——一眼看出有几个选项、现在选的是哪个。
 * 调用方的文案已经 tt()。`optionProps` 用来挂各页自己的 data- 属性。
 */
export function BayChoice<T extends string>(props: {
  label?: string;
  options: BayChoiceOption<T>[];
  value: T | "" | null | undefined;
  onChange: (value: T) => void;
  columns?: 1 | 2 | 3;
  disabled?: boolean;
  optionProps?: (value: T) => Record<string, string | undefined>;
}): ReactElement {
  const columns = props.columns ?? (props.options.length >= 3 ? 3 : 2);
  return (
    <div role="group" aria-label={props.label} data-bay-choice="" className={COLUMNS[columns]}>
      {props.options.map((option) => {
        const selected = option.value === props.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            data-bay-choice-option={option.value}
            data-bay-choice-selected={selected ? "" : undefined}
            disabled={props.disabled || option.disabled}
            onClick={() => props.onChange(option.value)}
            className={`${TILE} ${selected ? TILE_ON : TILE_OFF}`}
            {...props.optionProps?.(option.value)}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-neutral-900">{option.title}</span>
              {option.detail ? <span className={`mt-0.5 block ${BAY_FORM_HELP_CLASS}`}>{option.detail}</span> : null}
            </span>
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${
                selected ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"
              }`}
            >
              {selected ? (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
