"use client";

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { BAY_FORM_HELP_CLASS, BAY_FORM_SELECT_CLASS } from "./form-ui";

export type BayChoiceOption<T extends string> = {
  value: T;
  title: string;
  detail?: ReactNode;
  disabled?: boolean;
};

const TILE =
  "flex w-full items-start gap-3 border-0 bg-white px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const TILE_ON = "bg-neutral-900 text-white";
const TILE_OFF = "text-neutral-900 hover:bg-neutral-50";

/**
 * 几选一。默认同屏列出选项；`collapsible` 时收成一条选择条，点开的清单用绝对定位
 * 盖住下面的字段——一次只填一项，页面高度不跟着弹开。
 */
export function BayChoice<T extends string>(props: {
  label?: string;
  options: BayChoiceOption<T>[];
  value: T | "" | null | undefined;
  onChange: (value: T) => void;
  columns?: 1 | 2 | 3;
  disabled?: boolean;
  collapsible?: boolean;
  optionProps?: (value: T) => Record<string, string | undefined>;
}): ReactElement {
  const hasSelection = props.options.some((option) => option.value === props.value);
  const [expanded, setExpanded] = useState(() => !(props.collapsible && hasSelection));
  const boxRef = useRef<HTMLDivElement | null>(null);
  const collapsed = Boolean(props.collapsible) && hasSelection && !expanded;
  const current = props.options.find((option) => option.value === props.value);

  useEffect(() => {
    if (collapsed || !props.collapsible) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && boxRef.current?.contains(target)) return;
      setExpanded(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setExpanded(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [collapsed, props.collapsible]);

  function optionButton(option: BayChoiceOption<T>, selected: boolean, stacked = false): ReactElement {
    if (stacked) {
      return (
        <button
          key={option.value}
          type="button"
          role="option"
          aria-selected={selected}
          aria-pressed={selected}
          data-bay-choice-option={option.value}
          data-bay-choice-selected={selected ? "" : undefined}
          disabled={props.disabled || option.disabled}
          onClick={() => {
            props.onChange(option.value);
            setExpanded(false);
          }}
          className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] disabled:cursor-not-allowed disabled:opacity-50 ${
            selected ? "bg-neutral-900 font-medium text-white" : "text-neutral-800 hover:bg-neutral-50"
          }`}
          {...props.optionProps?.(option.value)}
        >
          <span className="min-w-0 truncate">{option.title}</span>
          {selected ? (
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0" aria-hidden="true">
              <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </button>
      );
    }
    const shape = selected
      ? "rounded-xl border border-neutral-900"
      : "rounded-xl border border-neutral-200 hover:border-neutral-300";
    return (
      <button
        key={option.value}
        type="button"
        aria-pressed={selected}
        data-bay-choice-option={option.value}
        data-bay-choice-selected={selected ? "" : undefined}
        disabled={props.disabled || option.disabled}
        onClick={() => props.onChange(option.value)}
        className={`${TILE} ${shape} ${selected ? TILE_ON : TILE_OFF}`}
        {...props.optionProps?.(option.value)}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold">{option.title}</span>
          {option.detail ? <span className={`mt-0.5 block ${selected ? "text-white/80" : BAY_FORM_HELP_CLASS}`}>{option.detail}</span> : null}
        </span>
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${
            selected ? "border-white bg-white text-neutral-900" : "border-neutral-300 bg-white"
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
  }

  if (!props.collapsible) {
    const cols = props.columns === 3 ? "grid-cols-3" : props.columns === 2 ? "grid-cols-2" : "grid-cols-1";
    const gap = props.columns && props.columns > 1 ? "gap-3" : "gap-0";
    return (
      <div role="group" aria-label={props.label} data-bay-choice="" className={`grid ${cols} ${gap}`}>
        {props.options.map((option) => optionButton(option, option.value === props.value, false))}
      </div>
    );
  }

  return (
    <div ref={boxRef} role="group" aria-label={props.label} data-bay-choice="" data-bay-choice-collapsed={collapsed ? "" : undefined} className={collapsed ? "relative" : "relative z-30"}>
      <button
        type="button"
        disabled={props.disabled}
        aria-expanded={!collapsed}
        aria-haspopup="listbox"
        data-bay-choice-option={collapsed ? current?.value : undefined}
        data-bay-choice-selected={collapsed && current ? "" : undefined}
        onClick={() => setExpanded((open) => !open)}
        className={BAY_FORM_SELECT_CLASS}
        {...(collapsed && current ? props.optionProps?.(current.value) : {})}
      >
        <span className={`min-w-0 truncate ${current ? "text-neutral-900" : "text-neutral-400"}`}>{current?.title || props.label || ""}</span>
        <span aria-hidden="true" data-bay-choice-chevron="" className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center text-neutral-600 ${collapsed ? "" : "rotate-180"}`}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </span>
      </button>
      {collapsed ? null : (
        <div
          role="listbox"
          data-bay-choice-menu=""
          className="absolute inset-x-0 top-full z-30 overflow-hidden rounded-md border border-neutral-300 bg-white shadow-lg"
        >
          <div className="flex flex-col">{props.options.map((option) => optionButton(option, option.value === props.value, true))}</div>
        </div>
      )}
    </div>
  );
}
