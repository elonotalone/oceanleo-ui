/**
 * Commands against OpenVideo JSON. These are the kernel operations L1/L2/L4
 * share — they mutate the vendor document, they do not invent a second model.
 */
import {
  cloneOpenVideoProject,
  findTrackForClip,
  makeOpenVideoId,
  msToUs,
  normalizeOpenVideoProject,
  type OpenVideoClip,
  type OpenVideoKeyframeAnimation,
  type OpenVideoProject,
} from "./schema";

export type VideoFacadeResult =
  | { ok: true; project: OpenVideoProject }
  | { ok: false; reason: string };

export interface VideoFacadeArgs {
  clipId?: string;
  atUs?: number;
  value?: string | number | boolean;
  text?: string;
  crop?: { x: number; y: number; width: number; height: number };
  keyframes?: Record<string, Record<string, number>>;
}

/** L1/L2 点「画面裁切」但没框选时给人看的话。不许改成默默裁一圈。 */
export const VIDEO_CROP_NEEDS_RECT =
  "请先框选要保留的区域，没有选区时不会裁切画面。";
/** 有矩形但宽/高为 0、负数、或落到画面外成了空框。不许改成满幅或 5% 细条。 */
export const VIDEO_CROP_EMPTY_RECT =
  "裁切框没有可用面积，画面没有被裁切。";
/** L1/L2 点「加字幕」但没正文时给人看的话。不许改成占位「字幕」。 */
export const VIDEO_CAPTION_NEEDS_TEXT =
  "请先输入字幕正文，空的字幕不会加进成片。";
/** L1/L2 点「关键帧」但没表时给人看的话。不许改成空的 0%/100% 动画。 */
export const VIDEO_KEYFRAMES_NEED_TABLE =
  "请先给出关键帧，没有关键帧表时不会给片段加动画。";
/** 点「音量」但没给出数值。不许当成 0（静音）并报成功。 */
export const VIDEO_VOLUME_NEEDS_VALUE =
  "请先给出音量，没有音量值时不会改变声音。";
/** 点「速度」但没给出倍速。不许当成 1x 并报成功。 */
export const VIDEO_SPEED_NEEDS_VALUE =
  "请先选择倍速，没有速度值时不会改变播放速度。";
/** 点「静音」但没给出开或关。不许当成取消静音。 */
export const VIDEO_MUTE_NEEDS_CHOICE =
  "请先确认要不要静音，没有明确选择时不会改变静音。";
/** 点「字幕样式」但没颜色/字号。不许空操作还报成功。 */
export const VIDEO_CAPTION_STYLE_NEEDS_VALUE =
  "请先给出字幕样式，没有颜色或字号时不会改字幕。";
/** 加字幕有正文但没时间点。不许默默扔到片头。 */
export const VIDEO_CAPTION_NEEDS_TIME =
  "请先指定字幕出现的时间，没有时间点时不会把字幕加到片头。";

function fail(reason: string): VideoFacadeResult {
  return { ok: false, reason };
}

function hasCropRect(
  crop: VideoFacadeArgs["crop"],
): crop is { x: number; y: number; width: number; height: number } {
  return Boolean(
    crop &&
      Number.isFinite(crop.x) &&
      Number.isFinite(crop.y) &&
      Number.isFinite(crop.width) &&
      Number.isFinite(crop.height),
  );
}

function hasKeyframeTable(
  keyframes: VideoFacadeArgs["keyframes"],
): keyframes is Record<string, Record<string, number>> {
  return Boolean(keyframes && Object.keys(keyframes).length > 0);
}

function hasFiniteCommandNumber(value: VideoFacadeArgs["value"]): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string" && value.trim() !== "") {
    return Number.isFinite(Number(value));
  }
  return false;
}

function hasBooleanCommandValue(value: VideoFacadeArgs["value"]): value is boolean {
  return typeof value === "boolean";
}

function hasFiniteTime(atUs: VideoFacadeArgs["atUs"]): atUs is number {
  return typeof atUs === "number" && Number.isFinite(atUs);
}

function hasCaptionStylePatch(style: {
  fontSize?: number;
  color?: string;
  align?: string;
}): boolean {
  if (typeof style.color === "string" && style.color.trim() !== "") return true;
  if (typeof style.fontSize === "number" && Number.isFinite(style.fontSize)) return true;
  if (typeof style.align === "string" && style.align.trim() !== "") return true;
  return false;
}

