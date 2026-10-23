// ============================================================================
// @oceanleo/ui — 视频时间线的统一编辑栏（2026-10-23 D9 / D10）
// ----------------------------------------------------------------------------
// 选中片段 → 规范 id 的控件（词表见 edit-bar-canon.ts）+ 视频特有控件。
// 只出预览与导出都做得到的项：
//   文字片段：字号、加粗、文字色、高亮色（字底色块）、对齐、位置面板。
//   视频片段：水平/垂直翻转、顺时针 90°、不透明度、调色面板、显示方式、位置面板。
//   贴图片段：翻转、旋转、不透明度、位置面板（贴图没有调色与显示方式）。
//   音频片段：只有特有控件（速度、静音、声音、时间、淡入）。
// 面板型规范项按 §4 增补 A-1：子控件 slot "inspector" + inspectorGroup = 规范 id。
// 特有控件不带规范图标（投影会改显示文字）。
// ============================================================================

import type {
  SelectionCommand,
  SelectionContext,
  SelectionControl,
} from "../selection-context";
import type { UITranslate } from "../../i18n/ui/useUI";
import {
  MIN_CLIP_MS,
  availableTimelineDurationMs,
  rotateClockwise90,
  type ClipLocation,
} from "./timeline-model";
import type {
  TimelineClip,
  TimelineTextStyle,
  TrackKind,
  TransitionType,
} from "./types";

export const VIDEO_CLIP_SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;

const TRANSITIONS: Record<TrackKind, ReadonlyArray<TransitionType>> = {
  video: ["fade", "crossfade", "black"],
  image: ["fade", "crossfade", "black"],
  text: ["fade", "black"],
  audio: ["fade", "crossfade"],
};

function panel(
  inspectorGroup: string,
  inspectorLabel: string,
): Pick<SelectionControl, "slot" | "inspectorGroup" | "inspectorLabel"> {
  return { slot: "inspector", inspectorGroup, inspectorLabel };
}

function transitionLabel(type: TransitionType, kind: TrackKind, tt: UITranslate) {
  if (type === "fade") return tt("淡入");
  if (type === "crossfade") return kind === "audio" ? tt("交叉淡化") : tt("交叉溶解");
  return tt("黑场");
}

