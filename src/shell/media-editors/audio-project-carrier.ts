// ============================================================================
// @oceanleo/ui — audio-project 载体契约（`oceanleo.audio-project.v1`）
// ----------------------------------------------------------------------------
// 规格:docs/specs/oceanleo-material-and-game-v1/L1-carriers/audio-project.md
// 本模块是该契约在编辑器侧的单一事实源:§1.1 四元组、§1.3 许可锁、§2 色板与
// 版面、§3 JSON Schema、§3.2 状态机、§4 常量表、§8 字节下限与完备判据。
// 取值一律逐字照规格,MUST NOT 为了「凑一下」改数。
// ============================================================================

/** §1.1 project_schema。落库四元组的其余项见 AUDIO_CARRIER_QUAD。 */
export const AUDIO_PROJECT_SCHEMA_ID = "oceanleo.audio-project.v1";

/**
 * 编辑器在 2026-07-29 之前把工程写成 `oceanleo.audio.v1`,与注册面
 * (`workbench-capability-registry.ts` / `artifact-contract.ts`)和后端
 * `_source_format_matches[AUDIO]` 声明的 `oceanleo.audio-project.v1` 不一致。
 * 新写一律用 §1.1 的值;读旧工程仍认这个别名,否则存量草稿打不开。
 */
export const AUDIO_PROJECT_SCHEMA_LEGACY_ID = "oceanleo.audio.v1";

export function isAudioProjectSchemaId(value: unknown): boolean {
  return (
    value === AUDIO_PROJECT_SCHEMA_ID || value === AUDIO_PROJECT_SCHEMA_LEGACY_ID
  );
}

/** §1.1 四元组(Normative,逐字)。 */
export const AUDIO_CARRIER_QUAD = Object.freeze({
  featureId: "audio_editing",
  artifactType: "audio",
  sourceFormat: "mp3",
  sourceMediaType: "audio/mpeg",
  editorCapability: "audio-editor",
  adapter: "audio",
  projectSchema: AUDIO_PROJECT_SCHEMA_ID,
  editability: "bounded",
  sourceIntegrity: "content_addressed",
  openMode: "native-file",
  previewPurposes: ["full", "preview"] as const,
  dependencyClosure: "not_required",
});

// ---------------------------------------------------------------- §2 视觉靶

/**
 * §2.1 波形色板。`contrastFloor` 是该 token 对 `wave.bg` 的 WCAG 2.2 义务,
 * `measured` 是规格表内写死的实测值 —— 两者都进机检,取值 MUST NOT 私自调。
 */
export const AUDIO_WAVE_PALETTE = Object.freeze({
  "wave.bg": Object.freeze({ value: "#14171B", contrastFloor: 0, measured: 0 }),
  "wave.body": Object.freeze({
    value: "#1F6FEB",
    contrastFloor: 3.0,
    measured: 3.88,
  }),
  "wave.peak": Object.freeze({
    value: "#7CB7FF",
    contrastFloor: 4.5,
    measured: 8.62,
  }),
  "wave.playhead": Object.freeze({
    value: "#FFD43B",
    contrastFloor: 4.5,
    measured: 12.61,
  }),
  "wave.selection": Object.freeze({
    value: "#2E8B6F",
    contrastFloor: 3.0,
    measured: 4.31,
  }),
  "wave.grid": Object.freeze({
    value: "#5D6976",
    contrastFloor: 3.0,
    measured: 3.21,
  }),
});

/** §2.2 版面(px)。 */
export const AUDIO_LAYOUT = Object.freeze({
  waveViewHeightPx: 160,
  trackRowHeightPx: 72,
  timeAxisHeightPx: 32,
  playheadWidthPx: 2,
  embeddedArtworkEdgePx: 1400,
  thumbnailEdgePx: 512,
  minimumHitAreaPx: 24,
});

/** §2.3 无障碍:四个操作各自的键盘通路标识(WCAG 2.2 SC 1.4.2 / 2.1.1)。 */
export const AUDIO_KEYBOARD_OPERATIONS = Object.freeze([
  "play",
  "pause",
  "seek",
  "volume",
] as const);

// ---------------------------------------------------------------- §4 常量表

/** §4 C1–C39,逐条照抄。 */
export const AUDIO_CONSTANTS = Object.freeze({
  C1_minDurationMs: 8_000,
  C2_minTrackDurationMs: 500,
  C3_maxDurationMs: 3_600_000,
  C4_durationEvidenceToleranceMs: 2_500,
  C5_sampleRatesHz: Object.freeze([22_050, 24_000, 32_000, 44_100, 48_000]),
  C6_channelCounts: Object.freeze([1, 2]),
  C7_bitratesKbps: Object.freeze([96, 128, 160, 192, 256, 320]),
  C8_defaultBitrateKbps: 192,
  C9_sfxBitrateKbps: 128,
  C10_targetLufs: -14,
  C11_lufsToleranceLu: 1.0,
  C12_truePeakCeilingDbtp: -1.0,
  C13_lufsDomain: Object.freeze([-30, -6]),
  C14_minTracks: 2,
  C15_maxTracks: 32,
  C16_trackGainDomainDb: Object.freeze([-60, 12]),
  C17_panningDomain: Object.freeze([-1, 1]),
  C18_fadeDomainMs: Object.freeze([0, 10_000]),
  C19_defaultFadeOutMs: 800,
  C20_maxMarkers: 200,
  C21_minLoopPointPairs: 1,
  C22_bpmDomain: Object.freeze([40, 240]),
  C23_artworkEdgeDomainPx: Object.freeze([512, 3_000]),
  C24_artworkNominalEdgePx: 1_400,
  C25_thumbnailEdgePx: 512,
  C26_minimumReviewedCoverEdgePx: 128,
  C27_waveViewHeightPx: 160,
  C28_trackRowHeightPx: 72,
  C29_minimumHitAreaPx: 24,
  C30_autoplayCeilingMs: 3_000,
  C31_irMinBytes: 2_048,
  C32_mp3MinBytes: 245_760,
  C33_mp3MaxBytes: 104_857_600,
  C34_encodeWallClockCeilingMs: 20_000,
  C35_waveframeMinColors: 8,
  C36_familyJaccardCeiling: 0.85,
  C37_twinThreshold: 0.99,
  C38_availableCc0Audio: 77,
  C39_blockedShareAlikeAudio: 193,
});

