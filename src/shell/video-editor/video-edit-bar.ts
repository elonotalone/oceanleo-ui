// ============================================================================
// @oceanleo/ui — 视频时间线的统一编辑栏（2026-10-23 D9 / D10）
// ----------------------------------------------------------------------------
// 选中片段 → 规范 id 的控件（词表见 edit-bar-canon.ts）+ 视频特有控件。
// 只出预览与导出都做得到的项：
//   文字片段：字体/装饰/字行距/竖排/对齐、清除样式、内容转换、位置面板。
//   视频片段：水平/垂直翻转、顺时针 90°、不透明度、调色面板、显示方式、位置面板。
//   贴图片段：Library 替换、裁剪/圆角/边框/适配/调色、翻转、旋转、不透明度。
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
  timelineTextCasePatch,
  timelineTextListKind,
  timelineTextListPatch,
  normalizeTimelineCrop,
  timelineFontFamily,
  validTimelineLibrarySource,
  validTimelineSourceReference,
  type ClipLocation,
} from "./timeline-model";
import type {
  TimelineClip,
  TimelineDoc,
  TimelineTextStyle,
  TrackKind,
  TransitionType,
} from "./types";
import { TIMELINE_FONT_FAMILIES } from "./types";

export const VIDEO_TIMELINE_REPLACE_IMAGE_EVENT = "oceanleo:timeline-replace-image";

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
  doc?: TimelineDoc,
  options: { canReplaceImage?: boolean } = {},
): SelectionContext {
  const { clip, track } = located;
  const kind = track.kind;
  const style = clip.style || {};
  const visual = kind === "video" || kind === "image";
  const timed = kind === "video" || kind === "audio";
  const controls: SelectionControl[] = [];

  if (kind === "text") {
    controls.push(
      { id: "font-family", kind: "select", label: tt("字体"), value: timelineFontFamily(style.font_family),
        options: TIMELINE_FONT_FAMILIES.map(value => ({ value, label: value })) },
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
      { id: "italic", kind: "toggle", label: tt("斜体"), value: style.italic === true },
      { id: "underline", kind: "toggle", label: tt("下划线"), value: style.underline === true },
      { id: "strike", kind: "toggle", label: tt("删除线"), value: style.strike === true },
      { id: "line-height", kind: "number", label: tt("行高"), value: (style.font_size ?? 64) * (style.line_height ?? 1.3),
        min: (style.font_size ?? 64) * 0.5, max: (style.font_size ?? 64) * 3, step: 1, unit: "px", suffix: "px" },
      { id: "letter-spacing", kind: "number", label: tt("字距"), value: style.letter_spacing ?? 0,
        min: -10, max: 100, step: 1, unit: "px", suffix: "px" },
      { id: "vertical-text", kind: "toggle", label: tt("竖排文字"), value: style.vertical_text === true },
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
          { value: "justify", label: tt("两端对齐") },
        ],
      },
      {
        id: "list",
        kind: "select",
        label: tt("项目列表"),
        value: timelineTextListKind(clip),
        options: [
          { value: "none", label: tt("无列表") },
          { value: "bullet", label: tt("项目符号列表") },
          { value: "ordered", label: tt("编号列表") },
        ],
      },
      {
        id: "case",
        kind: "action",
        label: tt("大小写"),
      },
      { id: "clear-format", kind: "action", label: tt("清除样式") },
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
    if (kind === "image") {
      const crop = normalizeTimelineCrop(clip.crop);
      if (options.canReplaceImage) controls.push({ id: "replace", kind: "action", label: tt("替换") });
      for (const [field, label] of [["x", "横向位置"], ["y", "纵向位置"], ["width", "宽度"], ["height", "高度"]] as const) {
        controls.push({ id: `crop-${field}`, kind: "range", label: tt(label), value: crop[field] * 100,
          min: field === "width" || field === "height" ? 1 : 0, max: 100, step: 1, suffix: "%", ...panel("crop", tt("裁剪")) });
      }
      controls.push(
        { id: "radius", kind: "number", label: tt("圆角"), value: clip.radius ?? 0, min: 0, max: 1000, step: 1, unit: "px", suffix: "px" },
        { id: "border-width", kind: "number", label: tt("宽度"), value: clip.border?.width ?? 0,
          min: 0, max: 100, step: 1, unit: "px", suffix: "px", ...panel("border", tt("边框")) },
        { id: "border-color", kind: "color", label: tt("边框颜色"), value: clip.border?.color ?? "#000000", ...panel("border", tt("边框")) },
        { id: "alt", kind: "text", label: tt("替代文字"), value: clip.alt ?? "", ...panel("alt", tt("替代文字")) },
      );
    }
    const replacements = imageReplacementSources(doc, located);
    if (kind === "image" && replacements.length) {
      controls.push({
        id: "replace-source",
        kind: "select",
        label: tt("图片片段"),
        value: "",
        options: [
          { value: "", label: tt("替换") },
          ...replacements.map((source) => ({ value: source.id, label: source.label || source.id })),
        ],
        ...panel("replace", tt("替换")),
      });
    }
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
    if (visual) {
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
  doc?: TimelineDoc;
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
  replaceImage?: (clipId: string) => void;
}

/** 替换只选择文档已接纳的图片，沿用其持久素材身份；不接收任意 URL 或新授权。 */
function imageReplacementSources(doc: TimelineDoc | undefined, located: ClipLocation): TimelineClip[] {
  if (!doc || located.track.kind !== "image") return [];
  const identity = (clip: TimelineClip) => clip.source_ref
    ? JSON.stringify([clip.source_ref.artifactId, clip.source_ref.revisionId, clip.source_ref.path])
    : clip.library_source ? JSON.stringify(clip.library_source) : clip.source_url;
  return doc.tracks.filter((track) => track.kind === "image")
    .flatMap((track) => track.clips)
    .filter((clip) => clip.id !== located.clip.id &&
      (clip.source_ref ? validTimelineSourceReference(clip.source_ref) : validTimelineLibrarySource(clip.library_source) || Boolean(clip.source_url)) &&
      identity(clip) !== identity(located.clip));
}

function finite(value: SelectionCommand["value"], fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 顺时针转 90°，结果落回 (-180, 180]（模型的角度域）。 */
export function rotateClockwise90(rotation: number | undefined): number {
  const next = (Math.round(Number(rotation) || 0) + 90) % 360;
  return next > 180 ? next - 360 : next <= -180 ? next + 360 : next;
}

/** 执行一条编辑栏命令；返回是否认得这个控件。 */
export function runVideoClipCommand(
  state: VideoEditBarTarget,
  located: ClipLocation,
  message: SelectionCommand,
  replaceImage?: (clipId: string) => void,
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

  // 未提供的能力也不能通过直接 dispatch 写进不可渲染的字段。
  if (["font-family", "font-size", "bold", "italic", "underline", "strike", "line-height", "letter-spacing", "vertical-text", "text-color", "highlight", "highlight-remove", "align", "list", "case", "clear-format", "text"].includes(message.controlId) && !textTrack) return false;
  if (["brightness", "contrast", "saturation", "image-fit"].includes(message.controlId) && track.kind !== "video" && track.kind !== "image") return false;
  if (["replace", "replace-source", "crop-x", "crop-y", "crop-width", "crop-height", "radius", "border-width", "border-color", "alt"].includes(message.controlId) && track.kind !== "image") return false;

  switch (message.controlId) {
    case "font-family":
      patchStyle({ font_family: timelineFontFamily(value) });
      return true;
    case "font-size":
      patchStyle({ font_size: clamp(Math.round(finite(value, 64)), 8, 300) });
      return true;
    case "bold":
      patchStyle({ bold: value === true });
      return true;
    case "italic": case "underline": case "strike":
      patchStyle({ [message.controlId]: value === true });
      return true;
    case "vertical-text":
      patchStyle({ vertical_text: value === true });
      return true;
    case "line-height":
      patchStyle({ line_height: clamp(finite(value, (clip.style?.font_size ?? 64) * 1.3) / (clip.style?.font_size ?? 64), 0.5, 3) });
      return true;
    case "letter-spacing":
      patchStyle({ letter_spacing: clamp(finite(value), -10, 100) });
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
      if (value === "left" || value === "center" || value === "right" || value === "justify") {
        patchStyle({ align: value });
      }
      return true;
    case "list":
      if (value !== "none" && value !== "bullet" && value !== "ordered") return false;
      patch(timelineTextListPatch(clip, value));
      return true;
    case "case": {
      if (value !== undefined && value !== "upper" && value !== "lower") return false;
      const text = String(clip.text ?? "");
      const casing = value || (text === text.toUpperCase() ? "lower" : "upper");
      patch(timelineTextCasePatch(clip, casing));
      return true;
    }
    case "clear-format":
      patch({
        ...timelineTextListPatch(clip, "none"),
        style: {
          font_size: 64, color: "#ffffff", bold: false, align: "center",
          font_family: "sans-serif", italic: false, underline: false, strike: false,
          line_height: 1.3, letter_spacing: 0, vertical_text: false,
          x: clip.style?.x ?? 0.5, y: clip.style?.y ?? 0.85,
        },
      });
      return true;
    case "replace":
      if (replaceImage) {
        replaceImage(clip.id);
        return true;
      }
      if (!state.replaceImage) return false;
      state.replaceImage(clip.id);
      return true;
    case "crop-x": case "crop-y": case "crop-width": case "crop-height": {
      const field = message.controlId.slice(5) as keyof NonNullable<TimelineClip["crop"]>;
      patch({ crop: normalizeTimelineCrop({ ...normalizeTimelineCrop(clip.crop), [field]: percent(field === "width" || field === "height" ? 100 : 0) }) });
      return true;
    }
    case "radius":
      patch({ radius: clamp(finite(value), 0, 1000) });
      return true;
    case "border-width":
      patch({ border: { color: clip.border?.color ?? "#000000", width: clamp(finite(value), 0, 100) } });
      return true;
    case "border-color":
      if (typeof value !== "string" || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)) return false;
      patch({ border: { width: clip.border?.width ?? 0, color: value } });
      return true;
    case "alt":
      patch({ alt: String(value ?? "").slice(0, 2000) });
      return true;
    case "replace-source": {
      const source = imageReplacementSources(state.doc, located).find((candidate) => candidate.id === value);
      if (!source) return false;
      patch({
        source_url: source.source_url,
        source_ref: source.source_ref ? { ...source.source_ref } : undefined,
        library_source: source.library_source ? { ...source.library_source } : undefined,
        label: source.label,
      });
      return true;
    }
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
      patch({ text: String(value ?? ""), text_list: undefined });
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
