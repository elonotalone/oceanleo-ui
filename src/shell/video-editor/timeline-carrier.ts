// ============================================================================
// @oceanleo/ui — video-timeline 载体契约（`oceanleo.timeline.v1`）
// ----------------------------------------------------------------------------
// 规格:docs/specs/oceanleo-material-and-game-v1/L1-carriers/video-timeline.md
// 本模块是该契约在编辑器侧的单一事实源:§1.1 四元组、§1.3 运行时版本锁、
// §2 时间线色板/版面/画面与字幕/无障碍、§3 JSON Schema、§3.2 状态机、
// §3.3 预览分辨率契约、§4 常量表、§8 字节下限与完备判据。
//
// 与 `types.ts` 的 TimelineDoc 的关系:TimelineDoc 是编辑器与网关 ffmpeg 的
// wire 合同(snake_case、无标题无署名),`oceanleo.timeline.v1` 是落库的工程
// IR。两者靠本文件末尾的双向桥接对齐 —— 只写 TimelineDoc 而不补 IR 字段,
// 正是合同 §2.2 记录的 271 B 空壳的成因。
// ============================================================================

import { clipEndMs, docDurationMs, normalizeTimelineDoc } from "./timeline-model";
import type { TimelineClip, TimelineDoc, TimelineTrack, TrackKind } from "./types";

/** §1.1 project_schema。 */
export const TIMELINE_PROJECT_SCHEMA_ID = "oceanleo.timeline.v1";

/** §1.1 四元组(Normative,逐字)。 */
export const TIMELINE_CARRIER_QUAD = Object.freeze({
  featureId: "video_editing",
  artifactType: "video",
  sourceFormat: "mp4",
  sourceMediaType: "video/mp4",
  editorCapability: "video-timeline",
  adapter: "video-timeline",
  projectSchema: TIMELINE_PROJECT_SCHEMA_ID,
  editability: "bounded",
  sourceIntegrity: "content_addressed",
  openMode: "native-file",
  previewPurposes: ["full", "preview"] as const,
  dependencyClosure: "not_required",
});

/**
 * §1.3 运行时版本锁。MUST NOT 依赖 GPU 编码器 —— 合同 §2.9 记明本机无 GPU,
 * `h264_nvenc` 之类一旦写进渲染请求就是必然失败的批产。
 */
export const TIMELINE_RUNTIME_LOCK = Object.freeze({
  ffmpeg: "msd/oceanleo-convert 内的既有二进制",
  ffprobe: "msd/oceanleo-convert 内的既有二进制",
  napiRsCanvas: "0.1.100",
  softwareEncoderOnly: true,
  forbiddenEncoders: Object.freeze(["h264_nvenc", "hevc_nvenc", "h264_qsv", "h264_amf"]),
});

// ---------------------------------------------------------------- §2 视觉靶

/** §2.1 时间线色板。取值与实测对比度都是 Normative,MUST NOT 私自调。 */
export const TIMELINE_PALETTE = Object.freeze({
  "tl.bg": Object.freeze({ value: "#14171B", contrastFloor: 0, measured: 0 }),
  "tl.clip.video": Object.freeze({
    value: "#1F6FEB",
    contrastFloor: 3.0,
    measured: 3.88,
  }),
  "tl.clip.audio": Object.freeze({
    value: "#2E8B6F",
    contrastFloor: 3.0,
    measured: 4.31,
  }),
  "tl.clip.text": Object.freeze({
    value: "#D9822B",
    contrastFloor: 3.0,
    measured: 6.15,
  }),
  "tl.playhead": Object.freeze({
    value: "#FFD43B",
    contrastFloor: 4.5,
    measured: 12.61,
  }),
  "tl.transition": Object.freeze({
    value: "#8E5BA6",
    contrastFloor: 3.0,
    measured: 3.59,
  }),
  "tl.grid": Object.freeze({
    value: "#5D6976",
    contrastFloor: 3.0,
    measured: 3.21,
  }),
});

/**
 * §2.1 末段:片段块上的文字是文字,MUST 对所在块底色 ≥ 4.5:1(SC 1.4.3)。
 * `tl.clip.audio` 上白字只有 4.17:1、时间线底色 `#14171B` 只有 4.31:1,
 * 两者都不达标,故该块的标签 MUST 用近黑 `#0B0F14`。
 */
export const TIMELINE_CLIP_LABEL_COLORS = Object.freeze({
  "tl.clip.video": Object.freeze({
    background: "#1F6FEB",
    label: "#FFFFFF",
    measured: 4.63,
  }),
  "tl.clip.audio": Object.freeze({
    background: "#2E8B6F",
    label: "#0B0F14",
    measured: 4.61,
  }),
  "tl.clip.text": Object.freeze({
    background: "#D9822B",
    label: "#14171B",
    measured: 6.15,
  }),
});

/** §2.2 版面。 */
export const TIMELINE_LAYOUT = Object.freeze({
  trackRowHeightPx: 64,
  rulerHeightPx: 32,
  minimumClipWidthPx: 24,
  playheadWidthPx: 2,
  captionSafeAreaPercent: 5,
  titleSafeAreaPercent: 10,
  minimumHitAreaPx: 24,
});

/** §2.3 画面与字幕。 */
export const TIMELINE_PICTURE = Object.freeze({
  standardWidthPx: 1_920,
  standardHeightPx: 1_080,
  lightWidthPx: 1_280,
  lightHeightPx: 720,
  fps: 30,
  captionFontSizePx: 42,
  captionLineHeightPx: 56,
  captionMaxCharsPerLine: 20,
  captionStrokeWidthPx: 3,
  captionBottomPaddingPx: 90,
});

/** §2.4 无障碍成功准则编号。 */
export const TIMELINE_ACCESSIBILITY = Object.freeze({
  captionsSuccessCriterion: "WCAG 2.2 SC 1.2.2",
  audioDescriptionSuccessCriterion: "WCAG 2.2 SC 1.2.3",
  autoplaySuccessCriterion: "WCAG 2.2 SC 1.4.2",
  flashSuccessCriterion: "WCAG 2.2 SC 2.3.1",
  autoplayCeilingMs: 3_000,
  maxFlashesPerSecond: 3,
  minCaptionsWhenSpeech: 3,
});

// ---------------------------------------------------------------- §4 常量表