/** §8.1 字节下限。IR 上限取 §7 A4 的 1,048,576 B。 */
export const AUDIO_BYTE_FLOORS = Object.freeze({
  irMinBytes: 2_048,
  irMaxBytes: 1_048_576,
  sourceMinBytes: 245_760,
  sourceMaxBytes: 104_857_600,
  embeddedArtworkMinBytes: 20_480,
});

/**
 * §8.1 末段:catalog pack 的 qualityPolicy 必须被设成这两个值。
 * 键归 W2(`reviewed_material_catalog.py`),本模块只做编辑器侧的对账凭据。
 */
export const AUDIO_QUALITY_POLICY_TARGET = Object.freeze({
  "minimumSourceBytesByEditorClass.audio_editing": 245_760,
  minimumAudioDurationMs: 8_000,
});

// ------------------------------------------------------------- §1.3 许可锁

/** §3 `attribution.entries[].licenseCode` 枚举 —— 不含 CC-BY-SA,是 §1.3 的 schema 落实。 */
export const AUDIO_LICENSE_CODES = Object.freeze([
  "CC0",
  "CC-BY",
  "OCEANLEO-AIGEN",
] as const);

export type AudioLicenseCode = (typeof AUDIO_LICENSE_CODES)[number];

/**
 * 许可义务表。SA 义务之所以要显式建模而不是「删掉就完了」:下游素材族
 * 靠产物元数据判断自己能不能再组合,元数据里没有义务字段就等于断链。
 */
export const AUDIO_LICENSE_OBLIGATIONS: Readonly<
  Record<string, readonly string[]>
> = Object.freeze({
  CC0: Object.freeze([]),
  "CC-BY": Object.freeze(["attribution"]),
  "OCEANLEO-AIGEN": Object.freeze(["attribution"]),
  "CC-BY-SA": Object.freeze(["attribution", "share-alike"]),
});

/** 把 `CC BY-SA 4.0` / `cc-by-sa` / `CC_BY_SA` 都归一成可比较的 token 串。 */
function licenseTokens(code: string): string[] {
  return String(code)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
}

/** §1.3:带 share-alike 义务的许可(jamendo CC-BY-SA 193 份 + openmoji 谱系)。 */
export function licenseCarriesShareAlike(code: unknown): boolean {
  if (typeof code !== "string" || !code.trim()) return false;
  const tokens = licenseTokens(code);
  return tokens.includes("SA") || tokens.includes("SHAREALIKE");
}

export function licenseObligations(code: unknown): readonly string[] {
  if (typeof code !== "string" || !code.trim()) return [];
  const exact = AUDIO_LICENSE_OBLIGATIONS[code];
  if (exact) return exact;
  const obligations: string[] = [];
  const tokens = licenseTokens(code);
  if (tokens.includes("BY") || tokens.includes("ATTRIBUTION")) {
    obligations.push("attribution");
  }
  if (licenseCarriesShareAlike(code)) obligations.push("share-alike");
  return Object.freeze(obligations);
}

export interface AudioLicenseViolation {
  code: "audio-license-share-alike" | "audio-license-unknown-code";
  path: string;
  licenseCode: string;
  obligations: readonly string[];
}

export interface AudioLicenseLockReport {
  ok: boolean;
  shareAlike: boolean;
  licenses: string[];
  obligations: string[];
  violations: AudioLicenseViolation[];
}

/**
 * §1.3 许可锁。CC0 首发、CC-BY 需署名随产物、CC-BY-SA MUST NOT 进 v1 组合产物。
 * `tracks[].licenseCode` 与 `attribution.entries[].licenseCode` 两处都查 ——
 * 只查署名表的话,一条挂着 SA 素材而署名表写 CC0 的轨会整条溜过去。
 */
export function auditAudioLicenseLock(project: unknown): AudioLicenseLockReport {
  const violations: AudioLicenseViolation[] = [];
  const licenses = new Set<string>();
  const obligations = new Set<string>();
  const record = (path: string, raw: unknown) => {
    if (typeof raw !== "string" || !raw.trim()) return;
    const code = raw.trim();
    licenses.add(code);
    const duties = licenseObligations(code);
    for (const duty of duties) obligations.add(duty);
    if (licenseCarriesShareAlike(code)) {
      violations.push({
        code: "audio-license-share-alike",
        path,
        licenseCode: code,
        obligations: duties,
      });
    }
  };
  const source = (project ?? {}) as Partial<AudioProjectIr>;
  const tracks = Array.isArray(source.tracks) ? source.tracks : [];
  tracks.forEach((track, index) => {
    record(`tracks[${index}].licenseCode`, (track as AudioTrack)?.licenseCode);
  });
  const entries = Array.isArray(source.attribution?.entries)
    ? source.attribution!.entries
    : [];
  entries.forEach((entry, index) => {
    const code = (entry as AudioAttributionEntry)?.licenseCode;
    record(`attribution.entries[${index}].licenseCode`, code);
    if (
      typeof code === "string" &&
      code.trim() &&
      !AUDIO_LICENSE_CODES.includes(code as AudioLicenseCode) &&
      !licenseCarriesShareAlike(code)
    ) {
      violations.push({
        code: "audio-license-unknown-code",
        path: `attribution.entries[${index}].licenseCode`,
        licenseCode: code,
        obligations: licenseObligations(code),
      });
    }
  });
  return {
    ok: violations.length === 0,
    shareAlike: violations.some((v) => v.code === "audio-license-share-alike"),
    licenses: [...licenses].sort(),
    obligations: [...obligations].sort(),
    violations,
  };
}

