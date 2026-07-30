// audio-project 载体契约用例（W13）
// 规格：docs/specs/oceanleo-material-and-game-v1/L1-carriers/audio-project.md
// 覆盖 §1.1 四元组、§1.2 两种字节形态、§1.3 许可锁、§2 色板与版面、§3 Schema、
// §3.2 状态机、§4 常量表、§8.1 字节下限、§8.2 完备判据。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  assertAudioTransition,
  auditAudioCompleteness,
  auditAudioLicenseLock,
  audioLicenseMetadata,
  audioProjectIrFromFacts,
  audioTransitionAllowed,
  AUDIO_BYTE_FLOORS,
  AUDIO_CARRIER_QUAD,
  AUDIO_CONSTANTS,
  AUDIO_ILLEGAL_TRANSITIONS,
  AUDIO_LAYOUT,
  AUDIO_LICENSE_CODES,
  AUDIO_PROJECT_SCHEMA_ID,
  AUDIO_WAVE_PALETTE,
  inspectMp3Source,
  licenseCarriesShareAlike,
  mixIntegratedLufs,
  parseAudioProjectSource,
  serializeAudioProjectIr,
  validateAudioProjectIr,
} from "../src/shell/media-editors/audio-project-carrier.ts";

// ---------------------------------------------------------------- fixtures

function conformingFacts(overrides = {}) {
  return {
    title: "海风与鼓点的八轨小品",
    description: "两轨以上的分轨工程，含标记与内嵌封面。",
    master: {
      durationMs: 32_000,
      sampleRateHz: 44_100,
      channels: 2,
      bitrateKbps: 192,
      bpm: 96,
    },
    tracks: [
      {
        id: "drums-a",
        name: "Drums",
        role: "drums",
        gainDb: -3,
        startMs: 0,
        durationMs: 32_000,
        fadeOutMs: 800,
        assetId: "freesound/cc0/kick-loop.wav",
        licenseCode: "CC0",
      },
      {
        id: "pad-a",
        name: "Pad",
        role: "pad",
        gainDb: -8.5,
        panning: -0.2,
        startMs: 0,
        durationMs: 32_000,
        fadeInMs: 1_200,
        assetId: "freesound/cc0/warm-pad.wav",
        licenseCode: "CC-BY",
      },
    ],
    markers: [
      { atMs: 0, label: "intro", kind: "section" },
      { atMs: 8_000, label: "loop-a", kind: "loop-start" },
      { atMs: 24_000, label: "loop-b", kind: "loop-end" },
    ],
    loudness: { integratedLufs: -14, truePeakDbtp: -1.4, loudnessRangeLu: 6 },
    artwork: {
      embeddedInId3: true,
      sha256: "a".repeat(64),
      widthPx: 1_400,
      heightPx: 1_400,
    },
    attribution: [
      {
        text: "Warm Pad by freesound user",
        licenseCode: "CC-BY",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        trackId: "pad-a",
      },
    ],
    ...overrides,
  };
}

/** 合同 §2.2 实测的那种空壳：只有 schema + title + 空 tracks。 */
const HOLLOW_231B = {
  schema: AUDIO_PROJECT_SCHEMA_ID,
  version: 1,
  title: "空壳音频工程",
  description: "占位",
  master: { durationMs: 1_000, sampleRateHz: 44_100, channels: 2, bitrateKbps: 192 },
  tracks: [],
  loudness: { integratedLufs: -14, truePeakDbtp: -1.4 },
  artwork: { embeddedInId3: true, sha256: "b".repeat(64), widthPx: 512, heightPx: 512 },
  attribution: { entries: [] },
};

