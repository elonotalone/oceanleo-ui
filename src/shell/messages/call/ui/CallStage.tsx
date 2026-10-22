"use client";

// 放大视图（合同 §1 A5，任务书 P2）：全窗口浮层（不是新页面）。宫格每页 9 格（窄屏 4 格）可翻页；
// 有人共享屏幕 → 共享画面占主位、人像在侧栏，共享格上挂 W09 的 CallControlLayer；
// 每格有名字、静音、信号、说话亮框、参与者菜单；底部同一组五个按钮 + 转写/录制开关；Esc 或「缩小」回到小窗。
// 可见格变化时调用 setViewport（引擎只订阅看得见的画面）。
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import { lockBodyScroll, trapTabWithin } from "../../../anchored-popover";
import { CallControlBanner, CallControlLayer } from "../control";
import { CallIssueButton, NetworkBars, useNetworkHealth } from "../diagnostics";
import { callActions, useCall, type CallParticipantView } from "../engine";
import { CallCaptionsLine, CallRecordingToggle, CallServiceBadges, CallTranscriptionToggle } from "../services";
import { CallControls, runCallAction } from "./CallControls";
import { AloneCountdown, CallStatusLine, SelfShareNotice } from "./CallNotices";
import { CallTile } from "./CallTile";
import { IconChevronLeft, IconChevronRight, IconCollapse, IconHeadphones } from "./icons";
import {
  CALL_STAGE_Z,
  clampPage,
  formatCallDuration,
  gridShape,
  isLivePhase,
  pageCount,
  pageSlice,
  shareState,
  stageOrder,
  stagePageSize,
} from "./layout";
import { useNow } from "./use-viewport";

export interface CallStageProps {
  narrow: boolean;
  onCollapse(): void;
  /** 有人要求把焦点给通话窗口（W08 的「通话中」入口），每次 +1。 */
  focusTick: number;
}

const PAGER_BUTTON =
  "flex size-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:bg-white/10 dark:text-neutral-200 dark:hover:bg-white/15";

/** 共享画面：别人共享时占主位；自己开了「仅语音」就不收这路画面，给一个「接收画面」。 */
function ShareView({ sharer, audioOnly }: { sharer: CallParticipantView; audioOnly: boolean }) {
  const tt = useUI();
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const sharerId = sharer.participantId;
  const attachScreen = useCallback(
    (element: HTMLVideoElement | null) => {
      setVideoEl(element);
      callActions.attachVideo(element, sharerId, "screen");
    },
    [sharerId],
  );
  const label = tt("{name} 的屏幕", { name: sharer.displayName });
  return (
    <section
      aria-label={label}
      data-call-share={sharerId}
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded-xl bg-neutral-900"
    >
      {audioOnly ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-[13px] text-white/80">
          <p>{tt("仅语音模式下不接收画面。")}</p>
          <button
            type="button"
            onClick={() => runCallAction(() => callActions.setAudioOnly(false))}
            className="rounded-lg bg-white/15 px-3 py-1.5 font-medium text-white hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            {tt("接收画面")}
          </button>
        </div>
      ) : (
        <>
          <video ref={attachScreen} autoPlay playsInline muted data-call-video="screen" className="absolute inset-0 h-full w-full object-contain" />
          <CallControlLayer participantId={sharerId} videoEl={videoEl} />
        </>
      )}
      <span className="pointer-events-none absolute left-2 top-2 max-w-[60%] truncate rounded-md bg-black/55 px-2 py-0.5 text-[12px] text-white">
        {label}
      </span>
    </section>
  );
}