/** §4 C1–C44,逐条照抄。 */
export const TIMELINE_CONSTANTS = Object.freeze({
  C1_minDurationMs: 6_000,
  C2_maxDurationMs: 1_800_000,
  C3_durationEvidenceToleranceMs: 1_500,
  C4_standardResolution: Object.freeze([1_920, 1_080]),
  C5_lightResolution: Object.freeze([1_280, 720]),
  C6_widthDomainPx: Object.freeze([640, 3_840]),
  C7_heightDomainPx: Object.freeze([360, 2_160]),
  C8_fpsSet: Object.freeze([24, 25, 30, 50, 60]),
  C9_defaultFps: 30,
  C10_videoBitrateDomainKbps: Object.freeze([800, 20_000]),
  C11_default1080pBitrateKbps: 6_000,
  C12_default720pBitrateKbps: 3_000,
  C13_audioBitrateDomainKbps: Object.freeze([64, 320]),
  C14_defaultAudioBitrateKbps: 160,
  C15_minTracks: 2,
  C16_maxTracks: 16,
  C17_minClipsPerTrack: 1,
  C18_maxClipsPerTrack: 200,
  C19_minTotalClips: 4,
  C20_minClipDurationMs: 400,
  C21_minimumClipWidthPx: 24,
  C22_transitionDurationDomainMs: Object.freeze([0, 3_000]),
  C23_transitionKindCount: 5,
  C24_defaultCrossfadeMs: 500,
  C25_maxCaptions: 2_000,
  C26_captionMaxCharsPerLine: 20,
  C27_captionFontSizePx: 42,
  C28_captionBottomPaddingPx: 90,
  C29_captionSafeAreaPercent: 5,
  C30_titleSafeAreaPercent: 10,
  C31_targetLufs: -14,
  C32_truePeakCeilingDbtp: -1.0,
  C33_maxFlashesPerSecond: 3,
  C34_autoplayCeilingMs: 3_000,
  C35_trackRowHeightPx: 64,
  C36_minimumReviewedCoverEdgePx: 128,
  C37_irMinBytes: 2_560,
  C38_mp4MinBytes: 1_048_576,
  C39_mp4MaxBytes: 2_147_483_648,
  C40_encodeWallClockCeilingMs: 120_000,
  C41_frameGrid: Object.freeze([4, 3]),
  C42_frameGridMinColors: 24,
  C43_familyJaccardCeiling: 0.85,
  C44_twinThreshold: 0.99,
});

/** §8.1 字节下限。IR 上限取 §7 A4 的 2,097,152 B。 */
export const TIMELINE_BYTE_FLOORS = Object.freeze({
  irMinBytes: 2_560,
  irMaxBytes: 2_097_152,
  sourceMinBytes: 1_048_576,
  sourceMaxBytes: 2_147_483_648,
});

/** §8.1 末段:catalog pack 的 qualityPolicy 目标值(键归 W2)。 */
export const TIMELINE_QUALITY_POLICY_TARGET = Object.freeze({
  "minimumSourceBytesByEditorClass.video_editing": 1_048_576,
  minimumVideoDurationMs: 6_000,
});

// --------------------------------------------------------------- §3 Schema

export type TimelineIrTrackKind = "video" | "audio" | "text" | "overlay";

export type TimelineIrTransitionKind =
  | "cut"
  | "crossfade"
  | "fade-to-black"
  | "wipe"
  | "dissolve";

export interface TimelineIrOutput {
  widthPx: number;
  heightPx: number;
  fps: number;
  durationMs: number;
  videoBitrateKbps: number;
  audioBitrateKbps?: number;
  codec?: "h264";
}

export interface TimelineIrClip {
  id: string;
  assetId?: string;
  startMs: number;
  durationMs: number;
  sourceInMs?: number;
  text?: string;
  opacity?: number;
  scale?: number;
  gainDb?: number;
  licenseCode?: string;
}

export interface TimelineIrTrack {
  id: string;
  kind: TimelineIrTrackKind;
  muted?: boolean;
  clips: TimelineIrClip[];
}

export interface TimelineIrTransition {
  atMs: number;
  kind: TimelineIrTransitionKind;
  durationMs: number;
}

export interface TimelineIrCaption {
  startMs: number;
  endMs: number;
  text: string;
}

export interface TimelineIrAudioMix {
  integratedLufs?: number;
  truePeakDbtp?: number;
}

export interface TimelineIrAttributionEntry {
  text: string;
  licenseCode: string;
  licenseUrl: string;
  clipId?: string;
}

export interface TimelineProjectIr {
  schema: typeof TIMELINE_PROJECT_SCHEMA_ID;
  version: 1;
  title: string;
  description: string;
  output: TimelineIrOutput;
  tracks: TimelineIrTrack[];
  transitions?: TimelineIrTransition[];
  captions?: TimelineIrCaption[];
  audioMix?: TimelineIrAudioMix;
  attribution: { entries: TimelineIrAttributionEntry[] };
}

export interface TimelineValidationError {
  code: string;
  path: string;
  message: string;
}

type Issues = TimelineValidationError[];

const IR_TRACK_KINDS: readonly TimelineIrTrackKind[] = [
  "video",
  "audio",
  "text",
  "overlay",
];

export const TIMELINE_IR_TRANSITION_KINDS: readonly TimelineIrTransitionKind[] = [
  "cut",
  "crossfade",
  "fade-to-black",
  "wipe",
  "dissolve",
];

const ID_PATTERN = /^[a-z][a-z0-9_-]{0,47}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pushIssue(issues: Issues, code: string, path: string, message: string): void {
  issues.push({ code, path, message });
}

function rejectExtraKeys(
  issues: Issues,
  path: string,
  value: Record<string, unknown>,
  allowed: readonly string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      pushIssue(
        issues,
        "additional-property",
        `${path}${path ? "." : ""}${key}`,
        `${key} 不在 ${TIMELINE_PROJECT_SCHEMA_ID} 的字段表内`,
      );
    }
  }
}

function requireIntegerInRange(
  issues: Issues,
  path: string,
  value: unknown,
  min: number,
  max: number,
): void {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    pushIssue(issues, "range", path, `必须是 ${min}–${max} 的整数`);
  }
}

function requireNumberInRange(
  issues: Issues,
  path: string,
  value: unknown,
  min: number,
  max: number,
): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    pushIssue(issues, "range", path, `必须是 ${min}–${max} 的数值`);
  }
}

function requireStringLength(
  issues: Issues,
  path: string,
  value: unknown,
  min: number,
  max: number,
): void {
  if (typeof value !== "string" || value.length < min || value.length > max) {
    pushIssue(issues, "length", path, `必须是长度 ${min}–${max} 的字符串`);
  }
}

function requireEnum(
  issues: Issues,
  path: string,
  value: unknown,
  allowed: readonly unknown[],
): void {
  if (!allowed.includes(value as never)) {
    pushIssue(issues, "enum", path, `必须取自 ${allowed.join(" / ")}`);
  }
}

