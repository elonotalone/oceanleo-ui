"use client";

// 选中 clip 的属性面板：音量/静音/变速、文字完整样式、贴图位置缩放透明度、
// 与前一 clip 的转场。挂在 VideoTimelineControls 里。

import { useUI } from "../../i18n/ui/useUI";
import type { ClipLocation } from "./timeline-model";
import type { VideoTimelineState } from "./use-video-timeline";
import type { TimelineTransition, TransitionType } from "./types";

function Row({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  onGestureStart,
  onGestureEnd,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
  onGestureStart?: () => void;
  onGestureEnd?: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-[11px] text-[var(--fg-2,#57534e)]">
        <span>{label}</span>
        <span className="tabular-nums text-[var(--muted,#78716c)]">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={onGestureStart}
        onPointerUp={onGestureEnd}
        onBlur={onGestureEnd}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full"
        style={{ accentColor: "var(--fg,#292524)" }}
      />
    </label>
  );
}

const SPEED_STOPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const TRANSITIONS: Array<{ value: TransitionType | ""; label: string }> = [
  { value: "", label: "无" },
  { value: "fade", label: "淡入" },
  { value: "crossfade", label: "交叉溶解" },
  { value: "black", label: "黑场" },
];

export function ClipInspector({
  state,
  located,
  accent,
}: {
  state: VideoTimelineState;
  located: ClipLocation;
  accent: string;
}) {
  const tt = useUI();
  const { clip, track } = located;
  const patch = (next: Parameters<typeof state.patchClip>[1]) =>
    state.patchClip(clip.id, next);
  // 滑杆连续变化走 transient（不进 undo 栈），Row 的手势回调负责折叠成一步。
  const patchLive = (next: Parameters<typeof state.patchClip>[1]) =>
    state.patchClipTransient(clip.id, next);
  const isMedia = track.kind === "video" || track.kind === "audio";
  const style = clip.style ?? {};
  const patchStyle = (next: Partial<NonNullable<typeof clip.style>>) =>
    patch({ style: { ...style, ...next } });
  const patchStyleLive = (next: Partial<NonNullable<typeof clip.style>>) =>
    patchLive({ style: { ...style, ...next } });
  const gesture = {
    onGestureStart: state.beginGesture,
    onGestureEnd: state.endGesture,
  };
  const transition = clip.transition_in ?? null;
  const setTransition = (value: TimelineTransition | null) =>
    state.patchClip(clip.id, { transition_in: value ?? undefined });

  return (
    <section className="space-y-2.5 border-t border-[var(--divider,#e7e5e4)] pt-3">
      <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">
        {tt("片段属性")}
      </p>

      {isMedia && (
        <>
          <Row
            label={tt("音量")}
            value={Math.round((clip.volume ?? 1) * 100)}
            min={0}
            max={200}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => patchLive({ volume: v / 100 })}
            {...gesture}
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => patch({ muted: !clip.muted })}
              className="rounded-lg border px-2 py-1.5 text-[11px]"
              style={
                clip.muted
                  ? { borderColor: accent, color: accent, background: `${accent}12` }
                  : { borderColor: "#e7e5e4", color: "#57534e" }
              }
            >
              {clip.muted ? tt("已静音") : tt("静音")}
            </button>
          </div>
          <div>
            <span className="mb-1 flex items-center justify-between text-[11px] text-[var(--fg-2,#57534e)]">
              <span>{tt("变速")}</span>
              <span className="tabular-nums text-[var(--muted,#78716c)]">{clip.speed ?? 1}x</span>
            </span>
            <div className="grid grid-cols-4 gap-1">
              {SPEED_STOPS.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => state.setClipSpeed(clip.id, speed)}
                  className="rounded-lg border px-1 py-1 text-[10px] tabular-nums"
                  style={
                    (clip.speed ?? 1) === speed
                      ? { borderColor: accent, color: accent, background: `${accent}12` }
                      : { borderColor: "#e7e5e4", color: "#57534e" }
                  }
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {track.kind === "text" && (
        <>
          <label className="block">
            <span className="mb-1 block text-[11px] text-[var(--fg-2,#57534e)]">{tt("文字内容")}</span>
            <textarea
              value={clip.text ?? ""}
              onChange={(event) => patch({ text: event.target.value })}
              rows={2}
              className="w-full rounded-lg border border-[var(--border,#e7e5e4)] bg-transparent px-2 py-1.5 text-[12px] text-[var(--fg,#292524)] focus:outline-none"
            />
          </label>
          <Row
            label={tt("字号")}
            value={style.font_size ?? 64}
            min={16}
            max={200}
            step={1}
            format={(v) => `${v}px`}
            onChange={(v) => patchStyleLive({ font_size: v })}
            {...gesture}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] text-[var(--fg-2,#57534e)]">
              {tt("颜色")}
              <input
                type="color"
                value={style.color ?? "#ffffff"}
                onChange={(event) => patchStyle({ color: event.target.value })}
                className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
            <label className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] text-[var(--fg-2,#57534e)]">
              {tt("底色")}
              <input
                type="color"
                value={style.background ?? "#000000"}
                onChange={(event) => patchStyle({ background: event.target.value })}
                className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
              />
            </label>
          </div>
          <div className="flex items-center gap-1.5">
            {(["left", "center", "right"] as const).map((align) => (
              <button
                key={align}
                type="button"
                onClick={() => patchStyle({ align })}
                className="flex-1 rounded-lg border px-2 py-1.5 text-[11px]"
                style={
                  (style.align ?? "center") === align
                    ? { borderColor: accent, color: accent, background: `${accent}12` }
                    : { borderColor: "#e7e5e4", color: "#57534e" }
                }
              >
                {align === "left" ? tt("左") : align === "center" ? tt("中") : tt("右")}
              </button>
            ))}
            <button
              type="button"
              onClick={() => patchStyle({ bold: !style.bold })}
              className="flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold"
              style={
                style.bold
                  ? { borderColor: accent, color: accent, background: `${accent}12` }
                  : { borderColor: "#e7e5e4", color: "#57534e" }
              }
            >
              B
            </button>
            {style.background && (
              <button
                type="button"
                onClick={() => patchStyle({ background: undefined })}
                className="rounded-lg border border-[var(--border,#e7e5e4)] bg-transparent px-2 py-1.5 text-[11px] text-[var(--fg-2,#57534e)]"
              >
                {tt("去底色")}
              </button>
            )}
          </div>
          <Row
            label={tt("横向位置")}
            value={Math.round((style.x ?? 0.5) * 100)}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => patchStyleLive({ x: v / 100 })}
            {...gesture}
          />
          <Row
            label={tt("纵向位置")}
            value={Math.round((style.y ?? 0.85) * 100)}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => patchStyleLive({ y: v / 100 })}
            {...gesture}
          />
        </>
      )}

      {(track.kind === "video" || track.kind === "image") && (
        <>
          <p className="border-t border-[var(--divider,#e7e5e4)] pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted,#78716c)]">
            {tt("画面变换")}
          </p>
          {track.kind === "video" && (
            <>
              <div className="grid grid-cols-3 gap-1">
                {(["contain", "cover", "stretch"] as const).map((fit) => (
                  <button
                    key={fit}
                    type="button"
                    onClick={() => patch({ fit })}
                    className="rounded-lg border px-1 py-1.5 text-[10px]"
                    style={
                      (clip.fit ?? "contain") === fit
                        ? { borderColor: accent, color: accent, background: `${accent}12` }
                        : { borderColor: "#e7e5e4", color: "#57534e" }
                    }
                  >
                    {fit === "contain"
                      ? tt("完整")
                      : fit === "cover"
                        ? tt("铺满")
                        : tt("拉伸")}
                  </button>
                ))}
              </div>
              <Row
                label={tt("亮度")}
                value={Math.round((clip.brightness ?? 0) * 100)}
                min={-100}
                max={100}
                step={1}
                format={(v) => `${v > 0 ? "+" : ""}${v}%`}
                onChange={(v) => patchLive({ brightness: v / 100 })}
                {...gesture}
              />
              <Row
                label={tt("对比度")}
                value={Math.round((clip.contrast ?? 1) * 100)}
                min={0}
                max={200}
                step={1}
                format={(v) => `${v}%`}
                onChange={(v) => patchLive({ contrast: v / 100 })}
                {...gesture}
              />
              <Row
                label={tt("饱和度")}
                value={Math.round((clip.saturation ?? 1) * 100)}
                min={0}
                max={300}
                step={1}
                format={(v) => `${v}%`}
                onChange={(v) => patchLive({ saturation: v / 100 })}
                {...gesture}
              />
            </>
          )}
          <Row
            label={tt("横向位置")}
            value={Math.round((clip.x ?? 0.5) * 100)}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => patchLive({ x: v / 100 })}
            {...gesture}
          />
          <Row
            label={tt("纵向位置")}
            value={Math.round((clip.y ?? 0.5) * 100)}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => patchLive({ y: v / 100 })}
            {...gesture}
          />
          <Row
            label={tt("缩放")}
            value={Math.round((clip.scale ?? (track.kind === "video" ? 1 : 0.35)) * 100)}
            min={5}
            max={200}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => patchLive({ scale: v / 100 })}
            {...gesture}
          />
          <Row
            label={tt("透明度")}
            value={Math.round((clip.opacity ?? 1) * 100)}
            min={0}
            max={100}
            step={1}
            format={(v) => `${v}%`}
            onChange={(v) => patchLive({ opacity: v / 100 })}
            {...gesture}
          />
          <Row
            label={tt("旋转")}
            value={clip.rotation ?? 0}
            min={-180}
            max={180}
            step={1}
            format={(v) => `${v}°`}
            onChange={(v) => patchLive({ rotation: v })}
            {...gesture}
          />
        </>
      )}

      {/* 转场（与前一 clip 之间） */}
      <div className="border-t border-[var(--divider,#e7e5e4)] pt-2.5">
        <span className="mb-1 block text-[11px] text-[var(--fg-2,#57534e)]">{tt("转场（与前一片段）")}</span>
        <div className="grid grid-cols-4 gap-1">
          {TRANSITIONS.map((option) => (
            <button
              key={option.value || "none"}
              type="button"
              onClick={() =>
                setTransition(
                  option.value
                    ? { type: option.value, duration_ms: transition?.duration_ms || 500 }
                    : null,
                )
              }
              className="rounded-lg border px-1 py-1.5 text-[10px]"
              style={
                (transition?.type ?? "") === option.value
                  ? { borderColor: accent, color: accent, background: `${accent}12` }
                  : { borderColor: "#e7e5e4", color: "#57534e" }
              }
            >
              {tt(option.label)}
            </button>
          ))}
        </div>
        {transition && (
          <div className="mt-2">
            <Row
              label={tt("转场时长")}
              value={transition.duration_ms}
              min={100}
              max={3000}
              step={50}
              format={(v) => `${(v / 1000).toFixed(2)}s`}
              onChange={(v) =>
                patchLive({ transition_in: { ...transition, duration_ms: v } })
              }
              {...gesture}
            />
          </div>
        )}
      </div>
    </section>
  );
}
