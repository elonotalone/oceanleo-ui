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

function fail(reason: string): VideoFacadeResult {
  return { ok: false, reason };
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
    const nextVolume = Math.min(2, Math.max(0, Number(volume) || 0));
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
    const playbackRate = Math.min(4, Math.max(0.25, Number(speed) || 1));
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
    const x = Math.min(1, Math.max(0, Number(crop.x) || 0));
    const y = Math.min(1, Math.max(0, Number(crop.y) || 0));
    const width = Math.min(1 - x, Math.max(0.05, Number(crop.width) || 1));
    const height = Math.min(1 - y, Math.max(0.05, Number(crop.height) || 1));
    clip.crop = { x, y, width, height };
    const canvasW = next.settings.width;
    const canvasH = next.settings.height;
    clip.transform = {
      x: Math.round(x * canvasW),
      y: Math.round(y * canvasH),
      width: Math.round(width * canvasW),
      height: Math.round(height * canvasH),
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
      return fail("关键帧必须包含 0% 和 100%（OpenVideo 动画参数表）。");
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
  if (!text) return fail("字幕是空的，没有可以加上的字。");
  if (text.length > 200) {
    return fail("这一条字幕超过 200 个字。请拆成两句再加。");
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
    clip.style = {
      ...(clip.style || {}),
      ...(style.fontSize ? { fontSize: style.fontSize } : {}),
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
      return setOpenVideoVolume(
        project,
        String(args.clipId || ""),
        Number(args.value) / (Number(args.value) > 2 ? 100 : 1),
      );
    case "muted":
      return setOpenVideoMuted(project, String(args.clipId || ""), args.value === true);
    case "speed":
      return setOpenVideoSpeed(project, String(args.clipId || ""), Number(args.value) || 1);
    case "crop-frame":
      if (!args.crop) return fail("画面裁切需要 x/y/width/height（0..1）。");
      return cropOpenVideoClip(project, String(args.clipId || ""), args.crop);
    case "keyframes":
      return setOpenVideoKeyframes(
        project,
        String(args.clipId || ""),
        args.keyframes || { "0%": { x: 0 }, "100%": { x: 0 } },
      );
    case "add-caption":
      return addOpenVideoCaption(project, {
        text: String(args.text || args.value || ""),
        fromMs: usToMsSafe(Number(args.atUs) || 0),
      });
    case "caption-style":
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