function validateOutput(issues: Issues, value: unknown): void {
  if (!isPlainObject(value)) {
    pushIssue(issues, "type", "output", "output 必须是对象");
    return;
  }
  rejectExtraKeys(issues, "output", value, [
    "widthPx",
    "heightPx",
    "fps",
    "durationMs",
    "videoBitrateKbps",
    "audioBitrateKbps",
    "codec",
  ]);
  for (const key of ["widthPx", "heightPx", "fps", "durationMs", "videoBitrateKbps"]) {
    if (value[key] === undefined) {
      pushIssue(issues, "required", `output.${key}`, `output.${key} 是必填字段`);
    }
  }
  requireIntegerInRange(
    issues,
    "output.widthPx",
    value.widthPx,
    TIMELINE_CONSTANTS.C6_widthDomainPx[0],
    TIMELINE_CONSTANTS.C6_widthDomainPx[1],
  );
  requireIntegerInRange(
    issues,
    "output.heightPx",
    value.heightPx,
    TIMELINE_CONSTANTS.C7_heightDomainPx[0],
    TIMELINE_CONSTANTS.C7_heightDomainPx[1],
  );
  requireEnum(issues, "output.fps", value.fps, TIMELINE_CONSTANTS.C8_fpsSet);
  requireIntegerInRange(
    issues,
    "output.durationMs",
    value.durationMs,
    TIMELINE_CONSTANTS.C1_minDurationMs,
    TIMELINE_CONSTANTS.C2_maxDurationMs,
  );
  requireIntegerInRange(
    issues,
    "output.videoBitrateKbps",
    value.videoBitrateKbps,
    TIMELINE_CONSTANTS.C10_videoBitrateDomainKbps[0],
    TIMELINE_CONSTANTS.C10_videoBitrateDomainKbps[1],
  );
  if (value.audioBitrateKbps !== undefined) {
    requireIntegerInRange(
      issues,
      "output.audioBitrateKbps",
      value.audioBitrateKbps,
      TIMELINE_CONSTANTS.C13_audioBitrateDomainKbps[0],
      TIMELINE_CONSTANTS.C13_audioBitrateDomainKbps[1],
    );
  }
  if (value.codec !== undefined) {
    // §3 末段:交付容器锁死 mp4 且必须软件编码,所以 codec 只允许 h264。
    requireEnum(issues, "output.codec", value.codec, ["h264"]);
  }
}

function validateTracks(issues: Issues, value: unknown): void {
  if (!Array.isArray(value)) {
    pushIssue(issues, "type", "tracks", "tracks 必须是数组");
    return;
  }
  if (value.length < TIMELINE_CONSTANTS.C15_minTracks) {
    pushIssue(
      issues,
      "min-items",
      "tracks",
      `轨数 ${value.length} < ${TIMELINE_CONSTANTS.C15_minTracks}(C15:至少视频 1 + 音频 1)`,
    );
  }
  if (value.length > TIMELINE_CONSTANTS.C16_maxTracks) {
    pushIssue(issues, "max-items", "tracks", `轨数 ${value.length} > ${TIMELINE_CONSTANTS.C16_maxTracks}(C16)`);
  }
  value.forEach((track, index) => {
    const path = `tracks[${index}]`;
    if (!isPlainObject(track)) {
      pushIssue(issues, "type", path, "轨必须是对象");
      return;
    }
    rejectExtraKeys(issues, path, track, ["id", "kind", "muted", "clips"]);
    if (typeof track.id !== "string" || !ID_PATTERN.test(track.id)) {
      pushIssue(issues, "pattern", `${path}.id`, "id 必须匹配 ^[a-z][a-z0-9_-]{0,47}$");
    }
    requireEnum(issues, `${path}.kind`, track.kind, IR_TRACK_KINDS);
    if (track.muted !== undefined && typeof track.muted !== "boolean") {
      pushIssue(issues, "type", `${path}.muted`, "muted 必须是布尔值");
    }
    const clips = track.clips;
    if (!Array.isArray(clips)) {
      pushIssue(issues, "type", `${path}.clips`, "clips 必须是数组");
      return;
    }
    if (clips.length < TIMELINE_CONSTANTS.C17_minClipsPerTrack) {
      pushIssue(issues, "min-items", `${path}.clips`, "每轨至少 1 个片段(C17)");
    }
    if (clips.length > TIMELINE_CONSTANTS.C18_maxClipsPerTrack) {
      pushIssue(issues, "max-items", `${path}.clips`, `单轨片段 > ${TIMELINE_CONSTANTS.C18_maxClipsPerTrack}(C18)`);
    }
    clips.forEach((clip, clipIndex) => {
      const clipPath = `${path}.clips[${clipIndex}]`;
      if (!isPlainObject(clip)) {
        pushIssue(issues, "type", clipPath, "片段必须是对象");
        return;
      }
      rejectExtraKeys(issues, clipPath, clip, [
        "id",
        "assetId",
        "startMs",
        "durationMs",
        "sourceInMs",
        "text",
        "opacity",
        "scale",
        "gainDb",
        "licenseCode",
      ]);
      if (typeof clip.id !== "string" || !ID_PATTERN.test(clip.id)) {
        pushIssue(issues, "pattern", `${clipPath}.id`, "id 必须匹配 ^[a-z][a-z0-9_-]{0,47}$");
      }
      requireIntegerInRange(
        issues,
        `${clipPath}.startMs`,
        clip.startMs,
        0,
        TIMELINE_CONSTANTS.C2_maxDurationMs,
      );
      requireIntegerInRange(
        issues,
        `${clipPath}.durationMs`,
        clip.durationMs,
        TIMELINE_CONSTANTS.C20_minClipDurationMs,
        TIMELINE_CONSTANTS.C2_maxDurationMs,
      );
      if (clip.assetId !== undefined) {
        requireStringLength(issues, `${clipPath}.assetId`, clip.assetId, 0, 64);
      }
      if (clip.sourceInMs !== undefined) {
        requireIntegerInRange(
          issues,
          `${clipPath}.sourceInMs`,
          clip.sourceInMs,
          0,
          TIMELINE_CONSTANTS.C2_maxDurationMs,
        );
      }
      if (clip.text !== undefined) {
        requireStringLength(issues, `${clipPath}.text`, clip.text, 0, 300);
      }
      if (clip.opacity !== undefined) {
        requireNumberInRange(issues, `${clipPath}.opacity`, clip.opacity, 0, 1);
      }
      if (clip.scale !== undefined) {
        requireNumberInRange(issues, `${clipPath}.scale`, clip.scale, 0.1, 4);
      }
      if (clip.gainDb !== undefined) {
        requireNumberInRange(issues, `${clipPath}.gainDb`, clip.gainDb, -60, 12);
      }
      if (clip.licenseCode !== undefined) {
        requireStringLength(issues, `${clipPath}.licenseCode`, clip.licenseCode, 0, 60);
      }
    });
  });
}

function validateTransitions(issues: Issues, value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    pushIssue(issues, "type", "transitions", "transitions 必须是数组");
    return;
  }
  if (value.length > 100) {
    pushIssue(issues, "max-items", "transitions", "转场条数 > 100");
  }
  value.forEach((transition, index) => {
    const path = `transitions[${index}]`;
    if (!isPlainObject(transition)) {
      pushIssue(issues, "type", path, "转场必须是对象");
      return;
    }
    rejectExtraKeys(issues, path, transition, ["atMs", "kind", "durationMs"]);
    requireIntegerInRange(
      issues,
      `${path}.atMs`,
      transition.atMs,
      0,
      TIMELINE_CONSTANTS.C2_maxDurationMs,
    );
    requireEnum(issues, `${path}.kind`, transition.kind, TIMELINE_IR_TRANSITION_KINDS);
    requireIntegerInRange(
      issues,
      `${path}.durationMs`,
      transition.durationMs,
      TIMELINE_CONSTANTS.C22_transitionDurationDomainMs[0],
      TIMELINE_CONSTANTS.C22_transitionDurationDomainMs[1],
    );
  });
}

