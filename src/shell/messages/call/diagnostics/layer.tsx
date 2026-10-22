"use client";

// 诊断浮层的层级与「通话检测」对话框外壳。
// 通话小窗/放大视图/通话菜单/举报框的层级（W07 ui/layout.ts）是 1050/1100/1150/1200，共享 `Modal` 只有 z-[1000]，
// 会被压在放大视图下面；所以这里自己做一个同样行为的对话框（portal、遮罩、Esc 关、Tab 循环、锁滚动、还焦点），层级更高。
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ensureOverlayMotionStyles, lockBodyScroll, trapTabWithin } from "../../../anchored-popover";

/** 警告图标的问题浮层（高于小窗、放大视图与通话菜单）。 */
export const DIAG_POPOVER_Z = 1160;
/** 问题浮层里再打开的设备菜单。 */
export const DIAG_MENU_Z = 1170;
/** 「通话检测」对话框。 */
export const DIAG_DIALOG_Z = 1210;

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function DiagDialog({
  onClose,
  labelledBy,
  children,
  className = "",
}: {
  onClose(): void;
  labelledBy: string;
  children: ReactNode;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [root, setRoot] = useState<Element | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    ensureOverlayMotionStyles();
    setRoot(document.fullscreenElement ?? document.body);
  }, []);

  useEffect(() => {
    if (!root) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first || panel)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      trapTabWithin(panelRef.current, event);
    };
    document.addEventListener("keydown", onKey, true);
    const unlock = lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey, true);
      unlock();
      previous?.focus?.();
    };
  }, [root]);

  if (!root) return null;
  return createPortal(
    <div
      className="leo-overlay-scrim fixed inset-0 flex items-center justify-center bg-black/55 p-3 sm:p-4"
      style={{ zIndex: DIAG_DIALOG_Z }}
      data-leo-overlay-state="open"
      data-call-diagnostics-dialog=""
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-leo-overlay-state="open"
        className={`leo-overlay-panel flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-2xl outline-none dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100 ${className}`}
      >
        {children}
      </div>
    </div>,
    root,
  );
}
