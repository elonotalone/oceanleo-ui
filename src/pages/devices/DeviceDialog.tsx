"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../i18n/ui/useUI";
import { lockBodyScroll, trapTabWithin } from "../../shell/anchored-popover";

/** Shared device-only dialog. Nested pickers own Escape/Tab and restore focus. */
export function DeviceDialog({ title, children, footer, onClose, compact = false, testId }: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  compact?: boolean;
  testId?: string;
}) {
  const tt = useUI();
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus({ preventScroll: true });
    const unlock = lockBodyScroll();
    return () => {
      unlock();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      onClose();
    } else if (event.key === "Tab") {
      event.stopPropagation();
      trapTabWithin(ref.current, event);
    }
  }
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/35 p-3 backdrop-blur-[3px] sm:p-7"
      data-device-dialog-scrim onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}
        data-device-dialog={testId ?? ""}
        className={`relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[24px] bg-[#fafafa] text-neutral-900 shadow-2xl outline-none ${compact ? "max-w-2xl" : "max-w-5xl"}`}>
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-neutral-200/70 px-6 py-5 sm:px-9 sm:py-6">
          <h2 id={titleId} className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label={tt("关闭")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-200/60 focus-visible:outline focus-visible:outline-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-9" data-device-dialog-body>{children}</div>
        {footer && <footer className="shrink-0 border-t border-neutral-200/70 px-6 py-4 sm:px-9">{footer}</footer>}
      </div>
    </div>, document.body,
  );
}

export const DEVICE_BUTTON = "inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45";
export const DEVICE_PRIMARY_BUTTON = "inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45";