export interface AudioLicenseMetadata {
  license_lock: string;
  share_alike: boolean;
  obligations: string[];
  licenses: string[];
  attribution: {
    text: string;
    licenseCode: string;
    licenseUrl: string;
    trackId?: string;
  }[];
  attribution_text: string;
}

/**
 * §7 A9「导出物必须带署名」的元数据面。产物落库时把这个块塞进 revision meta,
 * 下游素材族据此判断自己继承了哪些义务 —— 义务随产物走靠的就是它。
 */
export function audioLicenseMetadata(
  project: Pick<AudioProjectIr, "attribution" | "tracks">,
): AudioLicenseMetadata {
  const report = auditAudioLicenseLock(project);
  const attribution = (project.attribution?.entries ?? []).map((entry) => ({
    text: entry.text,
    licenseCode: entry.licenseCode,
    licenseUrl: entry.licenseUrl,
    ...(entry.trackId ? { trackId: entry.trackId } : {}),
  }));
  return {
    license_lock: `${AUDIO_PROJECT_SCHEMA_ID}#1.3`,
    share_alike: report.shareAlike,
    obligations: report.obligations,
    licenses: report.licenses,
    attribution,
    attribution_text: attribution
      .map((entry) => `${entry.text} (${entry.licenseCode}) ${entry.licenseUrl}`)
      .join("; "),
  };
}

// --------------------------------------------------------------- §3 Schema

export type AudioTrackRole =
  | "drums"
  | "bass"
  | "harmony"
  | "lead"
  | "pad"
  | "fx"
  | "vocal"
  | "ambience"
  | "foley";

export type AudioMarkerKind =
  | "section"
  | "loop-start"
  | "loop-end"
  | "cue"
  | "beat";

export interface AudioMaster {
  durationMs: number;
  sampleRateHz: number;
  channels: number;
  bitrateKbps: number;
  bpm?: number;
  keySignature?: string;
}

export interface AudioTrack {
  id: string;
  name: string;
  role: AudioTrackRole;
  gainDb: number;
  panning?: number;
  startMs: number;
  durationMs: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  muted?: boolean;
  assetId?: string;
  licenseCode?: string;
}

export interface AudioMarker {
  atMs: number;
  label: string;
  kind: AudioMarkerKind;
}

export interface AudioLoudness {
  integratedLufs: number;
  truePeakDbtp: number;
  loudnessRangeLu?: number;
}

export interface AudioArtwork {
  embeddedInId3: true;
  sha256: string;
  widthPx: number;
  heightPx: number;
}

export interface AudioAttributionEntry {
  text: string;
  licenseCode: AudioLicenseCode;
  licenseUrl: string;
  trackId?: string;
}

export interface AudioProjectIr {
  schema: typeof AUDIO_PROJECT_SCHEMA_ID;
  version: 1;
  title: string;
  description: string;
  transcript?: string;
  master: AudioMaster;
  tracks: AudioTrack[];
  markers?: AudioMarker[];
  loudness: AudioLoudness;
  artwork: AudioArtwork;
  attribution: { entries: AudioAttributionEntry[] };
}

export interface AudioValidationError {
  code: string;
  path: string;
  message: string;
}

type Issues = AudioValidationError[];

const AUDIO_TRACK_ROLES: readonly AudioTrackRole[] = [
  "drums",
  "bass",
  "harmony",
  "lead",
  "pad",
  "fx",
  "vocal",
  "ambience",
  "foley",
];

const AUDIO_MARKER_KINDS: readonly AudioMarkerKind[] = [
  "section",
  "loop-start",
  "loop-end",
  "cue",
  "beat",
];