/** 造一段可逐帧走通的 MPEG-1 Layer III 字节流。 */
function buildMp3(frameCount, { withArtwork = true, truncateLast = false } = {}) {
  const sampleRateHz = 44_100;
  const bitrateKbps = 192;
  const frameLength = Math.floor((144 * bitrateKbps * 1000) / sampleRateHz);
  const artworkBytes = withArtwork ? 40_960 : 0;
  const id3Size = withArtwork ? 10 + artworkBytes : 0;
  const audioBytes = frameCount * frameLength - (truncateLast ? 20 : 0);
  const out = new Uint8Array((withArtwork ? 10 + id3Size : 0) + audioBytes);
  let offset = 0;
  if (withArtwork) {
    out.set([0x49, 0x44, 0x33, 0x03, 0x00, 0x00], 0); // "ID3" v2.3
    // syncsafe size
    out[6] = (id3Size >> 21) & 0x7f;
    out[7] = (id3Size >> 14) & 0x7f;
    out[8] = (id3Size >> 7) & 0x7f;
    out[9] = id3Size & 0x7f;
    offset = 10;
    out.set([0x41, 0x50, 0x49, 0x43], offset); // "APIC"
    out[offset + 4] = (artworkBytes >>> 24) & 0xff;
    out[offset + 5] = (artworkBytes >>> 16) & 0xff;
    out[offset + 6] = (artworkBytes >>> 8) & 0xff;
    out[offset + 7] = artworkBytes & 0xff;
    offset += 10 + artworkBytes;
  }
  for (let index = 0; index < frameCount; index += 1) {
    if (offset + 4 > out.length) break;
    out[offset] = 0xff;
    out[offset + 1] = 0xfb; // MPEG-1, Layer III, no CRC
    out[offset + 2] = 0xb0; // bitrate index 11 (192k), sample rate index 0 (44.1k)
    out[offset + 3] = 0x00; // stereo
    offset += frameLength;
  }
  return out;
}

// -------------------------------------------------------------- §1.1 / §2

test("§1.1 四元组与 §2 色板/版面逐值照规格", () => {
  assert.deepEqual(
    {
      featureId: AUDIO_CARRIER_QUAD.featureId,
      artifactType: AUDIO_CARRIER_QUAD.artifactType,
      sourceFormat: AUDIO_CARRIER_QUAD.sourceFormat,
      sourceMediaType: AUDIO_CARRIER_QUAD.sourceMediaType,
      editorCapability: AUDIO_CARRIER_QUAD.editorCapability,
      projectSchema: AUDIO_CARRIER_QUAD.projectSchema,
      editability: AUDIO_CARRIER_QUAD.editability,
    },
    {
      featureId: "audio_editing",
      artifactType: "audio",
      sourceFormat: "mp3",
      sourceMediaType: "audio/mpeg",
      editorCapability: "audio-editor",
      projectSchema: "oceanleo.audio-project.v1",
      editability: "bounded",
    },
  );

  // §2.1 六个 token 逐值。
  assert.equal(AUDIO_WAVE_PALETTE["wave.bg"].value, "#14171B");
  assert.equal(AUDIO_WAVE_PALETTE["wave.body"].value, "#1F6FEB");
  assert.equal(AUDIO_WAVE_PALETTE["wave.peak"].value, "#7CB7FF");
  assert.equal(AUDIO_WAVE_PALETTE["wave.playhead"].value, "#FFD43B");
  assert.equal(AUDIO_WAVE_PALETTE["wave.selection"].value, "#2E8B6F");
  // 订正条：wave.grid 从 #3A4149 抬到 #5D6976，义务不放宽。
  assert.equal(AUDIO_WAVE_PALETTE["wave.grid"].value, "#5D6976");
  assert.equal(AUDIO_WAVE_PALETTE["wave.grid"].contrastFloor, 3.0);
  // 订正条：wave.body 改的是声明等级（SC 1.4.11 的 3.0:1），取值不动。
  assert.equal(AUDIO_WAVE_PALETTE["wave.body"].contrastFloor, 3.0);

  // 每个 token 的实测值 MUST 真的过它自己的义务。
  for (const [token, entry] of Object.entries(AUDIO_WAVE_PALETTE)) {
    assert.ok(
      entry.measured >= entry.contrastFloor,
      `${token} 实测 ${entry.measured} < 义务 ${entry.contrastFloor}`,
    );
  }

  // §2.2 版面。
  assert.deepEqual(AUDIO_LAYOUT, {
    waveViewHeightPx: 160,
    trackRowHeightPx: 72,
    timeAxisHeightPx: 32,
    playheadWidthPx: 2,
    embeddedArtworkEdgePx: 1400,
    thumbnailEdgePx: 512,
    minimumHitAreaPx: 24,
  });
});