function validateCaptions(issues: Issues, value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    pushIssue(issues, "type", "captions", "captions 必须是数组");
    return;
  }
  if (value.length > TIMELINE_CONSTANTS.C25_maxCaptions) {
    pushIssue(issues, "max-items", "captions", `字幕条数 > ${TIMELINE_CONSTANTS.C25_maxCaptions}(C25)`);
  }
  value.forEach((caption, index) => {
    const path = `captions[${index}]`;
    if (!isPlainObject(caption)) {
      pushIssue(issues, "type", path, "字幕必须是对象");
      return;
    }
    rejectExtraKeys(issues, path, caption, ["startMs", "endMs", "text"]);
    requireIntegerInRange(
      issues,
      `${path}.startMs`,
      caption.startMs,
      0,
      TIMELINE_CONSTANTS.C2_maxDurationMs,
    );
    requireIntegerInRange(
      issues,
      `${path}.endMs`,
      caption.endMs,
      1,
      TIMELINE_CONSTANTS.C2_maxDurationMs,
    );
    requireStringLength(issues, `${path}.text`, caption.text, 1, 200);
  });
}

function validateAudioMix(issues: Issues, value: unknown): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    pushIssue(issues, "type", "audioMix", "audioMix 必须是对象");
    return;
  }
  rejectExtraKeys(issues, "audioMix", value, ["integratedLufs", "truePeakDbtp"]);
  if (value.integratedLufs !== undefined) {
    requireNumberInRange(issues, "audioMix.integratedLufs", value.integratedLufs, -30, -6);
  }
  if (value.truePeakDbtp !== undefined) {
    requireNumberInRange(issues, "audioMix.truePeakDbtp", value.truePeakDbtp, -20, 0);
  }
}

function validateAttribution(issues: Issues, value: unknown): void {
  if (!isPlainObject(value)) {
    pushIssue(issues, "type", "attribution", "attribution 必须是对象");
    return;
  }
  rejectExtraKeys(issues, "attribution", value, ["entries"]);
  const entries = value.entries;
  if (!Array.isArray(entries)) {
    pushIssue(issues, "type", "attribution.entries", "entries 必须是数组");
    return;
  }
  if (entries.length < 1) {
    pushIssue(issues, "min-items", "attribution.entries", "至少 1 条署名(§8.2)");
  }
  if (entries.length > 32) {
    pushIssue(issues, "max-items", "attribution.entries", "署名条数 > 32");
  }
  entries.forEach((entry, index) => {
    const path = `attribution.entries[${index}]`;
    if (!isPlainObject(entry)) {
      pushIssue(issues, "type", path, "署名条目必须是对象");
      return;
    }
    rejectExtraKeys(issues, path, entry, ["text", "licenseCode", "licenseUrl", "clipId"]);
    requireStringLength(issues, `${path}.text`, entry.text, 2, 200);
    requireStringLength(issues, `${path}.licenseCode`, entry.licenseCode, 2, 60);
    if (
      typeof entry.licenseUrl !== "string" ||
      !entry.licenseUrl.startsWith("https://") ||
      entry.licenseUrl.length < 9
    ) {
      pushIssue(issues, "pattern", `${path}.licenseUrl`, "必须是 https:// 开头的 URI");
    }
    if (entry.clipId !== undefined) {
      requireStringLength(issues, `${path}.clipId`, entry.clipId, 0, 48);
    }
  });
}

export type TimelineValidationResult =
  | { ok: true; project: TimelineProjectIr }
  | { ok: false; errors: TimelineValidationError[] };

/** §3 完整 Schema 校验(Draft 2020-12 的手写落实,含 additionalProperties)。 */
export function validateTimelineProjectIr(value: unknown): TimelineValidationResult {
  const issues: Issues = [];
  if (!isPlainObject(value)) {
    return {
      ok: false,
      errors: [{ code: "type", path: "", message: "工程根节点必须是对象" }],
    };
  }
  rejectExtraKeys(issues, "", value, [
    "schema",
    "version",
    "title",
    "description",
    "output",
    "tracks",
    "transitions",
    "captions",
    "audioMix",
    "attribution",
  ]);
  for (const key of [
    "schema",
    "version",
    "title",
    "description",
    "output",
    "tracks",
    "attribution",
  ]) {
    if (value[key] === undefined) {
      pushIssue(issues, "required", key, `${key} 是必填字段`);
    }
  }
  if (value.schema !== TIMELINE_PROJECT_SCHEMA_ID) {
    pushIssue(issues, "const", "schema", `schema 必须是 ${TIMELINE_PROJECT_SCHEMA_ID}`);
  }
  if (value.version !== 1) {
    pushIssue(issues, "const", "version", "version 必须是整数 1");
  }
  requireStringLength(issues, "title", value.title, 8, 300);
  requireStringLength(issues, "description", value.description, 8, 1_000);
  if (value.output !== undefined) validateOutput(issues, value.output);
  if (value.tracks !== undefined) validateTracks(issues, value.tracks);
  validateTransitions(issues, value.transitions);
  validateCaptions(issues, value.captions);
  validateAudioMix(issues, value.audioMix);
  if (value.attribution !== undefined) validateAttribution(issues, value.attribution);

  // §3.2 `ir-validated → invalid`:片段越出成片时长即非法 IR。
  const output = isPlainObject(value.output) ? value.output : null;
  const outputDuration = Number(output?.durationMs ?? 0);
  if (Array.isArray(value.tracks) && Number.isFinite(outputDuration) && outputDuration > 0) {
    value.tracks.forEach((track, trackIndex) => {
      const clips = isPlainObject(track) && Array.isArray(track.clips) ? track.clips : [];
      clips.forEach((clip, clipIndex) => {
        if (!isPlainObject(clip)) return;
        const end = Number(clip.startMs ?? 0) + Number(clip.durationMs ?? 0);
        if (Number.isFinite(end) && end > outputDuration) {
          pushIssue(
            issues,
            "clip-overruns-output",
            `tracks[${trackIndex}].clips[${clipIndex}]`,
            `startMs + durationMs = ${end} > output.durationMs = ${outputDuration}`,
          );
        }
      });
    });
  }

  if (issues.length) return { ok: false, errors: issues };
  return { ok: true, project: value as unknown as TimelineProjectIr };
}

// --------------------------------------------------- §1.2 形态一:JSON IR

const IR_KEY_ORDER: readonly (keyof TimelineProjectIr)[] = [
  "schema",
  "version",
  "title",
  "description",
  "output",
  "tracks",
  "transitions",
  "captions",
  "audioMix",
  "attribution",
];

const OUTPUT_KEY_ORDER = [
  "widthPx",
  "heightPx",
  "fps",
  "durationMs",
  "videoBitrateKbps",
  "audioBitrateKbps",
  "codec",
] as const;