function parseUsableCropRect(crop: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number } | null {
  const x0 = Number(crop.x);
  const y0 = Number(crop.y);
  const w0 = Number(crop.width);
  const h0 = Number(crop.height);
  if (![x0, y0, w0, h0].every((entry) => Number.isFinite(entry))) return null;
  if (w0 <= 0 || h0 <= 0) return null;
  const x = Math.min(1, Math.max(0, x0));
  const y = Math.min(1, Math.max(0, y0));
  const width = Math.min(1 - x, w0);
  const height = Math.min(1 - y, h0);
  if (width <= 0 || height <= 0) return null;
  const widthOut = Math.min(1 - x, Math.max(0.05, width));
  const heightOut = Math.min(1 - y, Math.max(0.05, height));
  if (widthOut <= 0 || heightOut <= 0) return null;
  return { x, y, width: widthOut, height: heightOut };
}

function withClip(
  project: OpenVideoProject,
  clipId: string | undefined,
  mutate: (clip: OpenVideoClip, next: OpenVideoProject) => VideoFacadeResult,
): VideoFacadeResult {
  if (!clipId) return fail("没有选中片段。");
  const next = cloneOpenVideoProject(project);
  const clip = next.clips[clipId];
  if (!clip) return fail(`找不到片段 ${clipId}。`);
  return mutate(clip, next);
}

export function splitOpenVideoClip(
  project: OpenVideoProject,
  clipId: string,
  atUs: number,
): VideoFacadeResult {
  return withClip(project, clipId, (clip, next) => {
    const from = clip.timing.display.from;
    const to = clip.timing.display.to;
    if (atUs <= from + 1000 || atUs >= to - 1000) {
      return fail("分割点离片段两端太近，没有可切开的长度。");
    }
    const rightId = makeOpenVideoId("clip");
    const right: OpenVideoClip = {
      ...structuredClone(clip),
      id: rightId,
      timing: {
        ...clip.timing,
        display: { from: atUs, to },
        duration: to - atUs,
      },
    };
    clip.timing = {
      ...clip.timing,
      display: { from, to: atUs },
      duration: atUs - from,
    };
    next.clips[rightId] = right;
    const track = findTrackForClip(next, clip.id);
    if (!track) return fail("片段不在任何轨道上。");
    const index = track.clipIds.indexOf(clip.id);
    track.clipIds.splice(index + 1, 0, rightId);
    return { ok: true, project: normalizeOpenVideoProject(next) };
  });
}

export function deleteOpenVideoClip(
  project: OpenVideoProject,
  clipId: string,
): VideoFacadeResult {
  const next = cloneOpenVideoProject(project);
  if (!next.clips[clipId]) return fail(`找不到片段 ${clipId}。`);
  delete next.clips[clipId];
  for (const track of next.tracks) {
    track.clipIds = track.clipIds.filter((id) => id !== clipId);
  }
  return { ok: true, project: normalizeOpenVideoProject(next) };
}

export function setOpenVideoVolume(
  project: OpenVideoProject,
  clipId: string,
  volume: number,
): VideoFacadeResult {
  return withClip(project, clipId, (clip, next) => {
    if (!Number.isFinite(Number(volume))) {
      return fail(VIDEO_VOLUME_NEEDS_VALUE);
    }
    const nextVolume = Math.min(2, Math.max(0, Number(volume)));
    clip.volume = nextVolume;
    clip.muted = nextVolume === 0;
    return { ok: true, project: next };
  });
}

export function setOpenVideoMuted(
  project: OpenVideoProject,
  clipId: string,
  muted: boolean,
): VideoFacadeResult {
  return withClip(project, clipId, (clip, next) => {
    if (typeof muted !== "boolean") {
      return fail(VIDEO_MUTE_NEEDS_CHOICE);
    }
    clip.muted = muted;
    if (muted) clip.volume = 0;
    else if (!clip.volume) clip.volume = 1;
    return { ok: true, project: next };
  });
}

export function setOpenVideoSpeed(
  project: OpenVideoProject,
  clipId: string,
  speed: number,
): VideoFacadeResult {
  return withClip(project, clipId, (clip, next) => {
    if (!Number.isFinite(Number(speed))) {
      return fail(VIDEO_SPEED_NEEDS_VALUE);
    }
    const playbackRate = Math.min(4, Math.max(0.25, Number(speed)));
    clip.timing = { ...clip.timing, playbackRate };
    return { ok: true, project: next };
  });
}

