"use client";

// LeoChat 小窗：圆角悬浮版面，顶栏按下即拖（阈值与编辑栏相同），贴底时变矮而不是抹平圆角。
// 顶栏：标志 + 名字、栏目（聊天 / 联系人）、放大 / 还原、关闭。放大后是一块居中的大窗口：左列表、右对话。没有整页版。
// 按键只在焦点落在浮层内时处理：Esc 关浮层，其余按键不再向文档冒泡。
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useUI } from "../../i18n/ui/useUI";
import { DOCK_MAX, DOCK_MIN, clampDockWidth, type MessagesLayoutKind } from "./host-state";
import { ImCloseIcon, ImCollapseIcon, ImExpandIcon, LeoChatMark, ensureMessagesSurfaceStyles } from "./messages-surface";
import {
  MESSAGES_DEFAULT_HEIGHT_PX,
  MESSAGES_OVERLAY_RADIUS_PX,
  MESSAGES_OVERLAY_Z,
  defaultOverlayOffset,
  dragStartThreshold,
  overlayBox,
  type OverlayOffset,
} from "./overlay-geometry";

export interface MessagesLayoutProps {
  layout: MessagesLayoutKind;
  dockWidth: number;
  overlayOffset: OverlayOffset | null;
  onDockWidth: (width: number) => void;
  onOverlayOffset: (offset: OverlayOffset) => void;
  onClose: () => void;
  overlayState: "open" | "closed";
  onExitComplete: () => void;
  title: string;
  /** 顶栏中间：栏目切换（聊天 / 联系人）。 */
  tabs?: ReactNode;
  /** 放大 / 还原；窄屏（mobile）上不显示这个键。 */
  onToggleExpand?: () => void;
  /** 左栏：聊天 / 联系人。 */
  list: ReactNode;
  /** 右栏：当前会话；没有选中会话时为 null。 */
  detail: ReactNode | null;
  /** 手机与停靠布局里，有会话时只显示会话。 */
  showDetail: boolean;
  children?: ReactNode;
}

const CLICK_SWALLOW_MS = 500;
const CLICK_SWALLOW_SLOP_PX = 12;

function readViewport() {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function isNoDragTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-im-no-drag]"));
}