const TRACK_KEY_ORDER = ["id", "kind", "muted", "clips"] as const;
const CLIP_KEY_ORDER = [
  "id",
  "assetId",
  "startMs",
  "durationMs",
  "sourceInMs",
  "text",
  "opacity",
  "scale",
  "gainDb",
  "licenseCode",
] as const;
const TRANSITION_KEY_ORDER = ["atMs", "kind", "durationMs"] as const;
const CAPTION_KEY_ORDER = ["startMs", "endMs", "text"] as const;
const AUDIO_MIX_KEY_ORDER = ["integratedLufs", "truePeakDbtp"] as const;
const ATTRIBUTION_ENTRY_KEY_ORDER = ["text", "licenseCode", "licenseUrl", "clipId"] as const;

function orderedPick(
  source: Record<string, unknown>,
  order: readonly string[],
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of order) {
    if (source[key] !== undefined) output[key] = source[key];
  }
  return output;
}

/** 确定性序列化 —— roundtrip 判据(§9 C-2)靠这个成立。 */
export function serializeTimelineProjectIr(project: TimelineProjectIr): string {
  const canonical: Record<string, unknown> = {};
  for (const key of IR_KEY_ORDER) {
    const value = project[key];
    if (value === undefined) continue;
    if (key === "output") {
      canonical[key] = orderedPick(value as unknown as Record<string, unknown>, OUTPUT_KEY_ORDER);
    } else if (key === "tracks") {
      canonical[key] = (value as TimelineIrTrack[]).map((track) => {
        const ordered = orderedPick(
          track as unknown as Record<string, unknown>,
          TRACK_KEY_ORDER,
        );
        ordered.clips = track.clips.map((clip) =>
          orderedPick(clip as unknown as Record<string, unknown>, CLIP_KEY_ORDER),
        );
        return ordered;
      });
    } else if (key === "transitions") {
      canonical[key] = (value as TimelineIrTransition[]).map((entry) =>
        orderedPick(entry as unknown as Record<string, unknown>, TRANSITION_KEY_ORDER),
      );
    } else if (key === "captions") {
      canonical[key] = (value as TimelineIrCaption[]).map((entry) =>
        orderedPick(entry as unknown as Record<string, unknown>, CAPTION_KEY_ORDER),
      );
    } else if (key === "audioMix") {
      canonical[key] = orderedPick(
        value as unknown as Record<string, unknown>,
        AUDIO_MIX_KEY_ORDER,
      );
    } else if (key === "attribution") {
      canonical[key] = {
        entries: (value as TimelineProjectIr["attribution"]).entries.map((entry) =>
          orderedPick(
            entry as unknown as Record<string, unknown>,
            ATTRIBUTION_ENTRY_KEY_ORDER,
          ),
        ),
      };
    } else {
      canonical[key] = value;
    }
  }
  return `${JSON.stringify(canonical, null, 2)}\n`;
}

export class TimelineCarrierError extends Error {
  readonly code: string;
  readonly errors: TimelineValidationError[];

  constructor(code: string, message: string, errors: TimelineValidationError[] = []) {
    super(message);
    this.name = "TimelineCarrierError";
    this.code = code;
    this.errors = errors;
  }
}

function decodeUtf8(input: string | Uint8Array): string {
  if (typeof input === "string") return input;
  return new TextDecoder("utf-8", { fatal: false }).decode(input);
}

/** §1.2 形态一的载入口。失败抛带 code 的 TimelineCarrierError(§6)。 */
export function parseTimelineSource(input: string | Uint8Array): TimelineProjectIr {
  const text = decodeUtf8(input);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (caught) {
    throw new TimelineCarrierError(
      "video-ir-unparsable",
      `工程 JSON 无法解析:${caught instanceof Error ? caught.message : caught}`,
    );
  }
  const result = validateTimelineProjectIr(parsed);
  if (!result.ok) {
    throw new TimelineCarrierError(
      "video-ir-invalid",
      `工程不符合 ${TIMELINE_PROJECT_SCHEMA_ID}:${result.errors[0]?.path || "?"} ${result.errors[0]?.message || ""}`,
      result.errors,
    );
  }
  return result.project;
}

// ------------------------------------------------------ §1.2 形态二:mp4

export interface Mp4Inspection {
  ok: boolean;
  code?: string;
  message?: string;
  byteSize: number;
  boxes: string[];
  hasFtyp: boolean;
  hasMoov: boolean;
  hasMdat: boolean;
}

/**
 * §8.2 + F3:逐 box 走顶层 atom,要求 `ftyp` / `moov` / `mdat` 三者齐全 ——
 * 与 `reviewed_material_catalog.py:753` 同一条判据。裸流(缺 moov)在这里就
 * 能被拒,不必等到入库才抛「lacks MP4 ftyp/moov/mdat boxes」。
 */
export function inspectMp4Source(input: Uint8Array): Mp4Inspection {
  const bytes = input;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: string[] = [];
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    if (!/^[\x20-\x7e]{4}$/.test(type)) break;
    if (size === 1) {
      if (offset + 16 > bytes.length) break;
      const high = view.getUint32(offset + 8);
      const low = view.getUint32(offset + 12);
      size = high * 2 ** 32 + low;
    } else if (size === 0) {
      size = bytes.length - offset;
    }
    if (size < 8) break;
    boxes.push(type);
    offset += size;
  }
  const result: Mp4Inspection = {
    ok: false,
    byteSize: bytes.byteLength,
    boxes,
    hasFtyp: boxes.includes("ftyp"),
    hasMoov: boxes.includes("moov"),
    hasMdat: boxes.includes("mdat"),
  };
  if (!result.hasFtyp || !result.hasMoov || !result.hasMdat) {
    result.code = "video-mp4-missing-box";
    result.message = `lacks MP4 ftyp/moov/mdat boxes(实测 [${boxes.join(",")}])`;
    return result;
  }
  if (result.byteSize < TIMELINE_BYTE_FLOORS.sourceMinBytes) {
    result.code = "video-hollow";
    result.message = `mp4 源 ${result.byteSize} B < ${TIMELINE_BYTE_FLOORS.sourceMinBytes} B(§8.1)`;
    return result;
  }
  if (result.byteSize > TIMELINE_BYTE_FLOORS.sourceMaxBytes) {
    result.code = "video-source-too-large";
    result.message = `mp4 源 ${result.byteSize} B > ${TIMELINE_BYTE_FLOORS.sourceMaxBytes} B(C39)`;
    return result;
  }
  result.ok = true;
  return result;
}

// ------------------------------------------------------------ §3.2 状态机

export const TIMELINE_STATES = Object.freeze([
  "empty",
  "ir-validated",
  "clips-resolved",
  "rendered",
  "muxed",
  "ready",
  "invalid",
  "degraded",
] as const);

export type TimelineState = (typeof TIMELINE_STATES)[number];