const TRACK_ID_PATTERN = /^[a-z][a-z0-9_-]{0,47}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pushIssue(
  issues: Issues,
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

/** §3 `additionalProperties: false` 的逐层落实。 */
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
        `${key} 不在 ${AUDIO_PROJECT_SCHEMA_ID} 的字段表内`,
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
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
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

function validateMaster(issues: Issues, value: unknown): void {
  if (!isPlainObject(value)) {
    pushIssue(issues, "type", "master", "master 必须是对象");
    return;
  }
  rejectExtraKeys(issues, "master", value, [
    "durationMs",
    "sampleRateHz",
    "channels",
    "bitrateKbps",
    "bpm",
    "keySignature",
  ]);
  requireIntegerInRange(
    issues,
    "master.durationMs",
    value.durationMs,
    AUDIO_CONSTANTS.C1_minDurationMs,
    AUDIO_CONSTANTS.C3_maxDurationMs,
  );
  requireEnum(
    issues,
    "master.sampleRateHz",
    value.sampleRateHz,
    AUDIO_CONSTANTS.C5_sampleRatesHz,
  );
  requireEnum(
    issues,
    "master.channels",
    value.channels,
    AUDIO_CONSTANTS.C6_channelCounts,
  );
  requireEnum(
    issues,
    "master.bitrateKbps",
    value.bitrateKbps,
    AUDIO_CONSTANTS.C7_bitratesKbps,
  );
  if (value.bpm !== undefined) {
    requireNumberInRange(issues, "master.bpm", value.bpm, 40, 240);
  }
  if (value.keySignature !== undefined) {
    requireStringLength(issues, "master.keySignature", value.keySignature, 0, 8);
  }
}

function validateTracks(issues: Issues, value: unknown): void {
  if (!Array.isArray(value)) {
    pushIssue(issues, "type", "tracks", "tracks 必须是数组");
    return;
  }
  if (value.length < AUDIO_CONSTANTS.C14_minTracks) {
    pushIssue(
      issues,
      "min-items",
      "tracks",
      `轨数 ${value.length} < ${AUDIO_CONSTANTS.C14_minTracks}(C14:单轨不构成分轨工程)`,
    );
  }
  if (value.length > AUDIO_CONSTANTS.C15_maxTracks) {
    pushIssue(
      issues,
      "max-items",
      "tracks",
      `轨数 ${value.length} > ${AUDIO_CONSTANTS.C15_maxTracks}(C15)`,
    );
  }
  value.forEach((track, index) => {
    const path = `tracks[${index}]`;
    if (!isPlainObject(track)) {
      pushIssue(issues, "type", path, "轨必须是对象");
      return;
    }
    rejectExtraKeys(issues, path, track, [
      "id",
      "name",
      "role",
      "gainDb",
      "panning",
      "startMs",
      "durationMs",
      "fadeInMs",
      "fadeOutMs",
      "muted",
      "assetId",
      "licenseCode",
    ]);
    if (typeof track.id !== "string" || !TRACK_ID_PATTERN.test(track.id)) {
      pushIssue(issues, "pattern", `${path}.id`, "id 必须匹配 ^[a-z][a-z0-9_-]{0,47}$");
    }
    requireStringLength(issues, `${path}.name`, track.name, 1, 80);
    requireEnum(issues, `${path}.role`, track.role, AUDIO_TRACK_ROLES);
    requireNumberInRange(issues, `${path}.gainDb`, track.gainDb, -60, 12);
    requireIntegerInRange(
      issues,
      `${path}.startMs`,
      track.startMs,
      0,
      AUDIO_CONSTANTS.C3_maxDurationMs,
    );
    requireIntegerInRange(
      issues,
      `${path}.durationMs`,
      track.durationMs,
      AUDIO_CONSTANTS.C2_minTrackDurationMs,
      AUDIO_CONSTANTS.C3_maxDurationMs,
    );
    if (track.panning !== undefined) {
      requireNumberInRange(issues, `${path}.panning`, track.panning, -1, 1);
    }
    if (track.fadeInMs !== undefined) {
      requireIntegerInRange(issues, `${path}.fadeInMs`, track.fadeInMs, 0, 10_000);
    }
    if (track.fadeOutMs !== undefined) {
      requireIntegerInRange(issues, `${path}.fadeOutMs`, track.fadeOutMs, 0, 10_000);
    }
    if (track.muted !== undefined && typeof track.muted !== "boolean") {
      pushIssue(issues, "type", `${path}.muted`, "muted 必须是布尔值");
    }
    if (track.assetId !== undefined) {
      requireStringLength(issues, `${path}.assetId`, track.assetId, 0, 64);
    }
    if (track.licenseCode !== undefined) {
      requireStringLength(issues, `${path}.licenseCode`, track.licenseCode, 0, 60);
    }
  });
}

function validateMarkers(issues: Issues, value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    pushIssue(issues, "type", "markers", "markers 必须是数组");
    return;
  }
  if (value.length > AUDIO_CONSTANTS.C20_maxMarkers) {
    pushIssue(issues, "max-items", "markers", `标记数 > ${AUDIO_CONSTANTS.C20_maxMarkers}(C20)`);
  }
  value.forEach((marker, index) => {
    const path = `markers[${index}]`;
    if (!isPlainObject(marker)) {
      pushIssue(issues, "type", path, "标记必须是对象");
      return;
    }
    rejectExtraKeys(issues, path, marker, ["atMs", "label", "kind"]);
    requireIntegerInRange(
      issues,
      `${path}.atMs`,
      marker.atMs,
      0,
      AUDIO_CONSTANTS.C3_maxDurationMs,
    );
    requireStringLength(issues, `${path}.label`, marker.label, 1, 80);
    requireEnum(issues, `${path}.kind`, marker.kind, AUDIO_MARKER_KINDS);
  });
}

function validateLoudness(issues: Issues, value: unknown): void {
  if (!isPlainObject(value)) {
    pushIssue(issues, "type", "loudness", "loudness 必须是对象");
    return;
  }
  rejectExtraKeys(issues, "loudness", value, [
    "integratedLufs",
    "truePeakDbtp",
    "loudnessRangeLu",
  ]);
  requireNumberInRange(
    issues,
    "loudness.integratedLufs",
    value.integratedLufs,
    AUDIO_CONSTANTS.C13_lufsDomain[0],
    AUDIO_CONSTANTS.C13_lufsDomain[1],
  );
  requireNumberInRange(issues, "loudness.truePeakDbtp", value.truePeakDbtp, -20, 0);
  if (value.loudnessRangeLu !== undefined) {
    requireNumberInRange(issues, "loudness.loudnessRangeLu", value.loudnessRangeLu, 0, 30);
  }
}

function validateArtwork(issues: Issues, value: unknown): void {
  if (!isPlainObject(value)) {
    pushIssue(issues, "type", "artwork", "artwork 必须是对象");
    return;
  }
  rejectExtraKeys(issues, "artwork", value, [
    "embeddedInId3",
    "sha256",
    "widthPx",
    "heightPx",
  ]);
  if (value.embeddedInId3 !== true) {
    pushIssue(
      issues,
      "const",
      "artwork.embeddedInId3",
      "必须为 true —— 封面 MUST 内嵌进 ID3(F3)",
    );
  }
  if (typeof value.sha256 !== "string" || !SHA256_PATTERN.test(value.sha256)) {
    pushIssue(issues, "pattern", "artwork.sha256", "必须是 64 位小写十六进制摘要");
  }
  requireIntegerInRange(
    issues,
    "artwork.widthPx",
    value.widthPx,
    AUDIO_CONSTANTS.C23_artworkEdgeDomainPx[0],
    AUDIO_CONSTANTS.C23_artworkEdgeDomainPx[1],
  );
  requireIntegerInRange(
    issues,
    "artwork.heightPx",
    value.heightPx,
    AUDIO_CONSTANTS.C23_artworkEdgeDomainPx[0],
    AUDIO_CONSTANTS.C23_artworkEdgeDomainPx[1],
  );
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
    rejectExtraKeys(issues, path, entry, [
      "text",
      "licenseCode",
      "licenseUrl",
      "trackId",
    ]);
    requireStringLength(issues, `${path}.text`, entry.text, 2, 200);
    requireEnum(issues, `${path}.licenseCode`, entry.licenseCode, AUDIO_LICENSE_CODES);
    if (
      typeof entry.licenseUrl !== "string" ||
      !entry.licenseUrl.startsWith("https://") ||
      entry.licenseUrl.length < 9
    ) {
      pushIssue(issues, "pattern", `${path}.licenseUrl`, "必须是 https:// 开头的 URI");
    }
    if (entry.trackId !== undefined) {
      requireStringLength(issues, `${path}.trackId`, entry.trackId, 0, 48);
    }
  });
}