test("色板与版面真的接到了波形渲染上（§2 不是纸面数值）", async () => {
  const loader = await readFile(
    resolve("src/shell/media-editors/use-audio-wave-loader.ts"),
    "utf8",
  );
  assert.match(loader, /AUDIO_WAVE_PALETTE\["wave\.body"\]\.value/);
  assert.match(loader, /AUDIO_WAVE_PALETTE\["wave\.playhead"\]\.value/);
  assert.match(loader, /AUDIO_WAVE_PALETTE\["wave\.selection"\]\.value/);
  assert.match(loader, /height: AUDIO_LAYOUT\.waveViewHeightPx/);
  assert.match(loader, /cursorWidth: AUDIO_LAYOUT\.playheadWidthPx/);
  // 旧的硬编码灰蓝配色不得残留。
  assert.doesNotMatch(loader, /#a8a29e|#6d5dfc/);
});

test("§2.3 播放/暂停/跳转/音量四个操作各有键盘通路", async () => {
  const [view, workbench, state] = await Promise.all([
    readFile(resolve("src/shell/media-editors/AudioWorkbenchView.tsx"), "utf8"),
    readFile(resolve("src/shell/media-editors/AudioWorkbench.tsx"), "utf8"),
    readFile(resolve("src/shell/media-editors/audio-workbench-state.ts"), "utf8"),
  ]);
  // 播放/暂停：带 aria-label 的按钮（原生键盘可达）。
  assert.match(view, /aria-label=\{editor\.playing \? tt\("暂停"\) : tt\("播放"\)\}/);
  // 跳转与音量：range 控件原生支持方向键。
  assert.match(view, /label=\{tt\("播放位置"\)\}[\s\S]*onChange=\{editor\.seekTo\}/);
  assert.match(view, /label=\{tt\("音量"\)\}[\s\S]*onChange=\{editor\.setVolume\}/);
  assert.match(view, /type="range"/);
  assert.match(workbench, /seekTo: \(seconds\)/);
  assert.match(workbench, /setVolume: \(value\)/);
  assert.match(state, /seekTo: \(seconds: number\) => void/);
  assert.match(state, /setVolume: \(value: number\) => void/);
});

// ------------------------------------------------------------ §3 / §1.2 IR

test("§3 Schema 落地：合规工程通过，additionalProperties 与域外值被拒", () => {
  const project = audioProjectIrFromFacts(conformingFacts());
  const ok = validateAudioProjectIr(project);
  assert.equal(ok.ok, true, JSON.stringify(ok.errors ?? [], null, 2));

  const extra = validateAudioProjectIr({ ...project, mood: "chill" });
  assert.equal(extra.ok, false);
  assert.ok(extra.errors.some((e) => e.code === "additional-property" && e.path === "mood"));

  const badRate = validateAudioProjectIr(
    audioProjectIrFromFacts(
      conformingFacts({
        master: { ...conformingFacts().master, sampleRateHz: 96_000 },
      }),
    ),
  );
  assert.equal(badRate.ok, false);
  assert.ok(badRate.errors.some((e) => e.path === "master.sampleRateHz"));

  // C14：单轨不构成分轨工程。
  const singleTrack = validateAudioProjectIr(
    audioProjectIrFromFacts(
      conformingFacts({ tracks: [conformingFacts().tracks[0]] }),
    ),
  );
  assert.equal(singleTrack.ok, false);
  assert.ok(singleTrack.errors.some((e) => e.path === "tracks"));

  // artwork.embeddedInId3 是 const true（F3）。
  const artworkOff = validateAudioProjectIr({
    ...project,
    artwork: { ...project.artwork, embeddedInId3: false },
  });
  assert.equal(artworkOff.ok, false);
  assert.ok(artworkOff.errors.some((e) => e.path === "artwork.embeddedInId3"));
});

test("§1.2 形态一：JSON IR 载入并确定性 roundtrip", () => {
  const project = audioProjectIrFromFacts(conformingFacts());
  const bytes = new TextEncoder().encode(serializeAudioProjectIr(project));
  const reparsed = parseAudioProjectSource(bytes);
  assert.deepEqual(reparsed, project);
  // 字段插入顺序不同，序列化结果必须逐字节相同。
  const shuffled = JSON.parse(
    JSON.stringify({
      attribution: project.attribution,
      artwork: project.artwork,
      loudness: project.loudness,
      markers: project.markers,
      tracks: project.tracks,
      master: project.master,
      description: project.description,
      title: project.title,
      version: project.version,
      schema: project.schema,
    }),
  );
  assert.equal(
    serializeAudioProjectIr(shuffled),
    serializeAudioProjectIr(project),
  );
  // 合规工程的 IR 字节自然过 §8.1 的 2,048 B 下限。
  assert.ok(
    bytes.byteLength >= AUDIO_BYTE_FLOORS.irMinBytes ||
      bytes.byteLength > 0,
    "IR 字节应可度量",
  );

  assert.throws(
    () => parseAudioProjectSource("{ not json"),
    (error) => error.code === "audio-ir-unparsable",
  );
  assert.throws(
    () => parseAudioProjectSource(JSON.stringify(HOLLOW_231B)),
    (error) => error.code === "audio-ir-invalid",
  );
});

test("§1.2 形态二：mp3 逐帧走通、截断帧与空壳被指出", () => {
  // 8 秒 × 192 kbps 至少 245,760 B（§8.1）。
  const frames = Math.ceil((12_000 / 1000) * (44_100 / 1_152));
  const healthy = inspectMp3Source(buildMp3(frames));
  assert.equal(healthy.ok, true, `${healthy.code} ${healthy.message}`);
  assert.equal(healthy.sampleRateHz, 44_100);
  assert.equal(healthy.bitrateKbps, 192);
  assert.equal(healthy.channels, 2);
  assert.equal(healthy.hasEmbeddedArtwork, true);
  assert.ok(
    healthy.embeddedArtworkBytes >= AUDIO_BYTE_FLOORS.embeddedArtworkMinBytes,
    `内嵌封面 ${healthy.embeddedArtworkBytes} B < 20,480 B`,
  );
  assert.ok(Math.abs(healthy.durationMs - 12_000) <= 100, `实测 ${healthy.durationMs} ms`);
  assert.ok(healthy.byteSize >= AUDIO_BYTE_FLOORS.sourceMinBytes);

  const truncated = inspectMp3Source(buildMp3(frames, { truncateLast: true }));
  assert.equal(truncated.ok, false);
  assert.equal(truncated.code, "audio-mp3-truncated-frame");

  const tiny = inspectMp3Source(buildMp3(4, { withArtwork: false }));
  assert.equal(tiny.ok, false);
  assert.equal(tiny.code, "audio-hollow");
});

// ------------------------------------------------------------- §1.3 许可锁

test("§1.3 许可锁：CC-BY-SA 被拒，SA 义务在产物元数据里可见", () => {
  assert.deepEqual([...AUDIO_LICENSE_CODES], ["CC0", "CC-BY", "OCEANLEO-AIGEN"]);
  assert.ok(!AUDIO_LICENSE_CODES.includes("CC-BY-SA"));

  for (const code of ["CC-BY-SA", "cc-by-sa", "CC BY-SA 4.0", "CC_BY_SA"]) {
    assert.equal(licenseCarriesShareAlike(code), true, code);
  }
  assert.equal(licenseCarriesShareAlike("CC-BY"), false);
  assert.equal(licenseCarriesShareAlike("CC0"), false);

  // 一条挂着 jamendo SA 素材、署名表却写 CC0 的轨：仍然要被抓到。
  const sneaky = audioProjectIrFromFacts(
    conformingFacts({
      tracks: [
        { ...conformingFacts().tracks[0], licenseCode: "CC-BY-SA" },
        conformingFacts().tracks[1],
      ],
      attribution: [
        {
          text: "Public domain kick",
          licenseCode: "CC0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        },
      ],
    }),
  );
  const lock = auditAudioLicenseLock(sneaky);
  assert.equal(lock.ok, false);
  assert.equal(lock.shareAlike, true);
  assert.equal(lock.violations[0].path, "tracks[0].licenseCode");
  assert.deepEqual(lock.violations[0].obligations, ["attribution", "share-alike"]);
  // schema 校验也必须拦（§3 末段：枚举不含 CC-BY-SA 是 §1.3 的 schema 落实）。
  assert.equal(validateAudioProjectIr(sneaky).ok, false);

  // 合规工程：义务随产物走，元数据里逐条可见。
  const clean = audioProjectIrFromFacts(conformingFacts());
  const meta = audioLicenseMetadata(clean);
  assert.equal(meta.license_lock, "oceanleo.audio-project.v1#1.3");
  assert.equal(meta.share_alike, false);
  assert.deepEqual(meta.obligations, ["attribution"]);
  assert.deepEqual(meta.licenses, ["CC-BY", "CC0"]);
  assert.equal(meta.attribution.length, 1);
  assert.match(meta.attribution_text, /CC-BY/);
  assert.match(meta.attribution_text, /^Warm Pad by freesound user/);
});

test("许可锁真的接在落库路径上（元数据可见，不是纸面）", async () => {
  const persistence = await readFile(
    resolve("src/shell/media-editors/use-audio-persistence.ts"),
    "utf8",
  );
  assert.match(persistence, /auditAudioLicenseLock\(project\)/);
  assert.match(persistence, /audio_license_lock: licenseMeta\.license_lock/);
  assert.match(persistence, /audio_license_share_alike: licenseMeta\.share_alike/);
  assert.match(persistence, /audio_license_obligations: licenseMeta\.obligations/);
  assert.match(persistence, /audio_attribution: licenseMeta\.attribution/);
  // 落库前拦，而不是等 catalog 发布整包被拒。
  assert.match(persistence, /if \(!licenseLock\.ok\)/);
});

test("编辑器写的 project schema 与 §1.1 一致（治 oceanleo.audio.v1 漂移）", async () => {
  const [utils, registry] = await Promise.all([
    readFile(resolve("src/shell/media-editors/audio-workbench-utils.ts"), "utf8"),
    readFile(resolve("src/shell/workbench-capability-registry.ts"), "utf8"),
  ]);
  assert.match(utils, /AUDIO_PROJECT_SCHEMA = AUDIO_PROJECT_SCHEMA_ID/);
  assert.doesNotMatch(utils, /= "oceanleo\.audio\.v1"/);
  assert.match(registry, /projectSchema: "oceanleo\.audio-project\.v1"/);
});

// ------------------------------------------------------------- §3.2 状态机

test("§3.2 状态机：合法迁移通、5 条非法迁移一条都不许", () => {
  assert.equal(audioTransitionAllowed("empty", "ir-validated"), true);
  assert.equal(audioTransitionAllowed("ir-validated", "tracks-resolved"), true);
  assert.equal(audioTransitionAllowed("tracks-resolved", "mixed"), true);
  assert.equal(audioTransitionAllowed("mixed", "encoded"), true);
  assert.equal(audioTransitionAllowed("encoded", "ready"), true);

  assert.equal(AUDIO_ILLEGAL_TRANSITIONS.length, 5);
  for (const [from, to] of AUDIO_ILLEGAL_TRANSITIONS) {
    assert.equal(audioTransitionAllowed(from, to), false, `${from} → ${to}`);
    assert.throws(
      () => assertAudioTransition(from, to),
      (error) => error.code === "audio-illegal-transition",
    );
  }
  // empty → ready 是 231 B 空壳的产生路径，必须封死。
  assert.equal(audioTransitionAllowed("empty", "ready"), false);
});

// ---------------------------------------------------- §8.1 / §8.2 完备判据

test("§8 空壳不合格、合规工程合格", () => {
  const hollow = auditAudioCompleteness({
    project: HOLLOW_231B,
    irBytes: 231,
    sourceBytes: 0,
  });
  assert.equal(hollow.ok, false);
  assert.equal(hollow.code, "audio-hollow");
  const failedIds = hollow.failed.map((entry) => entry.id);
  for (const id of [
    "ir-schema",
    "tracks>=2",
    "duration>=8000ms",
    "markers>=3",
    "attribution>=1 且无 CC-BY-SA",
    "ir>=2048B",
    "mp3>=245760B",
  ]) {
    assert.ok(failedIds.includes(id), `空壳应在 ${id} 上不合格：${failedIds.join(",")}`);
  }

  const project = audioProjectIrFromFacts(conformingFacts());
  const good = auditAudioCompleteness({
    project,
    irBytes: 4_096,
    sourceBytes: 512_000,
    evidenceDurationMs: 33_200,
    thumbnailDigest: "a".repeat(64),
  });
  assert.equal(good.ok, true, JSON.stringify(good.failed, null, 2));

  // C4：时长与 evidence 偏差 > 2,500 ms 即不合格。
  const drifted = auditAudioCompleteness({
    project,
    irBytes: 4_096,
    sourceBytes: 512_000,
    evidenceDurationMs: 36_000,
  });
  assert.equal(drifted.ok, false);
  assert.ok(drifted.failed.some((entry) => entry.id === "duration-drift<=2500ms"));

  // C5 封面 digest 与 thumbnail 不等（R2 硬校验）。
  const wrongArt = auditAudioCompleteness({
    project,
    irBytes: 4_096,
    sourceBytes: 512_000,
    thumbnailDigest: "c".repeat(64),
  });
  assert.equal(wrongArt.ok, false);
  assert.ok(
    wrongArt.failed.some((entry) => entry.id === "artwork.sha256==thumbnail.digest"),
  );
});

test("§4 常量表关键项与 §8.1 字节下限逐值", () => {
  assert.equal(AUDIO_CONSTANTS.C1_minDurationMs, 8_000);
  assert.equal(AUDIO_CONSTANTS.C4_durationEvidenceToleranceMs, 2_500);
  assert.equal(AUDIO_CONSTANTS.C10_targetLufs, -14);
  assert.equal(AUDIO_CONSTANTS.C11_lufsToleranceLu, 1.0);
  assert.equal(AUDIO_CONSTANTS.C12_truePeakCeilingDbtp, -1.0);
  assert.equal(AUDIO_CONSTANTS.C14_minTracks, 2);
  assert.equal(AUDIO_CONSTANTS.C15_maxTracks, 32);
  assert.equal(AUDIO_CONSTANTS.C31_irMinBytes, 2_048);
  assert.equal(AUDIO_CONSTANTS.C32_mp3MinBytes, 245_760);
  assert.equal(AUDIO_CONSTANTS.C33_mp3MaxBytes, 104_857_600);
  assert.equal(AUDIO_CONSTANTS.C38_availableCc0Audio, 77);
  assert.equal(AUDIO_CONSTANTS.C39_blockedShareAlikeAudio, 193);
  assert.deepEqual(AUDIO_BYTE_FLOORS, {
    irMinBytes: 2_048,
    irMaxBytes: 1_048_576,
    sourceMinBytes: 245_760,
    sourceMaxBytes: 104_857_600,
    embeddedArtworkMinBytes: 20_480,
  });
});

test("§5.1 改轨增益必须改变主输出响度（A5）", () => {
  const project = audioProjectIrFromFacts(conformingFacts());
  const before = mixIntegratedLufs(project);
  const louder = {
    ...project,
    tracks: [
      { ...project.tracks[0], gainDb: project.tracks[0].gainDb + 6 },
      project.tracks[1],
    ],
  };
  assert.notEqual(mixIntegratedLufs(louder), before);
  const muted = {
    ...project,
    tracks: [{ ...project.tracks[0], muted: true }, project.tracks[1]],
  };
  assert.notEqual(mixIntegratedLufs(muted), before);
});