/** §3.2 合法迁移表。 */
export const TIMELINE_TRANSITIONS: readonly (readonly [TimelineState, TimelineState])[] =
  Object.freeze([
    ["empty", "ir-validated"],
    ["empty", "invalid"],
    ["ir-validated", "invalid"],
    ["ir-validated", "clips-resolved"],
    ["clips-resolved", "degraded"],
    ["clips-resolved", "rendered"],
    ["rendered", "muxed"],
    ["muxed", "ready"],
    ["muxed", "invalid"],
  ] as const);

/** §3.2 的 5 条非法迁移。`empty → ready` 是 271 B 空壳的产生路径。 */
export const TIMELINE_ILLEGAL_TRANSITIONS: readonly (readonly [
  TimelineState,
  TimelineState,
])[] = Object.freeze([
  ["ir-validated", "muxed"],
  ["degraded", "ready"],
  ["rendered", "ready"],
  ["invalid", "rendered"],
  ["empty", "ready"],
] as const);

export function timelineTransitionAllowed(
  from: TimelineState,
  to: TimelineState,
): boolean {
  if (TIMELINE_ILLEGAL_TRANSITIONS.some(([a, b]) => a === from && b === to)) {
    return false;
  }
  return TIMELINE_TRANSITIONS.some(([a, b]) => a === from && b === to);
}

export function assertTimelineTransition(from: TimelineState, to: TimelineState): void {
  if (timelineTransitionAllowed(from, to)) return;
  throw new TimelineCarrierError(
    "video-illegal-transition",
    `${from} → ${to} 不在 video-timeline.md §3.2 的合法迁移表内`,
  );
}

// ------------------------------------------- §8.2 内容完备判据 / F1 空壳治理

export interface TimelineCompletenessInput {
  project: unknown;
  irBytes?: number;
  sourceBytes?: number;
  evidenceDurationMs?: number;
  evidenceWidth?: number;
  evidenceHeight?: number;
  previewWidth?: number;
  previewHeight?: number;
  mp4Boxes?: readonly string[];
  frameGridColorCounts?: readonly number[];
  hasSpeech?: boolean;
}

export interface TimelineCriterion {
  id: string;
  ok: boolean;
  detail: string;
}

export interface TimelineCompletenessReport {
  ok: boolean;
  code?: "video-hollow";
  criteria: TimelineCriterion[];
  failed: TimelineCriterion[];
}

/** §8.2 全部判据 + §8.1 字节下限。任一不成立即 `video-hollow`(F1)。 */
export function auditTimelineCompleteness(
  input: TimelineCompletenessInput,
): TimelineCompletenessReport {
  const criteria: TimelineCriterion[] = [];
  const add = (id: string, ok: boolean, detail: string) =>
    criteria.push({ id, ok, detail });

  const validation = validateTimelineProjectIr(input.project);
  add(
    "ir-schema",
    validation.ok,
    validation.ok
      ? `通过 ${TIMELINE_PROJECT_SCHEMA_ID} 校验`
      : `${validation.errors.length} 条 schema 违例,首条 ${validation.errors[0].path} ${validation.errors[0].message}`,
  );

  const project = (input.project ?? {}) as Partial<TimelineProjectIr>;
  const tracks = Array.isArray(project.tracks) ? project.tracks : [];
  const totalClips = tracks.reduce(
    (sum, track) => sum + (Array.isArray(track?.clips) ? track.clips.length : 0),
    0,
  );
  const transitions = Array.isArray(project.transitions) ? project.transitions : [];
  const captions = Array.isArray(project.captions) ? project.captions : [];
  const entries = Array.isArray(project.attribution?.entries)
    ? project.attribution!.entries
    : [];

  add("tracks>=2", tracks.length >= TIMELINE_CONSTANTS.C15_minTracks, `tracks=${tracks.length}(C15 ≥ 2)`);
  add(
    "clips>=4",
    totalClips >= TIMELINE_CONSTANTS.C19_minTotalClips,
    `全片片段 ${totalClips}(C19 ≥ 4:单片段「剪辑」等于没剪)`,
  );

  const durationMs = Number(project.output?.durationMs ?? 0);
  add(
    "duration>=6000ms",
    durationMs >= TIMELINE_CONSTANTS.C1_minDurationMs,
    `output.durationMs=${durationMs}(C1 ≥ 6000)`,
  );

  if (input.evidenceDurationMs !== undefined) {
    const drift = Math.abs(durationMs - input.evidenceDurationMs);
    add(
      "duration-drift<=1500ms",
      drift <= TIMELINE_CONSTANTS.C3_durationEvidenceToleranceMs,
      `|${durationMs} − ${input.evidenceDurationMs}| = ${drift} ms(C3 ≤ 1500,比音频的 2500 更严)`,
    );
  }

  const width = Number(project.output?.widthPx ?? 0);
  const height = Number(project.output?.heightPx ?? 0);
  if (input.evidenceWidth !== undefined && input.evidenceHeight !== undefined) {
    add(
      "resolution==evidence",
      width === input.evidenceWidth && height === input.evidenceHeight,
      `IR ${width}×${height} vs evidence ${input.evidenceWidth}×${input.evidenceHeight}`,
    );
  }
  if (input.previewWidth !== undefined && input.previewHeight !== undefined) {
    const verdict = assertPreviewResolution(
      { width, height },
      { width: input.previewWidth, height: input.previewHeight },
    );
    add(
      "preview==source",
      verdict.ok,
      `preview ${input.previewWidth}×${input.previewHeight} vs source ${width}×${height}(§3.3)`,
    );
  }
  if (input.mp4Boxes !== undefined) {
    const boxes = input.mp4Boxes;
    add(
      "mp4 ftyp/moov/mdat",
      ["ftyp", "moov", "mdat"].every((box) => boxes.includes(box)),
      `实测 box [${boxes.join(",")}]`,
    );
  }

  add(
    "transitions>=2",
    transitions.length >= 2,
    `transitions=${transitions.length}(§8.2 ≥ 2:无转场的多片段视频是硬切拼接)`,
  );

  if (input.hasSpeech) {
    add(
      "captions>=3",
      captions.length >= TIMELINE_ACCESSIBILITY.minCaptionsWhenSpeech,
      `有语音,captions=${captions.length}(SC 1.2.2 ≥ 3)`,
    );
  }

  const lufs = Number(project.audioMix?.integratedLufs ?? Number.NaN);
  const lufsLow = TIMELINE_CONSTANTS.C31_targetLufs - 1;
  const lufsHigh = TIMELINE_CONSTANTS.C31_targetLufs + 1;
  add(
    "integratedLufs∈[-15,-13]",
    Number.isFinite(lufs) && lufs >= lufsLow && lufs <= lufsHigh,
    `audioMix.integratedLufs=${lufs}(C31 [${lufsLow}, ${lufsHigh}])`,
  );

  const description = typeof project.description === "string" ? project.description : "";
  add("description>=8", description.length >= 8, `description 长度 ${description.length}`);
  add("attribution>=1", entries.length >= 1, `attribution.entries=${entries.length}`);
  const title = typeof project.title === "string" ? project.title : "";
  add("title>=8", title.length >= 8, `title 长度 ${title.length}`);

  if (input.frameGridColorCounts !== undefined) {
    const counts = input.frameGridColorCounts;
    const expected = TIMELINE_CONSTANTS.C41_frameGrid[0] * TIMELINE_CONSTANTS.C41_frameGrid[1];
    add(
      "frame-grid colors>=24",
      counts.length === expected &&
        counts.every((count) => count >= TIMELINE_CONSTANTS.C42_frameGridMinColors),
      `4×3 网格 ${counts.length} 帧,颜色数 [${counts.join(",")}](C42 ≥ 24)`,
    );
  }

  if (input.irBytes !== undefined) {
    add(
      "ir>=2560B",
      input.irBytes >= TIMELINE_BYTE_FLOORS.irMinBytes &&
        input.irBytes <= TIMELINE_BYTE_FLOORS.irMaxBytes,
      `IR ${input.irBytes} B(§8.1 [${TIMELINE_BYTE_FLOORS.irMinBytes}, ${TIMELINE_BYTE_FLOORS.irMaxBytes}])`,
    );
  }
  if (input.sourceBytes !== undefined) {
    add(
      "mp4>=1048576B",
      input.sourceBytes >= TIMELINE_BYTE_FLOORS.sourceMinBytes &&
        input.sourceBytes <= TIMELINE_BYTE_FLOORS.sourceMaxBytes,
      `mp4 ${input.sourceBytes} B(§8.1 [${TIMELINE_BYTE_FLOORS.sourceMinBytes}, ${TIMELINE_BYTE_FLOORS.sourceMaxBytes}])`,
    );
  }

  const failed = criteria.filter((entry) => !entry.ok);
  return {
    ok: failed.length === 0,
    ...(failed.length ? { code: "video-hollow" as const } : {}),
    criteria,
    failed,
  };
}

