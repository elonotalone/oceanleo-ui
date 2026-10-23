"use client";

import { type ReactElement, type ReactNode } from "react";
import { MenuSelect } from "../../menu-select";
import { BAY_FORM_HELP_CLASS } from "./form-ui";

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
 * 几选一。默认同屏列出选项；`collapsible` 与项目、Library、LeoBay 使用同一件 MenuSelect。
 * 菜单挂到 body，编辑卡片与侧栏的滚动区域不会裁掉选项。
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
  const current = props.options.find((option) => option.value === props.value);

  function optionButton(option: BayChoiceOption<T>, selected: boolean): ReactElement {
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
        {props.options.map((option) => optionButton(option, option.value === props.value))}
      </div>
    );
  }

  return (
    <div role="group" aria-label={props.label} data-bay-choice="" data-bay-choice-collapsed="">
      <MenuSelect
        name="bay-choice"
        ariaLabel={props.label || current?.title || ""}
        value={props.value || ""}
        placeholder={props.label}
        disabled={props.disabled}
        onChange={(next) => {
          const option = props.options.find((row) => row.value === next && !row.disabled);
          if (option) props.onChange(option.value);
        }}
        options={props.options.map((option) => ({
          value: option.value,
          label: option.title,
          description: typeof option.detail === "string" ? option.detail : undefined,
          disabled: option.disabled,
          attrs: {
            ...props.optionProps?.(option.value),
            "data-bay-choice-option": option.value,
            "data-bay-choice-selected": option.value === props.value ? "" : undefined,
          },
        }))}
        triggerProps={{
          ...(current ? props.optionProps?.(current.value) : {}),
          "data-bay-choice-option": current?.value,
          "data-bay-choice-selected": current ? "" : undefined,
          "data-bay-menu-trigger": "",
        }}
        menuProps={{ "data-bay-choice-menu": "", "data-bay-menu": "" }}
      />
    </div>
  );
}
