"use client";

// 通话小窗（合同 §1 A4，任务书 P1）：固定在左下角、跨页面常驻（MessagesHost 全局挂载）。
// 会话名、时长、自己的信号；最多 4 格（头像或画面）、放不下显示「+N」；说话亮框不重排；静音标记；
// 五个按钮；转写/录制徽标、字幕一行、问题警告、远程控制提示条、「XX 在共享屏幕 · 查看」、独处倒计时、正在重连。
// 可以拖到四个角之一（记住位置）；窄屏（手机浏览器）变成贴底的一条。
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import { dragStartThreshold } from "../../overlay-geometry";
import { CallControlBanner } from "../control";
import { CallIssueButton, NetworkBars, useNetworkHealth } from "../diagnostics";
import { callActions, useCall } from "../engine";
import { CallCaptionsLine, CallServiceBadges } from "../services";
import { setDockCorner, useCallUiState } from "./call-ui-state";
import { CallControls } from "./CallControls";
import { AloneCountdown, CallStatusLine, SelfShareNotice, ShareNotice } from "./CallNotices";
import { CallTile } from "./CallTile";
import { IconClose, IconHeadphones } from "./icons";
import {
  CALL_DOCK_Z,
  DOCK_WIDTH_PX,
  dockPlacement,
  dockTiles,
  formatCallDuration,
  isLivePhase,
  nearestCorner,
  shareState,
} from "./layout";
import { useNow, useSidebarInsets } from "./use-viewport";

export interface CallDockProps {
  narrow: boolean;
  onExpand(): void;
  /** 结束/出错后的小窗：关掉。 */
  onDismiss(): void;
  /** 从放大视图缩小回来时，焦点落回「放大」按钮。 */
  focusToggleOnMount?: boolean;
  toggleRef?: RefObject<HTMLButtonElement | null>;
  /** 有人要求把焦点给小窗（W08 的「通话中」入口），每次 +1。 */
  focusTick: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  moved: boolean;
  threshold: number;
}