// -------------------------------------------------- §3.3 预览分辨率契约

export interface ResolutionPair {
  width: number;
  height: number;
}

export interface PreviewResolutionVerdict {
  ok: boolean;
  code?: "video-preview-resolution-mismatch";
  message?: string;
  source: ResolutionPair;
  preview: ResolutionPair;
}

/**
 * §3.3 / F5:`preview` rendition MUST 与源同分辨率,MUST NOT 交付缩小版预览。
 * 入库校验(`reviewed_material_catalog.py:2707-2708`)读的是同一对等式,
 * 所以「为省字节偷偷降采样冒充预览」在这里就该被拦下,而不是等整包被拒。
 */
export function assertPreviewResolution(
  source: ResolutionPair,
  preview: ResolutionPair,
): PreviewResolutionVerdict {
  const ok =
    Number.isFinite(source.width) &&
    Number.isFinite(source.height) &&
    preview.width === source.width &&
    preview.height === source.height;
  return {
    ok,
    ...(ok
      ? {}
      : {
          code: "video-preview-resolution-mismatch" as const,
          message: `preview ${preview.width}×${preview.height} != source ${source.width}×${source.height};§3.3 禁止交付缩小版预览`,
        }),
    source: { width: source.width, height: source.height },
    preview: { width: preview.width, height: preview.height },
  };
}

/** §3.3:preview rendition 的目标尺寸恒等于源尺寸,不存在「档位」可选。 */
export function previewRenditionSize(source: ResolutionPair): ResolutionPair {
  return { width: Math.round(source.width), height: Math.round(source.height) };
}

/**
 * §3.3 第二句:`thumbnail` 由 poster-frame 派生,MAY 缩小,但最小边
 * MUST ≥ 128 px(`MINIMUM_REVIEWED_COVER_EDGE`,C36)。
 */
export function thumbnailRenditionSize(
  source: ResolutionPair,
  maxEdgePx = 512,
): ResolutionPair {
  const minEdge = TIMELINE_CONSTANTS.C36_minimumReviewedCoverEdgePx;
  const longest = Math.max(source.width, source.height);
  const shortest = Math.max(1, Math.min(source.width, source.height));
  // 先按长边限到 maxEdgePx,再确保短边不掉到 128 以下。
  const byLongEdge = Math.min(1, maxEdgePx / Math.max(1, longest));
  const byShortEdge = minEdge / shortest;
  const scale = Math.max(byLongEdge, Math.min(1, byShortEdge));
  return {
    width: Math.max(minEdge, Math.round(source.width * scale)),
    height: Math.max(minEdge, Math.round(source.height * scale)),
  };
}

export function thumbnailResolutionOk(thumbnail: ResolutionPair): boolean {
  return (
    Math.min(thumbnail.width, thumbnail.height) >=
    TIMELINE_CONSTANTS.C36_minimumReviewedCoverEdgePx
  );
}

/** §2.3 的两个交付档位;分辨率 MUST 与档位一致,不许落在档位之间。 */
export const TIMELINE_DELIVERY_TIERS = Object.freeze({
  standard: Object.freeze({
    widthPx: 1_920,
    heightPx: 1_080,
    videoBitrateKbps: 6_000,
  }),
  light: Object.freeze({
    widthPx: 1_280,
    heightPx: 720,
    videoBitrateKbps: 3_000,
  }),
});

export function deliveryTierFor(
  source: ResolutionPair,
): "standard" | "light" | null {
  const { standard, light } = TIMELINE_DELIVERY_TIERS;
  if (source.width === standard.widthPx && source.height === standard.heightPx) {
    return "standard";
  }
  if (source.width === light.widthPx && source.height === light.heightPx) {
    return "light";
  }
  return null;
}

/** C11 / C12:1080p 默认 6,000 kbps、720p 默认 3,000 kbps。 */
export function defaultVideoBitrateKbps(source: ResolutionPair): number {
  const tier = deliveryTierFor(source);
  if (tier) return TIMELINE_DELIVERY_TIERS[tier].videoBitrateKbps;
  const [min, max] = TIMELINE_CONSTANTS.C10_videoBitrateDomainKbps;
  const scaled = Math.round(
    (TIMELINE_DELIVERY_TIERS.standard.videoBitrateKbps * source.width * source.height) /
      (TIMELINE_DELIVERY_TIERS.standard.widthPx * TIMELINE_DELIVERY_TIERS.standard.heightPx),
  );
  return Math.min(max, Math.max(min, scaled));
}

// -------------------------------------------- TimelineDoc ↔ IR 双向桥接

/**
 * 内部 TrackKind 与 IR kind 的对应。内部的 `image` 轨在 IR 里是 `overlay`
 * —— IR 的四值枚举没有 `image`,直接写过去会被 §3 的 enum 拒。
 */
const DOC_KIND_TO_IR: Record<TrackKind, TimelineIrTrackKind> = {
  video: "video",
  audio: "audio",
  text: "text",
  image: "overlay",
};

const IR_KIND_TO_DOC: Record<TimelineIrTrackKind, TrackKind> = {
  video: "video",
  audio: "audio",
  text: "text",
  overlay: "image",
};