export function cropOpenVideoClip(
  project: OpenVideoProject,
  clipId: string,
  crop: { x: number; y: number; width: number; height: number },
): VideoFacadeResult {
  return withClip(project, clipId, (clip, next) => {
    const rect = parseUsableCropRect(crop);
    if (!rect) return fail(VIDEO_CROP_EMPTY_RECT);
    clip.crop = rect;
    const canvasW = next.settings.width;
    const canvasH = next.settings.height;
    clip.transform = {
      x: Math.round(rect.x * canvasW),
      y: Math.round(rect.y * canvasH),
      width: Math.round(rect.width * canvasW),
      height: Math.round(rect.height * canvasH),
      angle: clip.transform?.angle ?? 0,
      opacity: clip.transform?.opacity ?? 1,
      zIndex: clip.transform?.zIndex ?? 10,
      flip: clip.transform?.flip ?? { x: false, y: false },
    };
    return { ok: true, project: next };
  });
}

export function setOpenVideoKeyframes(
  project: OpenVideoProject,
  clipId: string,
  params: Record<string, Record<string, number>>,
): VideoFacadeResult {
  return withClip(project, clipId, (clip, next) => {
    const keys = Object.keys(params || {});
    if (!keys.includes("0%") || !keys.includes("100%")) {
      return fail("关键帧不完整：需要同时有 0% 和 100%，缺了不会给片段加动画。");
    }
    const animation: OpenVideoKeyframeAnimation = {
      type: "keyframes",
      options: {
        duration: clip.timing.duration,
        easing: "linear",
        iterCount: 1,
        id: makeOpenVideoId("keyframe"),
        disableGlobalEasing: false,
      },
      params,
    };
    clip.animations = [animation];
    return { ok: true, project: next };
  });
}

export function addOpenVideoCaption(
  project: OpenVideoProject,
  input: { text: string; fromMs: number; durationMs?: number },
): VideoFacadeResult {
  const text = String(input.text || "").trim();
  if (!text) return fail(VIDEO_CAPTION_NEEDS_TEXT);
  if (text.length > 200) {
    return fail("这一条字幕超过 200 个字。请拆成两句再加。");
  }
  if (!Number.isFinite(Number(input.fromMs))) {
    return fail(VIDEO_CAPTION_NEEDS_TIME);
  }
  const next = cloneOpenVideoProject(project);
  let track = next.tracks.find((entry) => entry.type === "caption");
  if (!track) {
    track = {
      id: makeOpenVideoId("track"),
      name: "Captions",
      type: "caption",
      clipIds: [],
    };
    next.tracks.push(track);
  }
  const from = msToUs(input.fromMs);
  const duration = msToUs(input.durationMs ?? 3000);
  const id = makeOpenVideoId("caption");
  next.clips[id] = {
    id,
    type: "Caption",
    name: "Caption",
    src: "",
    text,
    timing: {
      display: { from, to: from + duration },
      duration,
      playbackRate: 1,
    },
    transform: {
      x: Math.round(next.settings.width * 0.15),
      y: Math.round(next.settings.height * 0.8),
      width: Math.round(next.settings.width * 0.7),
      height: 100,
      angle: 0,
      opacity: 1,
      zIndex: 20,
      flip: { x: false, y: false },
    },
    style: {
      fontSize: 64,
      color: "#ffffff",
      align: "center",
      fontWeight: "700",
    },
    caption: {
      words: [{ text, from: 0, to: duration / 1000, isKeyWord: false }],
      colors: { active: { color: "#ffffff" }, future: { color: "#ffffff" } },
      positioning: {
        videoWidth: next.settings.width,
        videoHeight: next.settings.height,
      },
    },
  };
  track.clipIds.push(id);
  return { ok: true, project: normalizeOpenVideoProject(next) };
}

