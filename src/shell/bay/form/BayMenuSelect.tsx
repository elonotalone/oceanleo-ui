"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { BAY_FORM_LABEL_CLASS, BAY_FORM_SELECT_CLASS } from "./form-ui";

export type BayMenuOption = {
  value: string;
  label: string;
  attrs?: Record<string, string | undefined>;
};

/**
 * 填写页的下拉：外面是一条完整的选择条，点开是白底圆角清单。
 * 底下留一个原生 select 给测试和读屏改值。
 */
export function BayMenuSelect(props: {
  label?: string;
  value: string;
  options: readonly BayMenuOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  emptyLabel?: string;
  /** 选择条宽度；不传则 256，避免铺满整列。 */
  maxWidth?: number;
  selectProps?: Record<string, string | undefined>;
}): ReactElement {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const current = props.options.find((option) => option.value === props.value);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && (menuRef.current?.contains(target) || triggerRef.current?.contains(target))) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: string) {
    props.onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  const menu = open && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={menuRef}
          id={listId}
          role="listbox"
          data-bay-menu=""
          data-bay-menu-scroll=""
          style={menuStyle(triggerRef.current)}
          className="z-50 rounded-xl border border-neutral-200 bg-white p-1 shadow-lg"
        >
          {props.options.map((option) => {
            const selected = option.value === props.value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                data-value={option.value}
                {...option.attrs}
                onClick={() => pick(option.value)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px] ${
                  selected ? "bg-neutral-900 font-medium text-white" : "text-neutral-800 hover:bg-neutral-50"
                }`}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {selected ? (
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5 shrink-0">
                    <path d="m3.5 8.5 3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </button>
            );
          })}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="block w-full" style={props.maxWidth ? { maxWidth: props.maxWidth } : undefined}>
      {props.label ? <span className={`mb-2 block ${BAY_FORM_LABEL_CLASS}`}>{props.label}</span> : null}
      <div className="relative">
        <select
          {...props.selectProps}
          aria-hidden="true"
          tabIndex={-1}
          value={props.value}
          disabled={props.disabled}
          size={1}
          onChange={(event) => props.onChange(event.target.value)}
          className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
        >
          <option value=""></option>
          {props.options.map((option) => (
            <option key={option.value} value={option.value} {...option.attrs}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          ref={triggerRef}
          type="button"
          disabled={props.disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          data-bay-menu-trigger=""
          onClick={() => setOpen((currentOpen) => !currentOpen)}
          className={BAY_FORM_SELECT_CLASS}
        >
          <span className={`min-w-0 truncate ${current ? "text-neutral-900" : "text-neutral-500"}`}>
            {current?.label || props.emptyLabel || props.placeholder || ""}
          </span>
          <svg className="h-3.5 w-3.5 shrink-0 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {menu}
    </div>
  );
}

function menuStyle(trigger: HTMLButtonElement | null): {
  position: "fixed";
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  overflowY: "auto";
  overflowX: "hidden";
} {
  const rect = trigger?.getBoundingClientRect();
  const width = Math.max(rect?.width || 200, 200);
  const left = rect?.left || 0;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;
  if (!rect) {
    return { position: "fixed", top: 0, left, width, maxHeight: 320, overflowY: "auto", overflowX: "hidden" };
  }
  const spaceBelow = viewportHeight - rect.bottom - 8;
  const spaceAbove = rect.top - 8;
  if (spaceBelow < 160 && spaceAbove > spaceBelow) {
    const height = Math.min(320, Math.max(spaceAbove, 0));
    const top = Math.max(8, rect.top - height - 4);
    const maxHeight = Math.min(320, Math.max(rect.top - 4 - top, 0));
    return { position: "fixed", top, left, width, maxHeight, overflowY: "auto", overflowX: "hidden" };
  }
  const top = rect.bottom + 4;
  const maxHeight = Math.min(320, Math.max(viewportHeight - top - 8, 0));
  return { position: "fixed", top, left, width, maxHeight, overflowY: "auto", overflowX: "hidden" };
}
