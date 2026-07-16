"use client";

// ============================================================================
// @oceanleo/ui — 时间线交互区：刻度尺 + 播放头 + 多轨 clip 拖拽/trim/吸附/缩放
// ----------------------------------------------------------------------------
// 纯交互层：所有修改经 VideoTimelineState 的动作进出；拖拽期间用
// beginGesture/endGesture 把连续 transient 修改折叠成一步 undo。
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useUI } from "../../i18n/ui/useUI";
import { clipEndMs, formatMs, snapDelta, snapPoints } from "./timeline-model";
import type { VideoTimelineState } from "./use-video-timeline";
import type { TimelineClip, TimelineTrack, TrackKind } from "./types";

const RULER_HEIGHT = 28;
const ROW_HEIGHT = 48;
const ROW_GAP = 6;
const SNAP_PX = 8;

const KIND_LABEL: Record<TrackKind, string> = {
  video: "视频",
  audio: "音频",
  text: "文字",
  image: "贴图",
};

const KIND_CLIP_CLASS: Record<TrackKind, string> = {
  video: "border-sky-300 bg-sky-100 text-sky-900",
  audio: "border-emerald-300 bg-emerald-100 text-emerald-900",
  text: "border-amber-300 bg-amber-100 text-amber-900",
  image: "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-900",
};

function clipLabel(track: TimelineTrack, clip: TimelineClip, fallback: string): string {
  if (track.kind === "text") return clip.text || fallback;
  if (clip.source_url) {
    try {
      const name = decodeURIComponent(new URL(clip.source_url).pathname)
        .split("/")
        .filter(Boolean)
        .pop();
      if (name) return name;
    } catch {
      /* 相对/非法 URL */
    }
    return clip.source_url;
  }
  return fallback;
}

interface DragState {
  mode: "move" | "trim-start" | "trim-end" | "playhead";
  clipId: string;
  originStartMs: number;
  originEndMs: number;
  startClientX: number;
  trackKind: TrackKind;
}