/** 选中片段的编辑栏选区。纯函数：同一片段同一状态 → 同一份控件。 */
export function videoClipSelection(
  located: ClipLocation,
  tt: UITranslate,
): SelectionContext {
  const { clip, track } = located;
  const kind = track.kind;
  const style = clip.style || {};
  const visual = kind === "video" || kind === "image";
  const timed = kind === "video" || kind === "audio";
  const controls: SelectionControl[] = [];

  if (kind === "text") {
    controls.push(
      {
        id: "font-size",
        kind: "number",
        label: tt("字号"),
        value: style.font_size ?? 64,
        min: 8,
        max: 300,
        step: 1,
      },
      { id: "bold", kind: "toggle", label: tt("加粗"), value: style.bold === true },
      {
        id: "text-color",
        kind: "color",
        label: tt("文字色"),
        value: style.color || "#ffffff",
      },
      {
        id: "highlight",
        kind: "color",
        label: tt("高亮色"),
        value: style.background || "#000000",
      },
      {
        id: "align",
        kind: "select",
        label: tt("对齐"),
        value: style.align || "center",
        options: [
          { value: "left", label: tt("左对齐") },
          { value: "center", label: tt("居中") },
          { value: "right", label: tt("右对齐") },
        ],
      },
      {
        id: "position-x",
        kind: "range",
        label: tt("横向位置"),
        suffix: "%",
        value: Math.round((style.x ?? 0.5) * 100),
        min: 0,
        max: 100,
        ...panel("position", tt("位置与尺寸")),
      },
      {
        id: "position-y",
        kind: "range",
        label: tt("纵向位置"),
        suffix: "%",
        value: Math.round((style.y ?? 0.85) * 100),
        min: 0,
        max: 100,
        ...panel("position", tt("位置与尺寸")),
      },
    );
  }

  if (visual) {
    controls.push(
      { id: "flip-x", kind: "toggle", label: tt("水平翻转"), value: clip.flip_x === true },
      { id: "flip-y", kind: "toggle", label: tt("垂直翻转"), value: clip.flip_y === true },
      { id: "rotate", kind: "action", label: tt("旋转") },
      {
        id: "opacity",
        kind: "range",
        label: tt("不透明度"),
        suffix: "%",
        value: Math.round((clip.opacity ?? 1) * 100),
        min: 0,
        max: 100,
      },
    );
    if (kind === "video") {
      controls.push(
        {
          id: "brightness",
          kind: "range",
          label: tt("亮度"),
          value: Math.round((clip.brightness ?? 0) * 100),
          min: -100,
          max: 100,
          ...panel("adjust", tt("调色")),
        },
        {
          id: "contrast",
          kind: "range",
          label: tt("对比度"),
          suffix: "%",
          value: Math.round((clip.contrast ?? 1) * 100),
          min: 0,
          max: 200,
          ...panel("adjust", tt("调色")),
        },
        {
          id: "saturation",
          kind: "range",
          label: tt("饱和度"),
          suffix: "%",
          value: Math.round((clip.saturation ?? 1) * 100),
          min: 0,
          max: 300,
          ...panel("adjust", tt("调色")),
        },
        {
          id: "image-fit",
          kind: "select",
          label: tt("显示方式"),
          value: clip.fit || "contain",
          options: [
            { value: "contain", label: tt("完整显示") },
            { value: "cover", label: tt("铺满裁切") },
            { value: "stretch", label: tt("拉伸铺满") },
          ],
        },
      );
    }
    controls.push(
      {
        id: "position-x",
        kind: "range",
        label: tt("横向位置"),
        suffix: "%",
        value: Math.round((clip.x ?? 0.5) * 100),
        min: 0,
        max: 100,
        ...panel("position", tt("位置与尺寸")),
      },
      {
        id: "position-y",
        kind: "range",
        label: tt("纵向位置"),
        suffix: "%",
        value: Math.round((clip.y ?? 0.5) * 100),
        min: 0,
        max: 100,
        ...panel("position", tt("位置与尺寸")),
      },
      {
        id: "position-scale",
        kind: "range",
        label: tt("缩放"),
        suffix: "%",
        value: Math.round((clip.scale ?? (kind === "video" ? 1 : 0.35)) * 100),
        min: kind === "video" ? 5 : 2,
        max: 200,
        ...panel("position", tt("位置与尺寸")),
      },
      {
        id: "position-angle",
        kind: "range",
        label: tt("角度"),
        suffix: "°",
        value: Math.round(clip.rotation ?? 0),
        min: -180,
        max: 180,
        ...panel("position", tt("位置与尺寸")),
      },
    );
  }

  controls.push(
    { id: "duplicate", kind: "action", label: tt("复制一份") },
    { id: "delete", kind: "action", label: tt("删除"), danger: true },
  );

  // ---- 视频特有控件（排在对象组之后；不带规范图标）
  if (timed) {
    controls.push(
      {
        id: "speed",
        kind: "select",
        label: tt("速度"),
        value: String(clip.speed ?? 1),
        options: VIDEO_CLIP_SPEEDS.map((value) => ({
          value: String(value),
          label: `${value}x`,
        })),
      },
      { id: "muted", kind: "toggle", label: tt("静音"), value: clip.muted === true },
      {
        id: "volume",
        kind: "range",
        label: tt("音量"),
        suffix: "%",
        value: Math.round((clip.volume ?? 1) * 100),
        min: 0,
        max: 200,
        ...panel("video-sound", tt("声音")),
      },
    );
  }
  if (kind === "text") {
    controls.push({
      id: "text",
      kind: "text",
      label: tt("文字内容"),
      value: clip.text || "",
      ...panel("video-text", tt("文字内容")),
    });
  }
  controls.push(
    {
      id: "start-time",
      kind: "number",
      label: tt("开始时间"),
      suffix: "s",
      value: clip.start_ms / 1_000,
      min: 0,
      step: 0.01,
      ...panel("video-timing", tt("时间")),
    },
    {
      id: "duration",
      kind: "number",
      label: tt("片段时长"),
      suffix: "s",
      value: clip.duration_ms / 1_000,
      min: MIN_CLIP_MS / 1_000,
      step: 0.01,
      ...panel("video-timing", tt("时间")),
    },
  );
  if (timed && clip.source_url) {
    controls.push({
      id: "source-in",
      kind: "number",
      label: tt("素材内起点"),
      suffix: "s",
      value: (clip.in_ms || 0) / 1_000,
      min: 0,
      step: 0.01,
      ...panel("video-timing", tt("时间")),
    });
  }
  controls.push({
    id: "transition",
    kind: "select",
    label: kind === "audio" ? tt("淡入") : tt("入场转场"),
    value: clip.transition_in?.type || "none",
    options: [
      { value: "none", label: tt("无") },
      ...TRANSITIONS[kind].map((type) => ({
        value: type,
        label: transitionLabel(type, kind, tt),
      })),
    ],
    ...panel("video-transition", kind === "audio" ? tt("淡入") : tt("转场")),
  });
  if (clip.transition_in) {
    controls.push({
      id: "transition-duration",
      kind: "range",
      label: tt("转场时长"),
      suffix: "ms",
      value: clip.transition_in.duration_ms,
      min: 100,
      max: 3_000,
      step: 50,
      ...panel("video-transition", kind === "audio" ? tt("淡入") : tt("转场")),
    });
  }
  if (kind === "text" && style.background) {
    controls.push({
      id: "highlight-remove",
      kind: "action",
      label: tt("去掉高亮"),
      placement: "more",
    });
  }

  return {
    version: 1,
    kind: `${kind}-clip`,
    id: clip.id,
    bar: kind === "text" ? "text" : visual ? "image" : "object",
    label: {
      video: tt("视频片段"),
      audio: tt("音频片段"),
      text: tt("文字片段"),
      image: tt("图片片段"),
    }[kind],
    controls,
  };
}

