/**
 * OpenVideo / designcombo project JSON — the next-core carrier.
 *
 * Field names, units (microseconds) and clip `type` values are taken from
 * vendor `upstream/data.ts.upstream` (commit 9a8c529). This file is a typed
 * view of that JSON, not a second timeline engine.
 */
export const MICROSECONDS_PER_SECOND = 1_000_000;

/** Frozen after conversion. Distinct from the legacy `oceanleo.timeline.v1`. */
export const OPENVIDEO_PROJECT_SCHEMA = "oceanleo.video.openvideo.v1";

/** Legacy self-built timeline (R7 read-only until the user converts). */
export const LEGACY_TIMELINE_SCHEMA = "oceanleo.timeline.v1";

export type OpenVideoTrackType =
  | "video"
  | "audio"
  | "image"
  | "text"
  | "caption";

export type OpenVideoClipType =
  | "Video"
  | "Audio"
  | "Image"
  | "Text"
  | "Caption";

export interface OpenVideoDisplay {
  from: number;
  to: number;
}

export interface OpenVideoTiming {
  display: OpenVideoDisplay;
  trim?: OpenVideoDisplay;
  duration: number;
  playbackRate?: number;
}

export interface OpenVideoTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  angle?: number;
  opacity?: number;
  zIndex?: number;
  flip?: { x: boolean; y: boolean };
}

export interface OpenVideoCaptionWord {
  text: string;
  from: number;
  to: number;
  isKeyWord?: boolean;
  paragraphIndex?: string;
}

export interface OpenVideoCaption {
  words: OpenVideoCaptionWord[];
  colors?: {
    active?: { color?: string; background?: string };
    future?: { color?: string };
    keyword?: { color?: string; preserveAfterSpoken?: boolean };
  };
  positioning?: { videoWidth: number; videoHeight: number };
}

export interface OpenVideoKeyframeAnimation {
  type: "keyframes";
  options: {
    duration: number;
    delay?: number;
    easing?: string;
    iterCount?: number;
    id?: string;
    disableGlobalEasing?: boolean;
  };
  params: Record<string, Record<string, number>>;
}

export interface OpenVideoClip {
  id: string;
  type: OpenVideoClipType | string;
  name?: string;
  src?: string;
  text?: string;
  timing: OpenVideoTiming;
  transform?: OpenVideoTransform;
  style?: Record<string, unknown>;
  caption?: OpenVideoCaption;
  volume?: number;
  audio?: boolean;
  muted?: boolean;
  animations?: OpenVideoKeyframeAnimation[];
  locked?: boolean;
  /** Spatial crop window, 0..1 of the source frame. Vendor transform is the pixel form. */
  crop?: { x: number; y: number; width: number; height: number };
  wordsPerLine?: string;
  fontUrl?: string;
  mediaId?: string;
  metadata?: Record<string, unknown>;
}

export interface OpenVideoTrack {
  id: string;
  name: string;
  type: OpenVideoTrackType | string;
  clipIds: string[];
  muted?: boolean;
}

export interface OpenVideoSettings {
  width: number;
  height: number;
  fps: number;
  backgroundColor?: string;
  format?: string;
}

export interface OpenVideoProject {
  settings: OpenVideoSettings;
  tracks: OpenVideoTrack[];
  clips: Record<string, OpenVideoClip>;
}

export function msToUs(ms: number): number {
  return Math.round(Math.max(0, ms) * 1000);
}

export function usToMs(us: number): number {
  return Math.max(0, Math.round(Number(us) / 1000));
}

export function makeOpenVideoId(prefix: string): string {
  const raw =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${raw.replace(/-/g, "").slice(0, 12)}`;
}

export function emptyOpenVideoProject(
  width = 1920,
  height = 1080,
  fps = 30,
): OpenVideoProject {
  return {
    settings: {
      width,
      height,
      fps,
      backgroundColor: "#111111",
      format: "mp4",
    },
    tracks: [
      { id: makeOpenVideoId("track"), name: "Video", type: "video", clipIds: [] },
      { id: makeOpenVideoId("track"), name: "Audio", type: "audio", clipIds: [] },
      { id: makeOpenVideoId("track"), name: "Captions", type: "caption", clipIds: [] },
      { id: makeOpenVideoId("track"), name: "Images", type: "image", clipIds: [] },
    ],
    clips: {},
  };
}

export function cloneOpenVideoProject(
  project: OpenVideoProject,
): OpenVideoProject {
  return structuredClone(project);
}

export function findTrackForClip(
  project: OpenVideoProject,
  clipId: string,
): OpenVideoTrack | null {
  return (
    project.tracks.find((track) => track.clipIds.includes(clipId)) || null
  );
}

export function projectDurationUs(project: OpenVideoProject): number {
  let end = 0;
  for (const clip of Object.values(project.clips)) {
    end = Math.max(end, Number(clip.timing?.display?.to) || 0);
  }
  return end;
}

export function isOpenVideoProject(value: unknown): value is OpenVideoProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<OpenVideoProject>;
  return (
    Boolean(project.settings) &&
    typeof project.settings === "object" &&
    Array.isArray(project.tracks) &&
    Boolean(project.clips) &&
    typeof project.clips === "object"
  );
}

export function normalizeOpenVideoProject(
  project: OpenVideoProject,
): OpenVideoProject {
  const width = Math.round(
    Math.min(3840, Math.max(16, Number(project.settings?.width) || 1920)),
  );
  const height = Math.round(
    Math.min(3840, Math.max(16, Number(project.settings?.height) || 1080)),
  );
  const fps = Math.round(
    Math.min(60, Math.max(1, Number(project.settings?.fps) || 30)),
  );
  const clips: Record<string, OpenVideoClip> = {};
  for (const [id, clip] of Object.entries(project.clips || {})) {
    if (!clip || typeof clip !== "object") continue;
    const from = Math.max(0, Number(clip.timing?.display?.from) || 0);
    const to = Math.max(from + 1000, Number(clip.timing?.display?.to) || from + 1000);
    clips[id] = {
      ...clip,
      id: clip.id || id,
      timing: {
        display: { from, to },
        trim: clip.timing?.trim,
        duration: Number(clip.timing?.duration) || to - from,
        playbackRate: Number(clip.timing?.playbackRate) || 1,
      },
    };
  }
  return {
    settings: {
      width,
      height,
      fps,
      backgroundColor: project.settings?.backgroundColor || "#111111",
      format: project.settings?.format || "mp4",
    },
    tracks: (project.tracks || []).map((track) => ({
      ...track,
      clipIds: (track.clipIds || []).filter((id) => Boolean(clips[id])),
    })),
    clips,
  };
}
