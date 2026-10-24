"use client";

// Skills overhaul 2026-10-24 — W09A：统一大弹窗壳（UI-DESIGN「大弹窗」；合同 §3.4）。
// 桌面 1040/1120 宽、高 min(86vh,900px)、圆角 24、浅底 #f7f7f5；手机全屏。
// role=dialog + aria-modal + aria-labelledby；Esc / 遮罩 / ✕ 关闭；打开时焦点进面板、
// Tab 在面板内循环、关闭后焦点回到打开前的元素；嵌套弹窗的 Esc 只关最上层。

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../../i18n/ui/useUI";
import {
  ensureOverlayMotionStyles,
  lockBodyScroll,
  runAfterOverlayExit,
  trapTabWithin,
} from "../../anchored-popover";
import { KitIconClose } from "./kit-icons";

export interface ConfigDialogShellProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "lg" | "xl";
  testId?: string;
  /**
   * 仲裁 A-14：关闭前拦一下。返回 `false` 就不关（例如子视图里 Esc 先退回上一层、
   * 有未保存改动时先确认）；不传时行为不变。只拦用户发起的三种关闭，
   * 父组件直接把 `open` 设成 false 不经过它。
   */
  onBeforeClose?: (reason: ConfigDialogCloseReason) => boolean;
}

export type ConfigDialogCloseReason = "escape" | "backdrop" | "close-button";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const CONFIG_DIALOG_WIDTH: Record<"lg" | "xl", string> = {
  lg: "sm:w-[min(1040px,calc(100vw-48px))]",
  xl: "sm:w-[min(1120px,calc(100vw-48px))]",
};

export function ConfigDialogShell(props: ConfigDialogShellProps) {
  const { open } = props;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    ensureOverlayMotionStyles();
    setMounted(true);
  }, []);
  if (!open || !mounted || typeof document === "undefined") return null;
  return createPortal(<ConfigDialogPanel {...props} />, document.body);
}

function ConfigDialogPanel({
  onClose,
  title,
  subtitle,
  toolbar,
  children,
  footer,
  size = "lg",
  testId,
  onBeforeClose,
}: ConfigDialogShellProps) {
  const tt = useUI();
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onBeforeCloseRef = useRef(onBeforeClose);
  onBeforeCloseRef.current = onBeforeClose;
  const requestClose = useCallback((reason: ConfigDialogCloseReason) => {
    const guard = onBeforeCloseRef.current;
    if (guard && guard(reason) === false) return;
    setClosing(true);
  }, []);

  useEffect(() => {
    if (!closing) return;
    return runAfterOverlayExit(panelRef.current, () => onCloseRef.current());
  }, [closing]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel) {
      // 跳过右上 ✕：首个焦点落在内容里（搜索框/第一个按钮），没有就落面板本身。
      const candidates = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = candidates.find((el) => !el.hasAttribute("data-config-dialog-close"));
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
      // React 合成事件会沿组件树穿过 portal 冒泡：内层弹窗处理完就截住，外层不跟着关。
      event.stopPropagation();
      event.preventDefault();
      requestClose("escape");
      return;
    }
    if (event.key === "Tab") {
      // 同理：外层弹窗看不到内层（不同 portal），让它接手会把焦点拽回外层。
      event.stopPropagation();
      trapTabWithin(panelRef.current, event);
    }
  };

  const state = closing ? "closed" : "open";
  return (
    <div
      className="leo-overlay-scrim fixed inset-0 z-[1000] flex items-stretch justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-6"
      data-leo-overlay-state={state}
      data-config-dialog-scrim=""
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose("backdrop");
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descId : undefined}
        tabIndex={-1}
        data-testid={testId}
        data-config-dialog=""
        data-size={size}
        data-leo-overlay-state={state}
        onKeyDown={onKeyDown}
        className={`leo-overlay-panel relative flex h-full w-full flex-col overflow-hidden bg-[#f7f7f5] text-[13px] text-neutral-900 shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500/60 sm:h-[min(86vh,900px)] sm:rounded-[24px] dark:bg-neutral-900 dark:text-neutral-100 ${CONFIG_DIALOG_WIDTH[size]}`}
      >
        <button
          type="button"
          data-config-dialog-close=""
          aria-label={tt("关闭")}
          onClick={() => requestClose("close-button")}
          className="absolute right-3 top-3 inline-flex h-11 w-11 items-center justify-center rounded-full text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-200/70 hover:text-neutral-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 sm:right-5 sm:top-5 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <KitIconClose className="h-4 w-4" />
        </button>
        <header className="shrink-0 px-5 pb-4 pr-16 pt-6 sm:px-10 sm:pt-9">
          <h2 id={titleId} className="text-[18px] font-semibold leading-tight tracking-[-0.01em]">
            {title}
          </h2>
          {subtitle ? (
            <div id={descId} className="mt-2 text-[13px] leading-relaxed text-neutral-500 dark:text-neutral-400">
              {subtitle}
            </div>
          ) : null}
          {toolbar ? <div className="mt-6">{toolbar}</div> : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-10 sm:pb-9" data-config-dialog-body="">
          {children}
        </div>
        {footer ? (
          <footer className="shrink-0 border-t border-neutral-200 px-5 py-4 sm:px-10 dark:border-neutral-800">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/** 说明行里的「· 查看我的技能」式下划线链接（按钮语义）。 */
export function ConfigDialogLink({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const cls =
    "underline decoration-neutral-400 underline-offset-[3px] transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:text-neutral-900 hover:decoration-neutral-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:hover:text-neutral-100";
  return (
    <>
      <span aria-hidden="true" className="mx-1.5">
        ·
      </span>
      {href ? (
        <a href={href} className={cls}>
          {children}
        </a>
      ) : (
        <button type="button" onClick={onClick} className={cls}>
          {children}
        </button>
      )}
    </>
  );
}