export function CallDock({ narrow, onExpand, onDismiss, focusToggleOnMount = false, toggleRef: externalToggleRef, focusTick }: CallDockProps) {
  const tt = useUI();
  const call = useCall();
  const ui = useCallUiState();
  const health = useNetworkHealth();
  const insets = useSidebarInsets(!narrow);
  const live = isLivePhase(call.phase);
  const now = useNow(live && (Boolean(call.startedAt) || call.aloneDeadline !== null));
  const rootRef = useRef<HTMLElement | null>(null);
  const ownToggleRef = useRef<HTMLButtonElement | null>(null);
  const toggleRef = externalToggleRef ?? ownToggleRef;
  const [drag, setDrag] = useState<DragState | null>(null);
  const [highlight, setHighlight] = useState(false);

  const { tiles, overflow } = useMemo(
    () => dockTiles(call),
    // 只跟格子相关的三项走，媒体音量刷新不重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [call.participants, call.order, call.visibleIds],
  );
  const share = shareState(call);
  const tileKey = tiles.map((tile) => tile.participantId).join("\n");

  // 告诉引擎小窗上看得见谁（只订阅这些人的摄像头）。
  useEffect(() => {
    if (!live) return;
    callActions.setViewport("dock", tileKey ? tileKey.split("\n") : []);
  }, [live, tileKey]);

  useEffect(() => {
    if (focusToggleOnMount) toggleRef.current?.focus();
    // 只在挂载时看一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 「通话中」入口点过来：焦点给小窗，亮一下让人看见它在哪。
  const seenTick = useRef(focusTick);
  useEffect(() => {
    if (focusTick === seenTick.current) return undefined;
    seenTick.current = focusTick;
    rootRef.current?.focus();
    setHighlight(true);
    const timer = window.setTimeout(() => setHighlight(false), 1200);
    return () => window.clearTimeout(timer);
  }, [focusTick]);

  function onHeaderPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (narrow || event.button !== 0) return;
    if ((event.target as Element).closest("button, a, input, [role='menu']")) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      dy: 0,
      moved: false,
      threshold: dragStartThreshold(event.pointerType),
    });
  }

  function onHeaderPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const moved = drag.moved || Math.hypot(dx, dy) >= drag.threshold;
    setDrag({ ...drag, dx, dy, moved });
  }

  function onHeaderPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const rect = rootRef.current?.getBoundingClientRect();
    if (drag.moved && rect) {
      setDockCorner(
        nearestCorner(rect.left + rect.width / 2, rect.top + rect.height / 2, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      );
    }
    setDrag(null);
  }

  const title = call.conversationTitle || tt("通话");
  const duration = live ? formatCallDuration(call.startedAt, now) : "";
  const finished = call.phase === "ended" || call.phase === "error";
  const placement = narrow ? { left: 0, right: 0, bottom: 0 } : dockPlacement(ui.corner, insets);

  return (
    <section
      ref={rootRef}
      tabIndex={-1}
      aria-label={tt("通话：{title}", { title })}
      data-call-dock
      data-narrow={narrow ? "true" : "false"}
      data-corner={narrow ? "bottom" : ui.corner}
      data-phase={call.phase}
      className={`fixed flex flex-col gap-2 border border-black/10 bg-white text-neutral-900 shadow-2xl outline-none dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100 ${
        narrow ? "rounded-t-2xl px-3 pt-2.5" : "rounded-2xl p-3"
      }`}
      style={{
        ...placement,
        zIndex: CALL_DOCK_Z,
        width: narrow ? undefined : DOCK_WIDTH_PX,
        paddingBottom: narrow ? "max(10px, env(safe-area-inset-bottom))" : undefined,
        transform: drag?.moved ? `translate(${drag.dx}px, ${drag.dy}px)` : undefined,
        boxShadow: highlight ? "0 0 0 3px #38bdf8, 0 25px 50px -12px rgba(0,0,0,0.25)" : undefined,
      }}
    >
      <div
        className="flex items-center gap-2"
        data-call-dock-handle
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={() => setDrag(null)}
        style={narrow ? undefined : { cursor: drag?.moved ? "grabbing" : "grab", touchAction: "none" }}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <IconHeadphones size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-5" title={title}>
            {title}
          </p>
        </div>
        {duration ? (
          <span className="shrink-0 text-[12px] tabular-nums text-neutral-500 dark:text-neutral-400" data-call-duration>
            <span className="sr-only">{tt("通话时长")} </span>
            {duration}
          </span>
        ) : null}
        {live ? (
          <span className="flex shrink-0 items-center" data-call-own-network>
            <NetworkBars level={health.level} />
          </span>
        ) : null}
        {live ? <CallIssueButton /> : null}
        {finished ? (
          <button
            type="button"
            data-call-dismiss
            aria-label={tt("关闭通话窗口")}
            title={tt("关闭通话窗口")}
            onClick={() => onDismiss()}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-neutral-400 dark:hover:bg-white/10"
          >
            <IconClose size={16} />
          </button>
        ) : null}
      </div>

      {live ? <CallServiceBadges mode="dock" /> : null}
      <CallStatusLine call={call} />
      {live ? <CallControlBanner /> : null}
      {live && share.other ? <ShareNotice name={share.other.displayName} onView={onExpand} /> : null}
      {live && share.self ? <SelfShareNotice /> : null}
      {live ? <AloneCountdown deadline={call.aloneDeadline} now={now} /> : null}

      {live && tiles.length ? (
        <ul aria-label={tt("在场的人")} data-call-tiles className={`flex items-center gap-1.5 ${narrow ? "justify-start" : "justify-center"}`}>
          {tiles.map((participant) => (
            <CallTile key={participant.participantId} participant={participant} variant="dock" audioOnly={call.me.audioOnly} />
          ))}
          {overflow > 0 ? (
            <li className="flex">
              <button
                type="button"
                data-call-overflow={overflow}
                aria-label={tt("还有 {count} 人，放大查看", { count: overflow })}
                title={tt("还有 {count} 人，放大查看", { count: overflow })}
                onClick={() => onExpand()}
                className="flex h-10 min-w-10 items-center justify-center rounded-xl bg-neutral-100 px-2 text-[13px] font-semibold text-neutral-700 hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:bg-white/10 dark:text-neutral-200 dark:hover:bg-white/15"
              >
                {tt("+{count}", { count: overflow })}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}

      {live ? <CallCaptionsLine mode="dock" /> : null}
      {live ? <CallControls mode="dock" narrow={narrow} onToggleStage={onExpand} toggleRef={toggleRef} /> : null}
    </section>
  );
}