/**
 * 内部 transition type 与 IR transition kind 的对应。IR 的 5 种里
 * `cut` / `wipe` 在编辑器侧没有对应控件,回写时按最近语义取 `dissolve`。
 */
const DOC_TRANSITION_TO_IR: Record<string, TimelineIrTransitionKind> = {
  crossfade: "crossfade",
  black: "fade-to-black",
  fade: "dissolve",
};

const IR_TRANSITION_TO_DOC: Record<TimelineIrTransitionKind, "fade" | "crossfade" | "black" | null> =
  {
    crossfade: "crossfade",
    "fade-to-black": "black",
    dissolve: "fade",
    wipe: "fade",
    cut: null,
  };

/** IR 的 id 有 `^[a-z][a-z0-9_-]{0,47}$` 约束,内部 id 未必满足。 */
function normalizeIrId(raw: string, fallbackPrefix: string, index: number): string {
  const cleaned = String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/^[^a-z]+/, "")
    .slice(0, 48);
  return cleaned || `${fallbackPrefix}-${index}`;
}

export interface TimelineIrProjectMeta {
  title: string;
  description: string;
  attribution: TimelineIrAttributionEntry[];
  captions?: TimelineIrCaption[];
  audioMix?: TimelineIrAudioMix;
  audioBitrateKbps?: number;
  /** 缺省用 docDurationMs(doc);显式给值时以给值为准(ffprobe 回写场景)。 */
  durationMs?: number;
}

/**
 * TimelineDoc → `oceanleo.timeline.v1`。
 * 编辑器只有 TimelineDoc,IR 还需要标题、描述、署名与字幕 —— 这几项正是
 * 271 B 空壳缺的部分,所以由调用方显式补齐,而不是给个空字符串糊过去。
 */
export function timelineDocToProjectIr(
  input: TimelineDoc,
  meta: TimelineIrProjectMeta,
): TimelineProjectIr {
  const doc = normalizeTimelineDoc(input);
  const durationMs = Math.round(meta.durationMs ?? docDurationMs(doc));
  const transitions: TimelineIrTransition[] = [];
  const tracks: TimelineIrTrack[] = doc.tracks.map((track, trackIndex) => ({
    id: normalizeIrId(track.id, "track", trackIndex),
    kind: DOC_KIND_TO_IR[track.kind],
    ...(track.clips.some((clip) => clip.muted) ? {} : {}),
    clips: track.clips.map((clip, clipIndex) => {
      const transition = clip.transition_in;
      if (transition && DOC_TRANSITION_TO_IR[transition.type]) {
        transitions.push({
          atMs: Math.round(clip.start_ms),
          kind: DOC_TRANSITION_TO_IR[transition.type],
          durationMs: Math.round(transition.duration_ms),
        });
      }
      const irClip: TimelineIrClip = {
        id: normalizeIrId(clip.id, "clip", clipIndex),
        startMs: Math.round(clip.start_ms),
        durationMs: Math.round(clip.duration_ms),
      };
      if (clip.source_url) irClip.assetId = clip.source_url.slice(0, 64);
      if (clip.in_ms) irClip.sourceInMs = Math.round(clip.in_ms);
      if (clip.text) irClip.text = clip.text.slice(0, 300);
      if (clip.opacity !== undefined) irClip.opacity = clip.opacity;
      if (clip.scale !== undefined) {
        irClip.scale = Math.min(4, Math.max(0.1, clip.scale));
      }
      if (clip.volume !== undefined) {
        // IR 用 dB,内部用 0..2 线性倍数。0 倍即静音,落到域下界 −60 dB。
        irClip.gainDb =
          clip.volume > 0
            ? Math.round(Math.max(-60, Math.min(12, 20 * Math.log10(clip.volume))) * 100) / 100
            : -60;
      }
      return irClip;
    }),
  }));

  const output: TimelineIrOutput = {
    widthPx: doc.width,
    heightPx: doc.height,
    fps: (TIMELINE_CONSTANTS.C8_fpsSet as readonly number[]).includes(doc.fps)
      ? doc.fps
      : TIMELINE_CONSTANTS.C9_defaultFps,
    durationMs,
    videoBitrateKbps: defaultVideoBitrateKbps({ width: doc.width, height: doc.height }),
    audioBitrateKbps: meta.audioBitrateKbps ?? TIMELINE_CONSTANTS.C14_defaultAudioBitrateKbps,
    codec: "h264",
  };

  return {
    schema: TIMELINE_PROJECT_SCHEMA_ID,
    version: 1,
    title: meta.title,
    description: meta.description,
    output,
    tracks,
    ...(transitions.length ? { transitions } : {}),
    ...(meta.captions?.length ? { captions: meta.captions } : {}),
    ...(meta.audioMix ? { audioMix: meta.audioMix } : {}),
    attribution: { entries: meta.attribution },
  };
}

/** `oceanleo.timeline.v1` → TimelineDoc,供编辑器重新打开落库工程。 */
export function projectIrToTimelineDoc(project: TimelineProjectIr): TimelineDoc {
  const transitionAt = new Map<number, TimelineIrTransition>();
  for (const transition of project.transitions ?? []) {
    transitionAt.set(transition.atMs, transition);
  }
  const tracks: TimelineTrack[] = project.tracks.map((track) => ({
    id: track.id,
    kind: IR_KIND_TO_DOC[track.kind],
    clips: track.clips.map((clip) => {
      const docClip: TimelineClip = {
        id: clip.id,
        start_ms: clip.startMs,
        duration_ms: clip.durationMs,
      };
      if (clip.assetId) docClip.source_url = clip.assetId;
      if (clip.sourceInMs !== undefined) docClip.in_ms = clip.sourceInMs;
      if (clip.text !== undefined) docClip.text = clip.text;
      if (clip.opacity !== undefined) docClip.opacity = clip.opacity;
      if (clip.scale !== undefined) docClip.scale = clip.scale;
      if (clip.gainDb !== undefined) {
        docClip.volume = Math.min(2, Math.max(0, 10 ** (clip.gainDb / 20)));
      }
      const transition = transitionAt.get(clip.startMs);
      const mapped = transition ? IR_TRANSITION_TO_DOC[transition.kind] : null;
      if (transition && mapped) {
        docClip.transition_in = { type: mapped, duration_ms: transition.durationMs };
      }
      return docClip;
    }),
  }));
  return {
    width: project.output.widthPx,
    height: project.output.heightPx,
    fps: project.output.fps,
    tracks,
  };
}

/** §5.1:改任一 clips[].startMs / durationMs,重渲后成片 MUST 变化。 */
export function timelineRenderDigest(doc: TimelineDoc): string {
  const normalized = normalizeTimelineDoc(doc);
  const parts: string[] = [`${normalized.width}x${normalized.height}@${normalized.fps}`];
  for (const track of normalized.tracks) {
    for (const clip of track.clips) {
      parts.push(
        `${track.kind}:${clip.id}:${clip.start_ms}:${clip.duration_ms}:${clipEndMs(clip)}:${clip.source_url ?? clip.text ?? ""}`,
      );
    }
  }
  return parts.join("|");
}