export type AudioValidationResult =
  | { ok: true; project: AudioProjectIr }
  | { ok: false; errors: AudioValidationError[] };

/** §3 完整 Schema 校验(Draft 2020-12 的手写落实,含 additionalProperties)。 */
export function validateAudioProjectIr(value: unknown): AudioValidationResult {
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
    "transcript",
    "master",
    "tracks",
    "markers",
    "loudness",
    "artwork",
    "attribution",
  ]);
  for (const key of [
    "schema",
    "version",
    "title",
    "description",
    "master",
    "tracks",
    "loudness",
    "artwork",
    "attribution",
  ]) {
    if (value[key] === undefined) {
      pushIssue(issues, "required", key, `${key} 是必填字段`);
    }
  }
  if (value.schema !== AUDIO_PROJECT_SCHEMA_ID) {
    pushIssue(issues, "const", "schema", `schema 必须是 ${AUDIO_PROJECT_SCHEMA_ID}`);
  }
  if (value.version !== 1) {
    pushIssue(issues, "const", "version", "version 必须是整数 1");
  }
  requireStringLength(issues, "title", value.title, 8, 300);
  requireStringLength(issues, "description", value.description, 8, 1_000);
  if (value.transcript !== undefined) {
    requireStringLength(issues, "transcript", value.transcript, 0, 40_000);
  }
  if (value.master !== undefined) validateMaster(issues, value.master);
  if (value.tracks !== undefined) validateTracks(issues, value.tracks);
  validateMarkers(issues, value.markers);
  if (value.loudness !== undefined) validateLoudness(issues, value.loudness);
  if (value.artwork !== undefined) validateArtwork(issues, value.artwork);
  if (value.attribution !== undefined) validateAttribution(issues, value.attribution);

  const licenseLock = auditAudioLicenseLock(value);
  for (const violation of licenseLock.violations) {
    pushIssue(
      issues,
      violation.code,
      violation.path,
      `${violation.licenseCode} 带 ${violation.obligations.join(" + ")} 义务,§1.3 禁止进入 v1 组合产物`,
    );
  }

  if (issues.length) return { ok: false, errors: issues };
  return { ok: true, project: value as unknown as AudioProjectIr };
}

// --------------------------------------------------- §1.2 形态一:JSON IR

const IR_KEY_ORDER: readonly (keyof AudioProjectIr)[] = [
  "schema",
  "version",
  "title",
  "description",
  "transcript",
  "master",
  "tracks",
  "markers",
  "loudness",
  "artwork",
  "attribution",
];

const MASTER_KEY_ORDER = [
  "durationMs",
  "sampleRateHz",
  "channels",
  "bitrateKbps",
  "bpm",
  "keySignature",
] as const;

const TRACK_KEY_ORDER = [
  "id",
  "name",
  "role",
  "gainDb",
  "panning",
  "startMs",
  "durationMs",
  "fadeInMs",
  "fadeOutMs",
  "muted",
  "assetId",
  "licenseCode",
] as const;

const MARKER_KEY_ORDER = ["atMs", "label", "kind"] as const;
const LOUDNESS_KEY_ORDER = [
  "integratedLufs",
  "truePeakDbtp",
  "loudnessRangeLu",
] as const;
const ARTWORK_KEY_ORDER = [
  "embeddedInId3",
  "sha256",
  "widthPx",
  "heightPx",
] as const;
const ATTRIBUTION_ENTRY_KEY_ORDER = [
  "text",
  "licenseCode",
  "licenseUrl",
  "trackId",
] as const;

function orderedPick<T extends Record<string, unknown>>(
  source: T,
  order: readonly string[],
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const key of order) {
    if (source[key] !== undefined) output[key] = source[key];
  }
  return output;
}

/**
 * 确定性序列化:同一份工程无论字段插入顺序如何,序列化结果逐字节相同。
 * roundtrip 判据(§7 A4 与 §9 C-2)靠这个成立。
 */