export function setOpenVideoCaptionStyle(
  project: OpenVideoProject,
  clipId: string,
  style: { fontSize?: number; color?: string; align?: string },
): VideoFacadeResult {
  return withClip(project, clipId, (clip, next) => {
    if (String(clip.type).toLowerCase() !== "caption" && String(clip.type).toLowerCase() !== "text") {
      return fail("只有字幕/文字片段能改字幕样式。");
    }
    if (!hasCaptionStylePatch(style)) {
      return fail(VIDEO_CAPTION_STYLE_NEEDS_VALUE);
    }
    clip.style = {
      ...(clip.style || {}),
      ...(typeof style.fontSize === "number" && Number.isFinite(style.fontSize)
        ? { fontSize: style.fontSize }
        : {}),
      ...(style.color ? { color: style.color } : {}),
      ...(style.align ? { align: style.align } : {}),
    };
    return { ok: true, project: next };
  });
}

export const VIDEO_DESIGNCOMBO_COMMANDS = [
  { id: "split", label: "分割", layer: "l1" },
  { id: "delete", label: "删除", layer: "l1" },
  { id: "muted", label: "静音", layer: "l1" },
  { id: "speed", label: "速度", layer: "l1" },
  { id: "volume", label: "音量", layer: "l1" },
  { id: "caption-style", label: "字幕样式", layer: "l1" },
  { id: "add-caption", label: "加字幕", layer: "l2" },
  { id: "crop-frame", label: "画面裁切", layer: "l2" },
  { id: "keyframes", label: "关键帧", layer: "l2" },
] as const;

export function runVideoDesigncomboCommand(
  id: string,
  project: OpenVideoProject,
  args: VideoFacadeArgs,
): VideoFacadeResult {
  switch (id) {
    case "split":
      return splitOpenVideoClip(project, String(args.clipId || ""), Number(args.atUs) || 0);
    case "delete":
      return deleteOpenVideoClip(project, String(args.clipId || ""));
    case "volume":
      if (!hasFiniteCommandNumber(args.value)) {
        return fail(VIDEO_VOLUME_NEEDS_VALUE);
      }
      return setOpenVideoVolume(
        project,
        String(args.clipId || ""),
        Number(args.value) / (Number(args.value) > 2 ? 100 : 1),
      );
    case "muted":
      if (!hasBooleanCommandValue(args.value)) {
        return fail(VIDEO_MUTE_NEEDS_CHOICE);
      }
      return setOpenVideoMuted(project, String(args.clipId || ""), args.value);
    case "speed":
      if (!hasFiniteCommandNumber(args.value)) {
        return fail(VIDEO_SPEED_NEEDS_VALUE);
      }
      return setOpenVideoSpeed(
        project,
        String(args.clipId || ""),
        Number(args.value),
      );
    case "crop-frame":
      if (!hasCropRect(args.crop)) return fail(VIDEO_CROP_NEEDS_RECT);
      return cropOpenVideoClip(project, String(args.clipId || ""), args.crop);
    case "keyframes":
      if (!hasKeyframeTable(args.keyframes)) {
        return fail(VIDEO_KEYFRAMES_NEED_TABLE);
      }
      return setOpenVideoKeyframes(
        project,
        String(args.clipId || ""),
        args.keyframes,
      );
    case "add-caption":
      if (!hasFiniteTime(args.atUs)) {
        const text = String(args.text || args.value || "").trim();
        if (!text) return fail(VIDEO_CAPTION_NEEDS_TEXT);
        return fail(VIDEO_CAPTION_NEEDS_TIME);
      }
      return addOpenVideoCaption(project, {
        text: String(args.text || args.value || ""),
        fromMs: usToMsSafe(args.atUs),
      });
    case "caption-style":
      if (typeof args.value !== "string" && typeof args.value !== "number") {
        return fail(VIDEO_CAPTION_STYLE_NEEDS_VALUE);
      }
      if (typeof args.value === "string" && args.value.trim() === "") {
        return fail(VIDEO_CAPTION_STYLE_NEEDS_VALUE);
      }
      if (typeof args.value === "number" && !Number.isFinite(args.value)) {
        return fail(VIDEO_CAPTION_STYLE_NEEDS_VALUE);
      }
      return setOpenVideoCaptionStyle(project, String(args.clipId || ""), {
        color: typeof args.value === "string" ? args.value : undefined,
        fontSize: typeof args.value === "number" ? args.value : undefined,
      });
    default:
      return fail(`没有这条命令：${id}`);
  }
}

function usToMsSafe(us: number): number {
  return Math.max(0, Math.round(us / 1000));
}
