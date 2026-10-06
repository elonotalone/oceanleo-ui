"use client";

// 消息浮层的三种布局：停靠（桌面右侧，可拖宽 360–720）、全屏（左收件箱 + 右会话）、手机（单栏）。
// 按键只在焦点落在浮层内时处理：Esc 关浮层，其余按键不再向文档冒泡，编辑器的全局快捷键不会被误触发。
import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../i18n/ui/useUI";
import { DOCK_MAX, DOCK_MIN, clampDockWidth, type MessagesLayoutKind } from "./host-state";

export interface MessagesLayoutProps {
  layout: MessagesLayoutKind;
  dockWidth: number;
  onDockWidth: (width: number) => void;
  onClose: () => void;
  onToggleExpand: () => void;
  /** 左栏：收件箱 / 联系人 / 搜索 / 设置。 */
  list: ReactNode;
  /** 右栏：当前会话；没有选中会话时为 null。 */
  detail: ReactNode | null;
  /** 手机与停靠布局里，有会话时只显示会话。 */
  showDetail: boolean;
  children?: ReactNode;
}

export function MessagesLayout(props: MessagesLayoutProps) {
  const tt = useUI();
  const { layout, dockWidth, onDockWidth, onClose, onToggleExpand, list, detail, showDetail } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    // 打开时把焦点移进浮层，这样 Esc 与方向键才在浮层内生效。
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && !event.nativeEvent.isComposing) {
        event.preventDefault();
        onClose();
      }
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation?.();
    },
    [onClose],
  );

  const onHandleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: event.clientX, startWidth: dockWidth };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onHandleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    onDockWidth(clampDockWidth(drag.startWidth + (drag.startX - event.clientX)));
  };
  const onHandleUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const header = (
    <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-black/10 px-3 dark:border-white/10">
      <div className="text-sm font-semibold">{tt("消息")}</div>
      <div className="flex items-center gap-1">
        {layout !== "mobile" ? (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={layout === "full" ? tt("缩回右侧") : tt("放大到全屏")}
            title={layout === "full" ? tt("缩回右侧") : tt("放大到全屏")}
            className="rounded-md px-2 py-1 text-xs text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
          >
            {layout === "full" ? "⤡" : "⤢"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          aria-label={tt("关闭消息")}
          title={tt("关闭消息")}
          className="rounded-md px-2 py-1 text-sm text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
        >
          ✕
        </button>
      </div>
    </div>
  );

  let body: ReactNode;
  if (layout === "full") {
    body = (
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[360px] shrink-0 flex-col border-r border-black/10 dark:border-white/10">{list}</div>
        <div className="flex min-w-0 flex-1 flex-col">
          {detail ?? (
            <div className="m-auto text-sm text-black/45 dark:text-white/45">{tt("选一个会话开始聊天")}</div>
          )}
        </div>
      </div>
    );
  } else {
    body = <div className="flex min-h-0 flex-1 flex-col">{showDetail && detail ? detail : list}</div>;
  }

  const baseClass =
    "fixed z-[1100] flex flex-col bg-white text-black shadow-2xl outline-none dark:bg-neutral-900 dark:text-white";
  const style =
    layout === "docked"
      ? { top: 0, right: 0, bottom: 0, width: Math.min(DOCK_MAX, Math.max(DOCK_MIN, dockWidth)) }
      : undefined;
  const positionClass = layout === "docked" ? "border-l border-black/10 dark:border-white/10" : "inset-0";

  const node = (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={tt("消息")}
      data-testid="messages-overlay"
      data-layout={layout}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => event.stopPropagation()}
      className={`${baseClass} ${positionClass}`}
      style={style}
    >
      {layout === "docked" ? (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={tt("拖动调整宽度")}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          className="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-sky-400/40"
        />
      ) : null}
      {header}
      {body}
      {props.children}
    </div>
  );
  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
