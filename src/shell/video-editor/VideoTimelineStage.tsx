"use client";

// ============================================================================
// @oceanleo/ui — VideoTimelineStage：预览窗 + 播放控制 + 时间线主区
// ----------------------------------------------------------------------------
// 宿主壳把本组件放右侧主区，把 VideoTimelineControls 放左侧工具栏，两者共享
// 同一个 useVideoTimeline 返回值（三件套模式，同 AdvancedImageEditor）。
// 快捷键挂在 Stage 根节点（需要焦点，tabIndex=0）：Space 播放/暂停、S 分割、
// Delete 删除、Ctrl+Z / Ctrl+Shift+Z 撤销重做、←/→ 逐帧。
// ============================================================================

import { useCallback, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { CHROME } from "../editor-chrome";
import { TimelineArea } from "./TimelineArea";
import { formatMs } from "./timeline-model";
import type { VideoTimelineState } from "./use-video-timeline";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function VideoTimelineStage({
  state,
  accent = "#4f46e5",
}: {
  state: VideoTimelineState;
  accent?: string;
}) {
  const tt = useUI();

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
        return;
      }
      if (key === " ") {
        event.preventDefault();
        state.togglePlay();
        return;
      }
      if (key === "s" && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        state.splitAtPlayhead();
        return;
      }
      if (key === "delete" || key === "backspace") {
        event.preventDefault();
        state.deleteSelectedClip();
        return;
      }
      if (key === "arrowleft") {
        event.preventDefault();
        state.stepFrame(-1);
        return;
      }
      if (key === "arrowright") {
        event.preventDefault();
        state.stepFrame(1);
      }
    },
    [state],
  );

  return (
    <div
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => event.currentTarget.focus()}
      className="flex h-full min-h-0 flex-col outline-none"
    >
      {/* 预览窗（视频画布固定黑底，与主题无关） */}
      <div className="flex min-h-0 flex-[3] items-center justify-center bg-stone-950 p-3">
        {state.loadingSource ? (
          <p className="text-[12px] text-stone-400">{tt("正在载入素材…")}</p>
        ) : (
          <canvas
            ref={state.canvasRef}
            className="max-h-full max-w-full rounded-md object-contain shadow-lg"
          />
        )}
      </div>

      {/* 播放控制条 */}
      <div className={`flex shrink-0 flex-wrap items-center gap-2 border-y ${CHROME.border} ${CHROME.surface} px-3 py-2`}>
        <button
          type="button"
          onClick={() => state.stepFrame(-1)}
          className={`rounded-lg border ${CHROME.border} px-2 py-1.5 text-[12px] ${CHROME.fg2} ${CHROME.hover}`}
          title={tt("上一帧")}
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={state.togglePlay}
          className="rounded-lg px-4 py-1.5 text-[12px] font-semibold text-white"
          style={{ background: accent }}
        >
          {state.playing ? tt("暂停") : tt("播放")}
        </button>
        <button
          type="button"
          onClick={() => state.stepFrame(1)}
          className={`rounded-lg border ${CHROME.border} px-2 py-1.5 text-[12px] ${CHROME.fg2} ${CHROME.hover}`}
          title={tt("下一帧")}
        >
          ⏭
        </button>
        <span className={`tabular-nums text-[12px] ${CHROME.fg}`}>
          {formatMs(state.playheadMs, true)}
          <span className={CHROME.muted}> / {formatMs(state.durationMs, true)}</span>
        </span>
        <span className={`min-w-0 flex-1 truncate text-right text-[11px] ${CHROME.muted}`}>
          {state.error ? (
            <span className="text-red-500">{state.error}</span>
          ) : (
            state.notice ||
            tt("空格播放 · S 分割 · Delete 删除 · Ctrl+Z 撤销 · Ctrl+滚轮缩放")
          )}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => state.zoomBy(1 / 1.4)}
            className={`rounded-lg border ${CHROME.border} px-2 py-1 text-[12px] ${CHROME.fg2} ${CHROME.hover}`}
            title={tt("缩小时间线")}
          >
            −
          </button>
          <span className={`w-14 text-center text-[10px] tabular-nums ${CHROME.muted}`}>
            {state.pxPerSecond}px/s
          </span>
          <button
            type="button"
            onClick={() => state.zoomBy(1.4)}
            className={`rounded-lg border ${CHROME.border} px-2 py-1 text-[12px] ${CHROME.fg2} ${CHROME.hover}`}
            title={tt("放大时间线")}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => state.setSnapEnabled(!state.snapEnabled)}
            className="rounded-lg border px-2 py-1 text-[11px]"
            style={
              state.snapEnabled
                ? { borderColor: accent, color: accent, background: `${accent}12` }
                : { borderColor: "var(--border,#e7e5e4)", color: "var(--fg-2,#57534e)" }
            }
          >
            {tt("吸附")}
          </button>
        </div>
      </div>

      {/* 时间线 */}
      <div className="flex min-h-0 flex-[2] flex-col">
        <TimelineArea state={state} accent={accent} />
      </div>
    </div>
  );
}