export function MessagesLayout(props: MessagesLayoutProps) {
  const tt = useUI();
  const {
    layout,
    dockWidth,
    overlayOffset,
    onDockWidth,
    onOverlayOffset,
    onClose,
    overlayState,
    onExitComplete,
    title,
    tabs,
    onToggleExpand,
    list,
    detail,
    showDetail,
  } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const widthDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const moveDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origin: OverlayOffset;
    moved: boolean;
    lastOffset: OverlayOffset | null;
  } | null>(null);
  const dragBoxRef = useRef<ReturnType<typeof overlayBox> | null>(null);
  const moveCleanupRef = useRef<(() => void) | null>(null);
  const overlayOffsetCommitRef = useRef(onOverlayOffset);
  overlayOffsetCommitRef.current = onOverlayOffset;
  const suppressClickRef = useRef<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    ensureMessagesSurfaceStyles();
  });

  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (overlayState !== "closed") return undefined;
    const handle = window.setTimeout(onExitComplete, 400);
    return () => window.clearTimeout(handle);
  }, [overlayState, onExitComplete]);

  useEffect(() => {
    const onResize = () => setViewport(readViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const point = suppressClickRef.current;
      if (!point) return;
      if (Math.hypot(event.clientX - point.x, event.clientY - point.y) > CLICK_SWALLOW_SLOP_PX) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = null;
    };
    window.addEventListener("click", handler, true);
    return () => window.removeEventListener("click", handler, true);
  }, []);

  const width = Math.min(DOCK_MAX, Math.max(DOCK_MIN, dockWidth));
  const offset = overlayOffset ?? defaultOverlayOffset(viewport, width);
  const box = overlayBox({
    offset,
    width,
    preferredHeight: MESSAGES_DEFAULT_HEIGHT_PX,
    viewport,
    expanded: layout !== "docked",
  });
  const painted = dragBoxRef.current ?? box;

  const paintBox = (next: ReturnType<typeof overlayBox>) => {
    dragBoxRef.current = next;
    const el = rootRef.current;
    if (!el) return;
    el.style.top = `${next.top}px`;
    el.style.left = `${next.left}px`;
    el.style.width = `${next.width}px`;
    el.style.height = `${next.height}px`;
  };

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
    widthDragRef.current = { startX: event.clientX, startWidth: dockWidth };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onHandleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = widthDragRef.current;
    if (!drag) return;
    onDockWidth(clampDockWidth(drag.startWidth + (drag.startX - event.clientX)));
  };
  const onHandleUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    widthDragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const clearDragPaint = () => {
    const el = rootRef.current;
    if (!el) return;
    el.removeAttribute("data-im-dragging");
    el.style.viewTransitionName = "oceanleo-messages-overlay";
  };

  const detachMoveListeners = () => {
    moveCleanupRef.current?.();
    moveCleanupRef.current = null;
  };

  const finishMoveDrag = (event: PointerEvent | null, moved: boolean) => {
    const drag = moveDragRef.current;
    if (event && drag && drag.pointerId !== event.pointerId) return;
    const lastOffset = drag?.lastOffset ?? null;
    const pointerId = drag?.pointerId ?? event?.pointerId;
    moveDragRef.current = null;
    detachMoveListeners();
    if (pointerId != null) {
      try {
        handleRef.current?.releasePointerCapture?.(pointerId);
      } catch {
        /* jsdom */
      }
    }
    if (moved && lastOffset) overlayOffsetCommitRef.current(lastOffset);
    else dragBoxRef.current = null;
    clearDragPaint();
    if (moved && event) {
      suppressClickRef.current = { x: event.clientX, y: event.clientY };
      window.setTimeout(() => {
        suppressClickRef.current = null;
      }, CLICK_SWALLOW_MS);
    }
  };

  useEffect(() => {
    if (moveDragRef.current) return;
    dragBoxRef.current = null;
  }, [overlayOffset]);

  useEffect(
    () => () => {
      detachMoveListeners();
      moveDragRef.current = null;
    },
    [],
  );

  const onHeaderPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (isNoDragTarget(event.target)) return;
    // 拦住选区 / 原生拖拽，否则从「消息」两字上按下会被当成划词，看起来像拖不动。
    event.preventDefault();
    event.stopPropagation();
    if (moveDragRef.current) finishMoveDrag(null, false);
    const origin = { x: painted.left, y: painted.top };
    const pointerId = event.pointerId;
    const handle = event.currentTarget;
    moveDragRef.current = {
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin,
      moved: false,
      lastOffset: null,
    };
    const threshold = dragStartThreshold(event.pointerType);
    const dragWidth = width;
    const dragExpanded = layout !== "docked";

    const matching = (next: PointerEvent) => next.pointerId === pointerId;
    const handleMove = (next: PointerEvent) => {
      if (!matching(next)) return;
      // 丢掉 capture 时 Chromium 会补一次 buttons=0 的 move。那不是抬起。触屏不要看 buttons。
      if (next.pointerType === "mouse" && next.buttons === 0) return;
      const drag = moveDragRef.current;
      if (!drag) return;
      const dist = Math.hypot(next.clientX - drag.startX, next.clientY - drag.startY);
      if (!drag.moved && dist < threshold) return;
      if (!drag.moved) {
        const el = rootRef.current;
        el?.setAttribute("data-im-dragging", "true");
        if (el) el.style.viewTransitionName = "none";
      }
      drag.moved = true;
      next.preventDefault();
      const lastOffset = {
        x: drag.origin.x + (next.clientX - drag.startX),
        y: drag.origin.y + (next.clientY - drag.startY),
      };
      drag.lastOffset = lastOffset;
      paintBox(
        overlayBox({
          offset: lastOffset,
          width: dragWidth,
          preferredHeight: MESSAGES_DEFAULT_HEIGHT_PX,
          viewport: readViewport(),
          expanded: dragExpanded,
        }),
      );
    };
    const handleUp = (next: PointerEvent) => {
      if (!matching(next)) return;
      finishMoveDrag(next, Boolean(moveDragRef.current?.moved));
    };
    let recapturing = false;
    const handleLost = (next: PointerEvent) => {
      if (!matching(next) || recapturing || !moveDragRef.current) return;
      recapturing = true;
      try {
        handle.setPointerCapture?.(pointerId);
      } catch {
        /* 没有指针捕获时窗口监听仍然跟手 */
      } finally {
        recapturing = false;
      }
    };
    const handleCancel = (next: PointerEvent) => {
      if (!matching(next)) return;
      // 鼠标丢 capture 时 Chromium 可能发 pointercancel；那不是松手。触屏 cancel 才是系统抢走手势。
      if (next.pointerType === "mouse") {
        handleLost(next);
        return;
      }
      handleUp(next);
    };
    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", handleUp, true);
    window.addEventListener("pointercancel", handleCancel, true);
    handle.addEventListener("lostpointercapture", handleLost);
    moveCleanupRef.current = () => {
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", handleUp, true);
      window.removeEventListener("pointercancel", handleCancel, true);
      handle.removeEventListener("lostpointercapture", handleLost);
    };
    try {
      handle.setPointerCapture?.(pointerId);
    } catch {
      /* jsdom */
    };
  };

  const expandLabel = layout === "full" ? tt("还原成小窗") : tt("放大");
  const header = (
    <div
      ref={handleRef}
      data-im-drag-handle
      onPointerDown={layout === "docked" ? onHeaderPointerDown : undefined}
      onDragStart={(event) => event.preventDefault()}
      className={`flex shrink-0 select-none items-center gap-3 border-b border-black/10 px-3 dark:border-white/10 ${
        layout === "docked" ? "cursor-grab touch-none active:cursor-grabbing" : ""
      }`}
    >
      <span className="flex shrink-0 items-center gap-2" data-im-brand>
        <LeoChatMark />
        <span className="text-[14px] font-bold tracking-tight">{title}</span>
      </span>
      <div className="flex min-w-0 flex-1 justify-center">{tabs}</div>
      <div className="flex shrink-0 items-center gap-1">
        {onToggleExpand && layout !== "mobile" ? (
          <button
            type="button"
            data-im-no-drag
            data-im-chrome-btn
            data-leochat-expand={layout === "full" ? "collapse" : "expand"}
            onClick={onToggleExpand}
            aria-label={expandLabel}
            title={expandLabel}
          >
            {layout === "full" ? <ImCollapseIcon /> : <ImExpandIcon />}
          </button>
        ) : null}
        <button type="button" data-im-no-drag data-im-chrome-btn onClick={onClose} aria-label={tt("关闭")} title={tt("关闭")}>
          <ImCloseIcon />
        </button>
      </div>
    </div>
  );

  let body: ReactNode;
  if (layout === "full") {
    body = (
      <div className="flex min-h-0 flex-1">
        <div data-im-side className="flex w-[340px] shrink-0 flex-col border-r border-black/10 dark:border-white/10">
          {list}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {detail ?? (
            <div data-im-empty className="m-auto flex max-w-xs flex-col items-center px-6 text-center">
              <LeoChatMark large />
              <p className="mt-4 text-[15px] font-semibold tracking-tight">{tt("选一个会话开始聊天")}</p>
              <p className="mt-1 text-[13px] text-black/45 dark:text-white/45">{tt("左边是你的聊天和联系人。在 LeoBay 里联系卖家，对话也会出现在这里。")}</p>
            </div>
          )}
        </div>
      </div>
    );
  } else {
    body = (
      <div className="flex min-h-0 flex-1 flex-col" data-im-panes="">
        <div data-im-pane="list" data-im-pane-active={showDetail ? "false" : "true"}>
          {list}
        </div>
        <div data-im-pane="detail" data-im-pane-active={showDetail && detail ? "true" : "false"}>
          {detail}
        </div>
      </div>
    );
  }

  const node = (
    <div
      ref={rootRef}
      role="dialog"
      aria-label={title}
      data-testid="messages-overlay"
      data-layout={layout}
      data-im-overlay-state={overlayState}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => event.stopPropagation()}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget) return;
        if (overlayState === "closed") onExitComplete();
      }}
      className="fixed flex flex-col overflow-hidden border border-black/10 bg-white text-black focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-neutral-400 dark:border-white/10 dark:bg-neutral-900 dark:text-white"
      style={{
        top: painted.top,
        left: painted.left,
        width: painted.width,
        height: painted.height,
        zIndex: MESSAGES_OVERLAY_Z,
        borderRadius: MESSAGES_OVERLAY_RADIUS_PX,
        isolation: "isolate",
        pointerEvents: overlayState === "open" ? "auto" : "none",
        viewTransitionName: "oceanleo-messages-overlay",
      }}
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
          className="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize hover:bg-neutral-400/40"
        />
      ) : null}
      {header}
      {props.children}
      {body}
    </div>
  );
  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}
