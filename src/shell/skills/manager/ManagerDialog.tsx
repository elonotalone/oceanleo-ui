"use client";

// W09B — small dialog for the manager's sub-flows (GitHub link, write a skill,
// pick from my skills, pick a project, confirm delete). It is usually opened from
// inside a `ConfigDialogShell`, so it follows the same nesting rules: its own
// portal, Escape / Tab handled on the panel and stopped there (React synthetic
// events bubble through portals, so the outer shell would otherwise close too).

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useUI } from "../../../i18n/ui/useUI";
import {
  ensureOverlayMotionStyles,
  lockBodyScroll,
  runAfterOverlayExit,
  trapTabWithin,
} from "../../anchored-popover";
import { KitIconClose } from "../kit";

const FOCUSABLE =
  'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export interface ManagerDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md";
  testId?: string;
}

export function ManagerDialog(props: ManagerDialogProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    ensureOverlayMotionStyles();
    setMounted(true);
  }, []);
  if (!props.open || !mounted || typeof document === "undefined") return null;
  return createPortal(<ManagerDialogPanel {...props} />, document.body);
}

function ManagerDialogPanel({ onClose, title, description, children, footer, size = "md", testId }: ManagerDialogProps) {
  const tt = useUI();
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const requestClose = useCallback(() => setClosing(true), []);

  useEffect(() => {
    if (!closing) return;
    return runAfterOverlayExit(panelRef.current, () => onCloseRef.current());
  }, [closing]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel) {
      const first = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
        (el) => !el.hasAttribute("data-manager-dialog-close"),
      );
      (first || panel).focus({ preventScroll: true });
    }
    const unlock = lockBodyScroll();
    return () => {
      unlock();
      if (prev && typeof prev.focus === "function" && prev.isConnected) prev.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      requestClose();
      return;
    }
    if (event.key === "Tab") {
      event.stopPropagation();
      trapTabWithin(panelRef.current, event);
    }
  };

  const state = closing ? "closed" : "open";
  return (
    <div
      className="leo-overlay-scrim fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-6"
      data-leo-overlay-state={state}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        data-testid={testId}
        data-manager-dialog=""
        data-leo-overlay-state={state}
        onKeyDown={onKeyDown}
        className={`leo-overlay-panel relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-[20px] bg-white text-[13px] text-neutral-900 shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:rounded-[20px] dark:bg-neutral-900 dark:text-neutral-100 ${
          size === "sm" ? "sm:max-w-[420px]" : "sm:max-w-[600px]"
        }`}
      >
        <button
          type="button"
          data-manager-dialog-close=""
          aria-label={tt("关闭")}
          onClick={requestClose}
          className="absolute right-2.5 top-2.5 inline-flex h-11 w-11 items-center justify-center rounded-full text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <KitIconClose className="h-4 w-4" />
        </button>
        <header className="shrink-0 px-6 pb-3 pr-14 pt-6">
          <h3 id={titleId} className="text-[18px] font-semibold leading-snug">
            {title}
          </h3>
          {description ? (
            <div id={descId} className="mt-1.5 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {description}
            </div>
          ) : null}
        </header>
        {children ? <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">{children}</div> : null}
        {footer ? <footer className="flex shrink-0 justify-end gap-2.5 px-6 pb-6 pt-4">{footer}</footer> : null}
      </div>
    </div>
  );
}

/** Wrap a `FloatingMenu` living inside a `ConfigDialogShell`: Escape closes only the menu. */
export function stopEscapeFromReachingShell(event: KeyboardEvent<HTMLElement>, close: () => void) {
  if (event.key !== "Escape") return;
  // `ConfigDialogShell` ignores keydowns that are already default-prevented. The
  // native event still reaches the popover's own document listener.
  event.preventDefault();
  close();
}