export function TimelineArea({
  state,
  accent = "#4f46e5",
}: {
  state: VideoTimelineState;
  accent?: string;
}) {
  const tt = useUI();
  const {
    doc,
    durationMs,
    playheadMs,
    pxPerSecond,
    snapEnabled,
    selectedClipId,
    setPxPerSecond,
    endGesture,
  } = state;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const dragRef = useRef<DragState | null>(null);

  const msToPx = useCallback(
    (ms: number) => (ms / 1000) * pxPerSecond,
    [pxPerSecond],
  );
  const pxToMs = useCallback(
    (px: number) => (px / pxPerSecond) * 1000,
    [pxPerSecond],
  );

  const contentWidth = Math.max(
    640,
    msToPx(Math.max(durationMs, playheadMs) + 15000),
  );

  const clientXToMs = useCallback(
    (clientX: number) => {
      const content = contentRef.current;
      if (!content) return 0;
      return Math.max(0, pxToMs(clientX - content.getBoundingClientRect().left));
    },
    [pxToMs],
  );

  // Ctrl+滚轮缩放，锚定指针下的时间点（原生监听才能 preventDefault）。
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
      const anchorMs = clientXToMs(event.clientX);
      const offsetInView =
        event.clientX - scroller.getBoundingClientRect().left;
      const nextPps = Math.min(480, Math.max(8, Math.round(pxPerSecond * factor)));
      setPxPerSecond(nextPps);
      requestAnimationFrame(() => {
        scroller.scrollLeft = (anchorMs / 1000) * nextPps - offsetInView;
      });
    };
    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [clientXToMs, pxPerSecond, setPxPerSecond]);

  useEffect(
    () => () => {
      if (dragRef.current && dragRef.current.mode !== "playhead") endGesture();
      dragRef.current = null;
    },
    [endGesture],
  );

  // ------------------------------------------------------------- ruler ticks

  const ticks = useMemo(() => {
    const candidates = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const stepSec =
      candidates.find((seconds) => seconds * pxPerSecond >= 64) ?? 600;
    const totalSec = contentWidth / pxPerSecond;
    const list: Array<{ ms: number; label: string }> = [];
    for (let s = 0; s <= totalSec; s += stepSec) {
      list.push({ ms: s * 1000, label: formatMs(s * 1000) });
    }
    return list;
  }, [contentWidth, pxPerSecond]);

  // --------------------------------------------------------------- dragging

  const applySnap = useCallback(
    (edges: number[], excludeIds: string[], rawMs: number): number => {
      if (!snapEnabled) return rawMs;
      const points = snapPoints(doc, excludeIds, playheadMs);
      const thresholdMs = pxToMs(SNAP_PX);
      const delta = snapDelta(edges, points, thresholdMs);
      return delta === null ? rawMs : rawMs + delta;
    },
    [doc, playheadMs, pxToMs, snapEnabled],
  );

  const onClipPointerDown = useCallback(
    (
      event: ReactPointerEvent<HTMLDivElement>,
      track: TimelineTrack,
      clip: TimelineClip,
      mode: DragState["mode"],
    ) => {
      event.stopPropagation();
      event.preventDefault();
      state.selectClip(clip.id);
      state.beginGesture();
      dragRef.current = {
        mode,
        clipId: clip.id,
        originStartMs: clip.start_ms,
        originEndMs: clipEndMs(clip),
        startClientX: event.clientX,
        trackKind: track.kind,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [state],
  );

  const onClipPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.mode === "playhead") return;
      const deltaMs = pxToMs(event.clientX - drag.startClientX);
      if (drag.mode === "move") {
        const rawStart = drag.originStartMs + deltaMs;
        const duration = drag.originEndMs - drag.originStartMs;
        const snapped = applySnap(
          [rawStart, rawStart + duration],
          [drag.clipId],
          rawStart,
        );
        let targetTrackId = "";
        for (const [trackId, node] of rowRefs.current) {
          const rect = node.getBoundingClientRect();
          if (event.clientY >= rect.top && event.clientY <= rect.bottom) {
            const candidate = doc.tracks.find((entry) => entry.id === trackId);
            if (candidate?.kind === drag.trackKind) targetTrackId = trackId;
            break;
          }
        }
        if (!targetTrackId) {
          const holder = doc.tracks.find((entry) =>
            entry.clips.some((c) => c.id === drag.clipId),
          );
          targetTrackId = holder?.id || "";
        }
        if (targetTrackId) {
          state.moveClip(drag.clipId, targetTrackId, Math.max(0, snapped));
        }
        return;
      }
      if (drag.mode === "trim-start") {
        const raw = drag.originStartMs + deltaMs;
        state.trimClip(
          drag.clipId,
          "start",
          applySnap([raw], [drag.clipId], raw),
        );
        return;
      }
      const raw = drag.originEndMs + deltaMs;
      state.trimClip(drag.clipId, "end", applySnap([raw], [drag.clipId], raw));
    },
    [applySnap, doc.tracks, pxToMs, state],
  );

  const onClipPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      state.endGesture();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [state],
  );

  const onClipPointerCancel = useCallback(() => {
    if (!dragRef.current || dragRef.current.mode === "playhead") return;
    dragRef.current = null;
    state.endGesture();
  }, [state]);

  const onRulerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragRef.current = {
        mode: "playhead",
        clipId: "",
        originStartMs: 0,
        originEndMs: 0,
        startClientX: event.clientX,
        trackKind: "video",
      };
      state.seek(clientXToMs(event.clientX));
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [clientXToMs, state],
  );

  const onRulerPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragRef.current?.mode !== "playhead") return;
      state.seek(clientXToMs(event.clientX));
    },
    [clientXToMs, state],
  );

  const onRulerPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragRef.current?.mode !== "playhead") return;
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const onRulerPointerCancel = useCallback(() => {
    if (dragRef.current?.mode === "playhead") dragRef.current = null;
  }, []);

  // ------------------------------------------------------------------ render

  const playheadX = msToPx(playheadMs);

  return (
    <div className="flex min-h-0 flex-1 select-none overflow-y-auto bg-[var(--card,#ffffff)]">
      {/* 轨道标签列 */}
      <div className="w-24 shrink-0 border-r border-[var(--border,#e7e5e4)] bg-[var(--surface,#fafaf9)]">
        <div
          className="flex items-center px-2 text-[10px] text-[var(--muted,#78716c)]"
          style={{ height: RULER_HEIGHT }}
        >
          {tt("轨道")}
        </div>
        {doc.tracks.map((track, index) => {
          const isBaseVideo =
            track.kind === "video" &&
            doc.tracks.findIndex((entry) => entry.kind === "video") === index;
          return (
            <div
              key={track.id}
              className="flex items-center justify-between gap-1 px-2"
              style={{ height: ROW_HEIGHT, marginBottom: ROW_GAP }}
            >
              <span className="truncate text-[11px] text-[var(--fg-2,#57534e)]">
                {tt(KIND_LABEL[track.kind])}
                {isBaseVideo ? ` · ${tt("基底")}` : ""}
              </span>
              {!isBaseVideo && (
                <button
                  type="button"
                  onClick={() => state.removeTrack(track.id)}
                  className="rounded px-1 text-[12px] leading-none text-[var(--muted,#78716c)] hover:bg-[var(--surface-hover,rgba(0,0,0,0.05))] hover:text-[var(--fg,#292524)]"
                  title={tt("删除轨道")}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 滚动时间线 */}
      <div ref={scrollRef} className="min-w-0 flex-1 overflow-x-auto">
        <div
          ref={contentRef}
          className="relative"
          style={{ width: contentWidth }}
        >
          {/* 刻度尺 */}
          <div
            data-ruler
            onPointerDown={onRulerPointerDown}
            onPointerMove={onRulerPointerMove}
            onPointerUp={onRulerPointerUp}
            onPointerCancel={onRulerPointerCancel}
            onLostPointerCapture={onRulerPointerCancel}
            className="relative cursor-col-resize border-b border-[var(--border,#e7e5e4)] bg-[var(--surface,#fafaf9)]"
            style={{ height: RULER_HEIGHT }}
          >
            {ticks.map((tick) => (
              <div
                key={tick.ms}
                className="absolute top-0 h-full border-l border-[var(--divider,#e7e5e4)]"
                style={{ left: msToPx(tick.ms) }}
              >
                <span className="ml-1 text-[9px] tabular-nums text-[var(--muted,#78716c)]">
                  {tick.label}
                </span>
              </div>
            ))}
          </div>

          {/* 轨道行 */}
          {doc.tracks.map((track) => (
            <div
              key={track.id}
              ref={(node) => {
                if (node) rowRefs.current.set(track.id, node);
                else rowRefs.current.delete(track.id);
              }}
              className="relative rounded-sm bg-[var(--surface,#f5f5f4)]/70"
              style={{ height: ROW_HEIGHT, marginBottom: ROW_GAP }}
              onPointerDown={() => state.selectClip("")}
            >
              {track.clips.map((clip) => {
                const selected = clip.id === selectedClipId;
                const width = Math.max(6, msToPx(clip.duration_ms));
                return (
                  <div
                    key={clip.id}
                    onPointerDown={(event) =>
                      onClipPointerDown(event, track, clip, "move")
                    }
                    onPointerMove={onClipPointerMove}
                    onPointerUp={onClipPointerUp}
                    onPointerCancel={onClipPointerCancel}
                    onLostPointerCapture={onClipPointerCancel}
                    className={`group absolute top-1 bottom-1 cursor-grab overflow-hidden rounded-md border text-[10px] active:cursor-grabbing ${KIND_CLIP_CLASS[track.kind]}`}
                    style={{
                      left: msToPx(clip.start_ms),
                      width,
                      ...(selected
                        ? {
                            borderColor: accent,
                            boxShadow: `0 0 0 1.5px ${accent}`,
                          }
                        : {}),
                    }}
                  >
                    {clip.transition_in && (
                      <span
                        className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-black/25 to-transparent"
                        style={{
                          width: Math.min(
                            width,
                            msToPx(clip.transition_in.duration_ms),
                          ),
                        }}
                        title={tt("转场")}
                      />
                    )}
                    <div className="pointer-events-none flex h-full flex-col justify-center gap-0.5 px-2">
                      <span className="truncate font-medium">
                        {clipLabel(track, clip, tt("片段"))}
                      </span>
                      <span className="truncate tabular-nums opacity-70">
                        {formatMs(clip.duration_ms)}
                        {clip.speed && clip.speed !== 1 ? ` · ${clip.speed}x` : ""}
                        {clip.muted ? ` · ${tt("静音")}` : ""}
                      </span>
                    </div>
                    {/* trim 手柄 */}
                    <div
                      onPointerDown={(event) =>
                        onClipPointerDown(event, track, clip, "trim-start")
                      }
                      onPointerMove={onClipPointerMove}
                      onPointerUp={onClipPointerUp}
                      onPointerCancel={onClipPointerCancel}
                      onLostPointerCapture={onClipPointerCancel}
                      className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize bg-black/15 opacity-0 group-hover:opacity-100"
                    />
                    <div
                      onPointerDown={(event) =>
                        onClipPointerDown(event, track, clip, "trim-end")
                      }
                      onPointerMove={onClipPointerMove}
                      onPointerUp={onClipPointerUp}
                      onPointerCancel={onClipPointerCancel}
                      onLostPointerCapture={onClipPointerCancel}
                      className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize bg-black/15 opacity-0 group-hover:opacity-100"
                    />
                  </div>
                );
              })}
            </div>
          ))}

          {/* 播放头 */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-10"
            style={{ left: playheadX }}
          >
            <div className="h-full w-px bg-red-500" />
            <div className="absolute -top-0.5 -left-[5px] h-0 w-0 border-x-[5px] border-t-[7px] border-x-transparent border-t-red-500" />
          </div>
        </div>
      </div>
    </div>
  );
}
