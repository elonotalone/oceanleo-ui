"use client";

// ============================================================================
// @oceanleo/ui — VideoTimelineStage：预览窗 + 播放控制 + 时间线主区
// ----------------------------------------------------------------------------
// 宿主壳把本组件放右侧主区，把 VideoTimelineControls 放左侧工具栏，两者共享
// 同一个 useVideoTimeline 返回值（三件套模式，同 AdvancedImageEditor）。
// 快捷键挂在 Stage 根节点（需要焦点，tabIndex=0）：Space 播放/暂停、S 分割、
// Delete 删除、Ctrl+Z / Ctrl+Shift+Z 撤销重做、←/→ 逐帧。
// ============================================================================

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useUI } from "../../i18n/ui/useUI";
import { TimelineArea } from "./TimelineArea";
import { findClip, formatMs, validTimelineLibrarySource } from "./timeline-model";
import { ComposerLibraryPicker } from "../ComposerLibraryPicker";
import type { ComposerAttachment } from "../LeoComposer";
import { videoMaterialKind } from "./video-material";
import { VIDEO_TIMELINE_REPLACE_IMAGE_EVENT } from "./video-edit-bar";
import { TIMELINE_LIBRARY_IMAGE_ERROR_EVENT, type TimelineClip } from "./types";
import { AnchoredPopover } from "../anchored-popover";
import {
  clampTimelinePxPerSecond,
  timelineAnchorMs,
  timelineScrollLeftForAnchor,
} from "./timeline-viewport";
import type { VideoTimelineState } from "./use-video-timeline";

/** Reuse the private Library picker across projects, filtering by actual media kind. */
export async function loadTimelineImageLibrary(signal: AbortSignal) {
  const { listMyArtifacts } = await import("../artifact-client");
  const result = await listMyArtifacts({ limit: 100, signal });
  return result.ok && result.data
    ? { ok: true, data: { items: result.data.items.filter(item => videoMaterialKind(item) === "image") } }
    : { ok: false };
}

/** Validate owner-checked full image availability; persist only the immutable identity. */
export async function timelineLibraryImageReplacement(file: ComposerAttachment): Promise<Partial<TimelineClip>> {
  const library_source = { artifactId: file.artifactId || "", revisionId: file.revisionId || "", rendition: "full" as const };
  if (!validTimelineLibrarySource(library_source)) throw new Error("这份素材没能插入，请重试");
  const { refreshArtifactRendition } = await import("../artifact-client");
  const result = await refreshArtifactRendition(library_source, "full");
  if (!result.ok || !result.data?.url || !result.data.mediaType.startsWith("image/")) throw new Error("这份素材没能插入，请重试");
  return { library_source, source_ref: undefined, source_url: undefined, label: file.name };
}