export function serializeAudioProjectIr(project: AudioProjectIr): string {
  const canonical: Record<string, unknown> = {};
  for (const key of IR_KEY_ORDER) {
    const value = project[key];
    if (value === undefined) continue;
    if (key === "master") {
      canonical[key] = orderedPick(
        value as unknown as Record<string, unknown>,
        MASTER_KEY_ORDER,
      );
    } else if (key === "tracks") {
      canonical[key] = (value as AudioTrack[]).map((track) =>
        orderedPick(track as unknown as Record<string, unknown>, TRACK_KEY_ORDER),
      );
    } else if (key === "markers") {
      canonical[key] = (value as AudioMarker[]).map((marker) =>
        orderedPick(marker as unknown as Record<string, unknown>, MARKER_KEY_ORDER),
      );
    } else if (key === "loudness") {
      canonical[key] = orderedPick(
        value as unknown as Record<string, unknown>,
        LOUDNESS_KEY_ORDER,
      );
    } else if (key === "artwork") {
      canonical[key] = orderedPick(
        value as unknown as Record<string, unknown>,
        ARTWORK_KEY_ORDER,
      );
    } else if (key === "attribution") {
      canonical[key] = {
        entries: (value as AudioProjectIr["attribution"]).entries.map((entry) =>
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

export class AudioCarrierError extends Error {
  readonly code: string;
  readonly errors: AudioValidationError[];

  constructor(code: string, message: string, errors: AudioValidationError[] = []) {
    super(message);
    this.name = "AudioCarrierError";
    this.code = code;
    this.errors = errors;
  }
}

function decodeUtf8(input: string | Uint8Array): string {
  if (typeof input === "string") return input;
  return new TextDecoder("utf-8", { fatal: false }).decode(input);
}

/** §1.2 形态一的载入口。失败抛带 code 的 AudioCarrierError(§6)。 */
export function parseAudioProjectSource(
  input: string | Uint8Array,
): AudioProjectIr {
  const text = decodeUtf8(input);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (caught) {
    throw new AudioCarrierError(
      "audio-ir-unparsable",
      `工程 JSON 无法解析:${caught instanceof Error ? caught.message : caught}`,
    );
  }
  const result = validateAudioProjectIr(parsed);
  if (!result.ok) {
    throw new AudioCarrierError(
      "audio-ir-invalid",
      `工程不符合 ${AUDIO_PROJECT_SCHEMA_ID}:${result.errors[0]?.path || "?"} ${result.errors[0]?.message || ""}`,
      result.errors,
    );
  }
  return result.project;
}

// ------------------------------------------------------ §1.2 形态二:mp3

const MPEG_BITRATES_V1_L3 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, -1,
];
const MPEG_BITRATES_V2_L3 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1,
];
const MPEG_SAMPLE_RATES: Record<number, number[]> = {
  3: [44_100, 48_000, 32_000, -1], // MPEG-1
  2: [22_050, 24_000, 16_000, -1], // MPEG-2
  0: [11_025, 12_000, 8_000, -1], // MPEG-2.5
};

export interface Mp3Inspection {
  ok: boolean;
  code?: string;
  message?: string;
  byteSize: number;
  frameCount: number;
  durationMs: number;
  sampleRateHz: number;
  channels: number;
  bitrateKbps: number;
  truncatedFrame: boolean;
  id3v2Bytes: number;
  embeddedArtworkBytes: number;
  hasEmbeddedArtwork: boolean;
}

function readSyncSafe(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

/**
 * §5.4 可移植性 + §8.2:逐帧走 MPEG-1/2 Layer III 帧头,用与
 * `reviewed_material_catalog.py:942-946` 同一条帧长公式反算时长。
 * 截断帧在这里就能被指出来,不必等到入库才抛「truncated MP3 frame」。
 * 同时扫 ID3v2 的 APIC 帧 —— §8.2 要求封面必须内嵌(F3)。
 */
export function inspectMp3Source(input: Uint8Array): Mp3Inspection {
  const bytes = input;
  const result: Mp3Inspection = {
    ok: false,
    byteSize: bytes.byteLength,
    frameCount: 0,
    durationMs: 0,
    sampleRateHz: 0,
    channels: 0,
    bitrateKbps: 0,
    truncatedFrame: false,
    id3v2Bytes: 0,
    embeddedArtworkBytes: 0,
    hasEmbeddedArtwork: false,
  };
  let offset = 0;
  if (
    bytes.length > 10 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
  ) {
    const tagSize = readSyncSafe(bytes, 6);
    result.id3v2Bytes = 10 + tagSize;
    // APIC 帧扫描:ID3v2.3/2.4 的帧头是 4 字节 id + 4 字节 size。
    let cursor = 10;
    const tagEnd = Math.min(bytes.length, 10 + tagSize);
    while (cursor + 10 <= tagEnd) {
      const id = String.fromCharCode(
        bytes[cursor],
        bytes[cursor + 1],
        bytes[cursor + 2],
        bytes[cursor + 3],
      );
      if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const size =
        bytes[cursor + 4] * 0x1000000 +
        bytes[cursor + 5] * 0x10000 +
        bytes[cursor + 6] * 0x100 +
        bytes[cursor + 7];
      if (size <= 0 || cursor + 10 + size > tagEnd) break;
      if (id === "APIC") {
        result.hasEmbeddedArtwork = true;
        result.embeddedArtworkBytes = size;
      }
      cursor += 10 + size;
    }
    offset = result.id3v2Bytes;
  }

  let totalDurationMs = 0;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }
    const versionBits = (bytes[offset + 1] >> 3) & 0x03;
    const layerBits = (bytes[offset + 1] >> 1) & 0x03;
    if (versionBits === 1 || layerBits !== 0x01) {
      offset += 1;
      continue;
    }
    const bitrateIndex = (bytes[offset + 2] >> 4) & 0x0f;
    const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x03;
    const padding = (bytes[offset + 2] >> 1) & 0x01;
    const channelMode = (bytes[offset + 3] >> 6) & 0x03;
    const isVersion1 = versionBits === 3;
    const bitrateKbps = (isVersion1 ? MPEG_BITRATES_V1_L3 : MPEG_BITRATES_V2_L3)[
      bitrateIndex
    ];
    const sampleRateHz = (MPEG_SAMPLE_RATES[versionBits] ?? [])[sampleRateIndex];
    if (!bitrateKbps || bitrateKbps < 0 || !sampleRateHz || sampleRateHz < 0) {
      offset += 1;
      continue;
    }
    // reviewed_material_catalog.py:942 的同一条式子。
    const frameLength = Math.floor(
      ((isVersion1 ? 144 : 72) * bitrateKbps * 1000) / sampleRateHz + padding,
    );
    if (frameLength <= 0) {
      offset += 1;
      continue;
    }
    if (offset + frameLength > bytes.length) {
      result.truncatedFrame = true;
      break;
    }
    const samplesPerFrame = isVersion1 ? 1_152 : 576;
    totalDurationMs += (samplesPerFrame * 1000) / sampleRateHz;
    result.frameCount += 1;
    if (result.frameCount === 1) {
      result.sampleRateHz = sampleRateHz;
      result.bitrateKbps = bitrateKbps;
      result.channels = channelMode === 3 ? 1 : 2;
    }
    offset += frameLength;
  }
  result.durationMs = Math.round(totalDurationMs);

  if (result.truncatedFrame) {
    result.code = "audio-mp3-truncated-frame";
    result.message = "mp3 末尾存在截断帧,入库会抛 has a truncated MP3 frame";
    return result;
  }
  if (result.frameCount === 0) {
    result.code = "audio-mp3-no-frames";
    result.message = "字节里没有可解的 MPEG-1/2 Layer III 帧";
    return result;
  }
  if (result.byteSize < AUDIO_BYTE_FLOORS.sourceMinBytes) {
    result.code = "audio-hollow";
    result.message = `mp3 源 ${result.byteSize} B < ${AUDIO_BYTE_FLOORS.sourceMinBytes} B(§8.1)`;
    return result;
  }
  if (result.byteSize > AUDIO_BYTE_FLOORS.sourceMaxBytes) {
    result.code = "audio-source-too-large";
    result.message = `mp3 源 ${result.byteSize} B > ${AUDIO_BYTE_FLOORS.sourceMaxBytes} B(C33)`;
    return result;
  }
  result.ok = true;
  return result;
}

// ------------------------------------------------------------ §3.2 状态机

export const AUDIO_STATES = Object.freeze([
  "empty",
  "ir-validated",
  "tracks-resolved",
  "mixed",
  "encoded",
  "ready",
  "invalid",
  "degraded",
] as const);

export type AudioState = (typeof AUDIO_STATES)[number];

/** §3.2 合法迁移表。 */
export const AUDIO_TRANSITIONS: readonly (readonly [AudioState, AudioState])[] =
  Object.freeze([
    ["empty", "ir-validated"],
    ["empty", "invalid"],
    ["ir-validated", "tracks-resolved"],
    ["ir-validated", "invalid"],
    ["tracks-resolved", "degraded"],
    ["tracks-resolved", "mixed"],
    ["mixed", "encoded"],
    ["encoded", "ready"],
    ["encoded", "invalid"],
  ] as const);

/** §3.2 的 5 条非法迁移。MUST NOT 发生;`empty → ready` 是 231 B 空壳的产生路径。 */
export const AUDIO_ILLEGAL_TRANSITIONS: readonly (readonly [
  AudioState,
  AudioState,
])[] = Object.freeze([
  ["ir-validated", "encoded"],
  ["degraded", "ready"],
  ["mixed", "ready"],
  ["invalid", "mixed"],
  ["empty", "ready"],
] as const);

export function audioTransitionAllowed(from: AudioState, to: AudioState): boolean {
  if (AUDIO_ILLEGAL_TRANSITIONS.some(([a, b]) => a === from && b === to)) {
    return false;
  }
  return AUDIO_TRANSITIONS.some(([a, b]) => a === from && b === to);
}

export function assertAudioTransition(from: AudioState, to: AudioState): void {
  if (audioTransitionAllowed(from, to)) return;
  throw new AudioCarrierError(
    "audio-illegal-transition",
    `${from} → ${to} 不在 audio-project.md §3.2 的合法迁移表内`,
  );
}

// ------------------------------------------- §8.2 内容完备判据 / F1 空壳治理

export interface AudioCompletenessInput {
  project: unknown;
  /** IR 序列化后的字节数(§8.1)。 */
  irBytes?: number;
  /** mp3 source rendition 的字节数(§8.1)。 */
  sourceBytes?: number;
  /** ffprobe / 帧头实测时长,用于 C4 偏差判据。 */
  evidenceDurationMs?: number;
  /** thumbnail rendition 的 digest,用于 R2 的封面硬校验。 */
  thumbnailDigest?: string;
  /** 是否含人声(role=vocal 时自动推断,可显式覆盖)。 */
  hasVoice?: boolean;
}

export interface AudioCriterion {
  id: string;
  ok: boolean;
  detail: string;
}

export interface AudioCompletenessReport {
  ok: boolean;
  code?: "audio-hollow";
  criteria: AudioCriterion[];
  failed: AudioCriterion[];
}

/**
 * §8.2 全部判据 + §8.1 字节下限。任一不成立即 `audio-hollow`(F1)。
 * 空壳(只有 schema + title + 空 tracks)在这里必须整条不合格。
 */
export function auditAudioCompleteness(
  input: AudioCompletenessInput,
): AudioCompletenessReport {
  const criteria: AudioCriterion[] = [];
  const add = (id: string, ok: boolean, detail: string) =>
    criteria.push({ id, ok, detail });

  const validation = validateAudioProjectIr(input.project);
  add(
    "ir-schema",
    validation.ok,
    validation.ok
      ? `通过 ${AUDIO_PROJECT_SCHEMA_ID} 校验`
      : `${validation.errors.length} 条 schema 违例,首条 ${validation.errors[0].path} ${validation.errors[0].message}`,
  );

  const project = (input.project ?? {}) as Partial<AudioProjectIr>;
  const tracks = Array.isArray(project.tracks) ? project.tracks : [];
  const markers = Array.isArray(project.markers) ? project.markers : [];
  const entries = Array.isArray(project.attribution?.entries)
    ? project.attribution!.entries
    : [];

  add(
    "tracks>=2",
    tracks.length >= AUDIO_CONSTANTS.C14_minTracks,
    `tracks=${tracks.length}(C14 ≥ 2)`,
  );

  const durationMs = Number(project.master?.durationMs ?? 0);
  add(
    "duration>=8000ms",
    durationMs >= AUDIO_CONSTANTS.C1_minDurationMs,
    `master.durationMs=${durationMs}(C1 ≥ 8000)`,
  );

  if (input.evidenceDurationMs !== undefined) {
    const drift = Math.abs(durationMs - input.evidenceDurationMs);
    add(
      "duration-drift<=2500ms",
      drift <= AUDIO_CONSTANTS.C4_durationEvidenceToleranceMs,
      `|${durationMs} − ${input.evidenceDurationMs}| = ${drift} ms(C4 ≤ 2500)`,
    );
  }

  const lufs = Number(project.loudness?.integratedLufs ?? Number.NaN);
  const lufsLow = AUDIO_CONSTANTS.C10_targetLufs - AUDIO_CONSTANTS.C11_lufsToleranceLu;
  const lufsHigh = AUDIO_CONSTANTS.C10_targetLufs + AUDIO_CONSTANTS.C11_lufsToleranceLu;
  add(
    "integratedLufs∈[-15,-13]",
    Number.isFinite(lufs) && lufs >= lufsLow && lufs <= lufsHigh,
    `integratedLufs=${lufs}(C10/C11 [${lufsLow}, ${lufsHigh}])`,
  );

  const truePeak = Number(project.loudness?.truePeakDbtp ?? Number.NaN);
  add(
    "truePeak<=-1.0dBTP",
    Number.isFinite(truePeak) && truePeak <= AUDIO_CONSTANTS.C12_truePeakCeilingDbtp,
    `truePeakDbtp=${truePeak}(C12 ≤ −1.0)`,
  );

  add(
    "artwork.embeddedInId3",
    project.artwork?.embeddedInId3 === true,
    `embeddedInId3=${String(project.artwork?.embeddedInId3)}(R2 硬校验)`,
  );

  if (input.thumbnailDigest !== undefined) {
    add(
      "artwork.sha256==thumbnail.digest",
      project.artwork?.sha256 === input.thumbnailDigest,
      `artwork.sha256=${project.artwork?.sha256 ?? "∅"} vs thumbnail=${input.thumbnailDigest}`,
    );
  }

  add("markers>=3", markers.length >= 3, `markers=${markers.length}(§8.2 ≥ 3)`);

  const hasVoice =
    input.hasVoice ?? tracks.some((track) => track?.role === "vocal");
  if (hasVoice) {
    const transcript = typeof project.transcript === "string" ? project.transcript : "";
    add(
      "transcript>=40",
      transcript.length >= 40,
      `有人声,transcript 长度 ${transcript.length}(SC 1.2.1 ≥ 40)`,
    );
  }

  const description = typeof project.description === "string" ? project.description : "";
  add("description>=8", description.length >= 8, `description 长度 ${description.length}`);

  const licenseLock = auditAudioLicenseLock(project);
  add(
    "attribution>=1 且无 CC-BY-SA",
    entries.length >= 1 && licenseLock.ok,
    `entries=${entries.length},shareAlike=${licenseLock.shareAlike},licenses=[${licenseLock.licenses.join(",")}]`,
  );

  const title = typeof project.title === "string" ? project.title : "";
  add("title>=8", title.length >= 8, `title 长度 ${title.length}`);

  if (input.irBytes !== undefined) {
    add(
      "ir>=2048B",
      input.irBytes >= AUDIO_BYTE_FLOORS.irMinBytes &&
        input.irBytes <= AUDIO_BYTE_FLOORS.irMaxBytes,
      `IR ${input.irBytes} B(§8.1 [${AUDIO_BYTE_FLOORS.irMinBytes}, ${AUDIO_BYTE_FLOORS.irMaxBytes}])`,
    );
  }
  if (input.sourceBytes !== undefined) {
    add(
      "mp3>=245760B",
      input.sourceBytes >= AUDIO_BYTE_FLOORS.sourceMinBytes &&
        input.sourceBytes <= AUDIO_BYTE_FLOORS.sourceMaxBytes,
      `mp3 ${input.sourceBytes} B(§8.1 [${AUDIO_BYTE_FLOORS.sourceMinBytes}, ${AUDIO_BYTE_FLOORS.sourceMaxBytes}])`,
    );
  }

  const failed = criteria.filter((entry) => !entry.ok);
  return {
    ok: failed.length === 0,
    ...(failed.length ? { code: "audio-hollow" as const } : {}),
    criteria,
    failed,
  };
}

// ------------------------------------------ 编辑器草稿 → IR 的对齐桥接

/**
 * `AudioProjectData`(sourceUrl + 操作日志)是编辑器的工作头形态,不是
 * `oceanleo.audio-project.v1`。落库 IR 还需要标题、描述、分轨、响度、内嵌封面
 * 与署名 —— 这几项正是合同 §2.2 那份 231 B 空壳缺的部分,所以由调用方显式
 * 补齐:补不出来就说明这份东西还不构成分轨工程,MUST NOT 落 `bounded`。
 */
export interface AudioProjectIrFacts {
  title: string;
  description: string;
  transcript?: string;
  master: AudioMaster;
  tracks: AudioTrack[];
  markers?: AudioMarker[];
  loudness: AudioLoudness;
  artwork: AudioArtwork;
  attribution: AudioAttributionEntry[];
}

export function audioProjectIrFromFacts(
  facts: AudioProjectIrFacts,
): AudioProjectIr {
  return {
    schema: AUDIO_PROJECT_SCHEMA_ID,
    version: 1,
    title: facts.title,
    description: facts.description,
    ...(facts.transcript ? { transcript: facts.transcript } : {}),
    master: facts.master,
    tracks: facts.tracks,
    ...(facts.markers?.length ? { markers: facts.markers } : {}),
    loudness: facts.loudness,
    artwork: facts.artwork,
    attribution: { entries: facts.attribution },
  };
}

/** §5.1:改任一轨的 gainDb / muted,重混后主输出的响度 MUST 变化。 */
export function mixIntegratedLufs(project: AudioProjectIr): number {
  const audible = project.tracks.filter((track) => track.muted !== true);
  if (!audible.length) return -Infinity;
  const power = audible.reduce(
    (sum, track) => sum + 10 ** (track.gainDb / 10),
    0,
  );
  // 以 IR 声明的整体响度为基准,轨增益变化按功率和平移。
  return (
    Math.round((project.loudness.integratedLufs + 10 * Math.log10(power / audible.length)) * 100) /
    100
  );
}