/** 编辑栏命令要用到的那部分时间线状态（`VideoTimelineState` 的子集，便于测试）。 */
export interface VideoEditBarTarget {
  patchClip: (clipId: string, patch: Partial<TimelineClip>) => void;
  patchClipTransient: (clipId: string, patch: Partial<TimelineClip>) => void;
  moveClip: (clipId: string, targetTrackId: string, desiredStartMs: number) => void;
  trimClip: (clipId: string, edge: "start" | "end", desiredMs: number) => void;
  setClipTiming: (
    clipId: string,
    patch: { startMs?: number; durationMs?: number; sourceInMs?: number },
  ) => void;
  setClipSpeed: (clipId: string, speed: number) => void;
  duplicateSelectedClip: () => void;
  deleteSelectedClip: () => void;
  beginGesture: () => void;
  endGesture: () => void;
  cancelGesture: () => void;
}

function finite(value: SelectionCommand["value"], fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 执行一条编辑栏命令；返回是否认得这个控件。 */
export function runVideoClipCommand(
  state: VideoEditBarTarget,
  located: ClipLocation,
  message: SelectionCommand,
): boolean {
  const { clip, track } = located;
  if (message.selectionId !== clip.id) return false;
  const gesture = (mutate: () => void, commit: () => void) => {
    if (!message.transactionId) {
      commit();
      return;
    }
    if (message.phase === "start") {
      state.beginGesture();
      return;
    }
    if (message.phase === "cancel") {
      state.cancelGesture();
      return;
    }
    mutate();
    if (message.phase === "commit") state.endGesture();
  };
  const patch = (next: Partial<TimelineClip>) =>
    gesture(
      () => state.patchClipTransient(clip.id, next),
      () => state.patchClip(clip.id, next),
    );
  const patchStyle = (next: Partial<TimelineTextStyle>) =>
    patch({ style: { ...(clip.style || {}), ...next } });
  const value = message.value;
  const percent = (fallback: number) => finite(value, fallback) / 100;
  const textTrack = track.kind === "text";

  switch (message.controlId) {
    case "font-size":
      patchStyle({ font_size: clamp(Math.round(finite(value, 64)), 8, 300) });
      return true;
    case "bold":
      patchStyle({ bold: value === true });
      return true;
    case "text-color":
      if (typeof value === "string" && value) patchStyle({ color: value });
      return true;
    case "highlight":
      if (typeof value === "string" && value) patchStyle({ background: value });
      return true;
    case "highlight-remove":
      patchStyle({ background: undefined });
      return true;
    case "align":
      if (value === "left" || value === "center" || value === "right") {
        patchStyle({ align: value });
      }
      return true;
    case "position-x":
      if (textTrack) patchStyle({ x: clamp(percent(50), 0, 1) });
      else patch({ x: clamp(percent(50), 0, 1) });
      return true;
    case "position-y":
      if (textTrack) patchStyle({ y: clamp(percent(85), 0, 1) });
      else patch({ y: clamp(percent(50), 0, 1) });
      return true;
    case "position-scale":
      patch({ scale: clamp(percent(100), track.kind === "video" ? 0.05 : 0.02, 2) });
      return true;
    case "position-angle":
      patch({ rotation: clamp(finite(value), -180, 180) });
      return true;
    case "flip-x":
      state.patchClip(clip.id, { flip_x: value === true });
      return true;
    case "flip-y":
      state.patchClip(clip.id, { flip_y: value === true });
      return true;
    case "rotate":
      state.patchClip(clip.id, { rotation: rotateClockwise90(clip.rotation) });
      return true;
    case "opacity":
      patch({ opacity: clamp(percent(100), 0, 1) });
      return true;
    case "brightness":
      patch({ brightness: clamp(percent(0), -1, 1) });
      return true;
    case "contrast":
      patch({ contrast: clamp(percent(100), 0, 2) });
      return true;
    case "saturation":
      patch({ saturation: clamp(percent(100), 0, 3) });
      return true;
    case "image-fit":
      if (value === "contain" || value === "cover" || value === "stretch") {
        state.patchClip(clip.id, { fit: value });
      }
      return true;
    case "duplicate":
      state.duplicateSelectedClip();
      return true;
    case "delete":
      state.deleteSelectedClip();
      return true;
    case "speed":
      state.setClipSpeed(clip.id, Number(value) || 1);
      return true;
    case "muted":
      state.patchClip(clip.id, { muted: value === true });
      return true;
    case "volume":
      patch({ volume: clamp(percent(100), 0, 2) });
      return true;
    case "text":
      patch({ text: String(value ?? "") });
      return true;
    case "start-time": {
      const startMs = Math.max(0, finite(value) * 1_000);
      gesture(
        () => state.moveClip(clip.id, track.id, startMs),
        () => state.setClipTiming(clip.id, { startMs }),
      );
      return true;
    }
    case "duration": {
      const durationMs = Math.max(MIN_CLIP_MS, finite(value, 0.1) * 1_000);
      gesture(
        () => state.trimClip(clip.id, "end", clip.start_ms + durationMs),
        () => state.setClipTiming(clip.id, { durationMs }),
      );
      return true;
    }
    case "source-in": {
      const requested = Math.max(0, finite(value) * 1_000);
      const sourceDuration = clip.source_duration_ms;
      const maximum = Number.isFinite(sourceDuration)
        ? Math.max(0, Number(sourceDuration) - MIN_CLIP_MS * (clip.speed ?? 1))
        : Infinity;
      const sourceInMs = Math.round(Math.min(maximum, requested));
      const maximumDuration = availableTimelineDurationMs(clip, sourceInMs);
      patch({
        in_ms: sourceInMs,
        ...(clip.duration_ms > maximumDuration ? { duration_ms: maximumDuration } : {}),
      });
      return true;
    }
    case "transition": {
      const type = String(value || "none");
      const allowed = TRANSITIONS[track.kind] as ReadonlyArray<string>;
      state.patchClip(clip.id, {
        transition_in: allowed.includes(type)
          ? {
              type: type as TransitionType,
              duration_ms: clip.transition_in?.duration_ms || 500,
            }
          : undefined,
      });
      return true;
    }
    case "transition-duration":
      if (clip.transition_in) {
        patch({
          transition_in: {
            ...clip.transition_in,
            duration_ms: clamp(Math.round(finite(value, 500)), 100, 3_000),
          },
        });
      }
      return true;
    default:
      return false;
  }
}