/** Every timeline stage hosts its own replacement picker; late async results are ignored. */
export function TimelineImageReplacementPicker({ state, readOnly = false, fallbackAnchorRef }: { state: VideoTimelineState; readOnly?: boolean; fallbackAnchorRef?: RefObject<HTMLElement | null> }) {
  const tt = useUI();
  const latest = useRef({ state, readOnly });
  latest.current = { state, readOnly };
  const request = useRef(0);
  const anchorRef = useRef<HTMLElement | null>(null);
  const [clipId, setClipId] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const close = () => { request.current += 1; setClipId(""); setBusy(false); setFailed(false); };
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const current = latest.current;
      if (current.readOnly || detail?.doc !== current.state.doc) return;
      if (findClip(current.state.doc, detail.clipId)?.track.kind !== "image") return;
      anchorRef.current = detail.anchor instanceof HTMLElement && detail.anchor.isConnected
        ? detail.anchor : fallbackAnchorRef?.current ?? null;
      request.current += 1; setClipId(detail.clipId); setBusy(false); setFailed(false);
    };
    const failure = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      const clip = findClip(latest.current.state.doc, detail?.clipId)?.clip;
      if (clip?.library_source && JSON.stringify(clip.library_source) === JSON.stringify(detail?.source)) setFailed(true);
    };
    window.addEventListener(VIDEO_TIMELINE_REPLACE_IMAGE_EVENT, open);
    window.addEventListener(TIMELINE_LIBRARY_IMAGE_ERROR_EVENT, failure);
    return () => {
      request.current += 1;
      window.removeEventListener(VIDEO_TIMELINE_REPLACE_IMAGE_EVENT, open);
      window.removeEventListener(TIMELINE_LIBRARY_IMAGE_ERROR_EVENT, failure);
    };
  }, [fallbackAnchorRef]);
  useEffect(() => {
    request.current += 1;
    setClipId(""); setBusy(false);
  }, [readOnly, state.selected?.clip.id]);
  const pick = async (file: ComposerAttachment) => {
    if (latest.current.readOnly || !clipId || busy) return;
    const original = findClip(latest.current.state.doc, clipId)?.clip;
    const id = ++request.current;
    setBusy(true); setFailed(false);
    try {
      const patch = await timelineLibraryImageReplacement(file);
      const current = latest.current;
      if (request.current !== id || current.readOnly || current.state.selected?.clip.id !== clipId || findClip(current.state.doc, clipId)?.clip !== original) return;
      current.state.patchClip(clipId, patch);
      setClipId("");
    } catch { if (request.current === id && !latest.current.readOnly) setFailed(true); }
    finally { if (request.current === id) setBusy(false); }
  };
  return <>
    {failed && !clipId && <p role="alert" className="px-3 py-2 text-[12px] text-[var(--awb-danger)]">{tt("这份素材没能插入，请重试")}</p>}
    {clipId && !readOnly && <AnchoredPopover open anchorRef={anchorRef} onClose={close}
      role="dialog" ariaLabel={tt("替换")} ariaModal={false} lockScroll={false}
      className="rounded-lg border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-3"
      style={{ width: 360, zIndex: 2_147_483_500 }}>
        {failed && <p role="alert" className="px-3 py-2 text-[12px] text-[var(--awb-danger)]">{tt("这份素材没能插入，请重试")}</p>}
        {busy ? <p className="text-[12px] text-[var(--awb-muted)]">{tt("加载中…")}</p> : null}
        <div style={{ pointerEvents: busy ? "none" : undefined, opacity: busy ? .6 : 1 }}>
          <ComposerLibraryPicker load={loadTimelineImageLibrary} onBack={close} onPick={file => { void pick(file); }} />
        </div>
        {busy && <button type="button" onClick={close} className="px-2 py-1 text-[12px]">{tt("取消")}</button>}
    </AnchoredPopover>}
  </>;
}

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
  readOnly = false,
}: {
  state: VideoTimelineState;
  accent?: string;
  /** 只能看：保留播放、暂停、逐帧、拖播放头、缩放；撤销、分割、删除这些改内容的快捷键不响应。 */
  readOnly?: boolean;
}) {
  const tt = useUI();
  const stageRef = useRef<HTMLDivElement | null>(null);

  const zoomTimeline = useCallback(
    (factor: number) => {
      const scroller = stageRef.current?.querySelector<HTMLElement>(
        "[data-video-timeline-scroll]",
      );
      const nextPxPerSecond = clampTimelinePxPerSecond(
        state.pxPerSecond * factor,
      );
      if (!scroller || nextPxPerSecond === state.pxPerSecond) {
        state.setPxPerSecond(nextPxPerSecond);
        return;
      }
      const offsetInViewport = scroller.clientWidth / 2;
      const anchorMs = timelineAnchorMs(
        scroller.scrollLeft,
        offsetInViewport,
        state.pxPerSecond,
      );
      state.setPxPerSecond(nextPxPerSecond);
      requestAnimationFrame(() => {
        scroller.scrollLeft = timelineScrollLeftForAnchor(
          anchorMs,
          offsetInViewport,
          nextPxPerSecond,
        );
      });
    },
    [state],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (readOnly && (key === "delete" || key === "backspace" || key === "s" || key === "z")) {
        // 只读：不改内容的键（空格、方向键）才响应。
        return;
      }
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
    [readOnly, state],
  );

  return (
    <div
      ref={stageRef}
      style={{ position: "relative" }}
      data-collab-readonly={readOnly ? "true" : undefined}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => event.currentTarget.focus()}
      className="flex h-full min-h-0 flex-col outline-none focus-visible:ring-2 focus-visible:ring-[var(--awb-accent,#7c3aed)]/45"
    >
      <TimelineImageReplacementPicker state={state} readOnly={readOnly} fallbackAnchorRef={stageRef} />
      {/* 预览窗 */}
      <div className="flex min-h-0 flex-[3] items-center justify-center bg-[var(--awb-stage-bg,#0c0a09)] p-3">
        {state.loadingSource ? (
          <p className="text-[12px] text-[var(--awb-muted)]">{tt("正在载入素材…")}</p>
        ) : (
          <canvas
            ref={state.canvasRef}
            className="max-h-full max-w-full rounded-md object-contain shadow-lg"
          />
        )}
      </div>

      {/* 播放控制条 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-y border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-2">
        <button
          type="button"
          onClick={() => state.stepFrame(-1)}
          className="rounded-lg border border-[var(--border,#e7e5e4)] px-2 py-1.5 text-[12px] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
          title={tt("上一帧")}
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={state.togglePlay}
          className="rounded-lg px-4 py-1.5 text-[12px] font-semibold text-[var(--awb-on-accent,#fff)]"
          style={{ background: accent }}
        >
          {state.playing ? tt("暂停") : tt("播放")}
        </button>
        <button
          type="button"
          onClick={() => state.stepFrame(1)}
          className="rounded-lg border border-[var(--border,#e7e5e4)] px-2 py-1.5 text-[12px] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
          title={tt("下一帧")}
        >
          ⏭
        </button>
        <span className="tabular-nums text-[12px] text-[var(--fg,#292524)]">
          {formatMs(state.playheadMs, true)}
          <span className="text-[var(--muted,#78716c)]"> / {formatMs(state.durationMs, true)}</span>
        </span>
        <span className="min-w-0 flex-1 truncate text-right text-[11px] text-[var(--muted,#78716c)]">
          {state.error ? (
            <span className="text-[var(--awb-danger)]">{state.error}</span>
          ) : (
            state.notice ||
            (readOnly
              ? tt("空格播放 · ←/→ 逐帧 · Ctrl+滚轮缩放")
              : tt("空格播放 · S 分割 · Delete 删除 · Ctrl+Z 撤销 · Ctrl+滚轮缩放"))
          )}
        </span>
        <div
          data-video-timeline-native-zoom
          className="flex items-center gap-1"
        >
          <button
            type="button"
            onClick={() => zoomTimeline(1 / 1.4)}
            className="rounded-lg border border-[var(--border,#e7e5e4)] px-2 py-1 text-[12px] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
            title={tt("缩小时间线")}
            aria-label={tt("缩小时间线")}
          >
            −
          </button>
          <output
            aria-label={tt("时间线刻度")}
            className="w-14 text-center text-[10px] tabular-nums text-[var(--muted,#78716c)]"
          >
            {state.pxPerSecond}px/s
          </output>
          <button
            type="button"
            onClick={() => zoomTimeline(1.4)}
            className="rounded-lg border border-[var(--border,#e7e5e4)] px-2 py-1 text-[12px] text-[var(--fg-2,#57534e)] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
            title={tt("放大时间线")}
            aria-label={tt("放大时间线")}
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
                : { borderColor: "var(--border)", color: "var(--fg-2)" }
            }
          >
            {tt("吸附")}
          </button>
        </div>
      </div>

      {/* 时间线 */}
      <div className="flex min-h-0 flex-[2] flex-col">
        <TimelineArea state={state} accent={accent} readOnly={readOnly} />
      </div>
    </div>
  );
}