export function CallStage({ narrow, onCollapse, focusTick }: CallStageProps) {
  const tt = useUI();
  const call = useCall();
  const health = useNetworkHealth();
  const live = isLivePhase(call.phase);
  const now = useNow(live && (Boolean(call.startedAt) || call.aloneDeadline !== null));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const [page, setPage] = useState(0);

  const people = useMemo(
    () => stageOrder(call),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [call.participants, call.order],
  );
  const share = shareState(call);
  const layout: "grid" | "share" = share.other ? "share" : "grid";
  const pageSize = stagePageSize(layout, narrow);
  const pages = pageCount(people.length, pageSize);
  const current = clampPage(page, people.length, pageSize);
  const visible = pageSlice(people, current, pageSize);
  const visibleKey = visible.map((participant) => participant.participantId).join("\n");
  const shape = gridShape(visible.length, narrow);

  // 告诉引擎放大视图上看得见谁（翻页、版式切换、有人进出都会变）。
  useEffect(() => {
    if (!live) return;
    callActions.setViewport("stage", visibleKey ? visibleKey.split("\n") : []);
  }, [live, visibleKey]);

  // 版式或页大小变了，页码可能越界：落回最后一页。
  useEffect(() => {
    if (page !== current) setPage(current);
  }, [page, current]);

  // 打开：锁页面滚动、焦点进浮层。
  useEffect(() => {
    const release = lockBodyScroll();
    rootRef.current?.focus();
    return release;
  }, []);

  const seenTick = useRef(focusTick);
  useEffect(() => {
    if (focusTick === seenTick.current) return;
    seenTick.current = focusTick;
    rootRef.current?.focus();
  }, [focusTick]);

  // Esc 缩小、Tab 在浮层里转圈。焦点在浮层外（portal 出去的菜单、举报框、通话检测面板）时不管：那些各管各的 Esc。
  const collapseRef = useRef(onCollapse);
  collapseRef.current = onCollapse;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const root = rootRef.current;
      if (!root || event.defaultPrevented) return;
      const target = event.target as Node | null;
      const inside = Boolean(target && root.contains(target));
      const loose = target === document.body || target === document.documentElement;
      if (!inside && !loose) return;
      if (event.key === "Escape") {
        event.preventDefault();
        collapseRef.current();
        return;
      }
      trapTabWithin(root, event);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const title = call.conversationTitle || tt("通话");
  const duration = live ? formatCallDuration(call.startedAt, now) : "";
  const tiles = visible.map((participant) => (
    <CallTile
      key={participant.participantId}
      participant={participant}
      variant={layout === "share" ? "rail" : "stage"}
      audioOnly={call.me.audioOnly}
      narrow={narrow}
    />
  ));

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-call-stage
      data-layout={layout}
      data-narrow={narrow ? "true" : "false"}
      className="fixed inset-0 flex flex-col bg-white text-neutral-900 outline-none dark:bg-neutral-950 dark:text-neutral-100"
      style={{ zIndex: CALL_STAGE_Z }}
    >
      <header className="flex items-center gap-2 border-b border-black/10 px-3 py-2 dark:border-white/10" style={{ paddingTop: "max(8px, env(safe-area-inset-top))" }}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          <IconHeadphones size={16} />
        </span>
        <h2 id={titleId} className="min-w-0 truncate text-[15px] font-semibold">
          <span className="sr-only">{tt("通话")} · </span>
          {title}
        </h2>
        {duration ? (
          <span className="shrink-0 text-[13px] tabular-nums text-neutral-500 dark:text-neutral-400" data-call-duration>
            <span className="sr-only">{tt("通话时长")} </span>
            {duration}
          </span>
        ) : null}
        <span className="flex shrink-0 items-center" data-call-own-network>
          <NetworkBars level={health.level} />
        </span>
        {narrow ? null : <CallServiceBadges mode="stage" />}
        <div className="flex-1" />
        <CallIssueButton />
        <button
          type="button"
          data-call-collapse
          aria-label={tt("缩小")}
          title={tt("缩小（Esc）")}
          onClick={() => onCollapse()}
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-neutral-700 hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-neutral-200 dark:hover:bg-white/10"
        >
          <IconCollapse size={16} />
          {narrow ? null : <span aria-hidden="true">{tt("缩小")}</span>}
        </button>
      </header>

      <div className="flex flex-col gap-2 px-3 pt-2">
        {narrow ? <CallServiceBadges mode="stage" /> : null}
        <CallStatusLine call={call} />
        <CallControlBanner />
        {share.self ? <SelfShareNotice /> : null}
        <AloneCountdown deadline={call.aloneDeadline} now={now} />
      </div>

      {layout === "share" && share.other ? (
        <div className={`flex min-h-0 flex-1 gap-2 p-3 ${narrow ? "flex-col" : "flex-row"}`}>
          <ShareView sharer={share.other} audioOnly={call.me.audioOnly} />
          <ul
            aria-label={tt("在场的人")}
            data-call-rail
            className={`flex shrink-0 gap-2 ${narrow ? "flex-row overflow-x-auto" : "flex-col overflow-y-auto"}`}
            style={narrow ? { height: 88 } : { width: 240 }}
          >
            {tiles}
          </ul>
        </div>
      ) : (
        <ul
          aria-label={tt("在场的人")}
          data-call-grid={`${shape.cols}x${shape.rows}`}
          className="grid min-h-0 flex-1 gap-2 p-3"
          style={{
            gridTemplateColumns: `repeat(${shape.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${shape.rows}, minmax(0, 1fr))`,
          }}
        >
          {tiles}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label={tt("翻页")} data-call-pager={`${current + 1}/${pages}`} className="flex items-center justify-center gap-3 pb-1">
          <button type="button" aria-label={tt("上一页")} disabled={current === 0} onClick={() => setPage(current - 1)} className={PAGER_BUTTON}>
            <IconChevronLeft size={16} />
          </button>
          <span aria-live="polite" className="text-[12px] tabular-nums text-neutral-600 dark:text-neutral-300">
            {tt("第 {page} / {total} 页", { page: current + 1, total: pages })}
          </span>
          <button type="button" aria-label={tt("下一页")} disabled={current >= pages - 1} onClick={() => setPage(current + 1)} className={PAGER_BUTTON}>
            <IconChevronRight size={16} />
          </button>
        </nav>
      ) : null}

      <div className="px-3">
        <CallCaptionsLine mode="stage" />
      </div>

      <footer
        className={`flex items-center gap-3 border-t border-black/10 px-3 pt-3 dark:border-white/10 ${narrow ? "flex-col" : "flex-row justify-center"}`}
        style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
      >
        <CallControls mode="stage" narrow={narrow} onToggleStage={onCollapse} />
        <div className="flex items-center gap-2" data-call-service-toggles>
          <CallTranscriptionToggle mode="stage" />
          <CallRecordingToggle mode="stage" />
        </div>
      </footer>
    </div>
  );
}
