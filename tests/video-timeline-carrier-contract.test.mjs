// video-timeline 载体契约用例（W13）
// 规格：docs/specs/oceanleo-material-and-game-v1/L1-carriers/video-timeline.md
// 覆盖 §1.1 四元组、§1.2 两种字节形态、§1.3 运行时版本锁、§2 色板/版面/画面与
// 字幕/无障碍、§3 Schema、§3.2 状态机、§3.3 预览分辨率契约、§4 常量表、
// §5.1 功能适合性、§5.4 安全与合规、§8.1 字节下限、§8.2 完备判据。
//
// §3.3 是本组的重点：入库校验读 `preview.width == width && preview.height ==
// height`，所以「为省字节偷偷降采样冒充预览」必须在编辑器侧就被拦下。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  assertPreviewResolution,
  assertTimelineTransition,
  auditTimelineCompleteness,
  defaultVideoBitrateKbps,
  deliveryTierFor,
  inspectMp4Source,
  parseTimelineSource,
  previewRenditionSize,
  projectIrToTimelineDoc,
  serializeTimelineProjectIr,
  thumbnailRenditionSize,
  thumbnailResolutionOk,
  timelineDocToProjectIr,
  timelineRenderDigest,
  timelineTransitionAllowed,
  validateTimelineProjectIr,
  TIMELINE_ACCESSIBILITY,
  TIMELINE_BYTE_FLOORS,
  TIMELINE_CARRIER_QUAD,
  TIMELINE_CLIP_LABEL_COLORS,
  TIMELINE_CONSTANTS,
  TIMELINE_DELIVERY_TIERS,
  TIMELINE_ILLEGAL_TRANSITIONS,
  TIMELINE_IR_TRANSITION_KINDS,
  TIMELINE_LAYOUT,
  TIMELINE_PALETTE,
  TIMELINE_PICTURE,
  TIMELINE_PROJECT_SCHEMA_ID,
  TIMELINE_QUALITY_POLICY_TARGET,
  TIMELINE_RUNTIME_LOCK,
} from "../src/shell/video-editor/timeline-carrier.ts";

// ---------------------------------------------------------------- fixtures

const OUTPUT_DURATION_MS = 24_000;

/**
 * 一份符合 §8.2 全部判据的成片工程：2 轨、8 片段、2 转场、6 字幕、署名齐全。
 * 字段取值刻意贴着 §2.3 标准档（1920×1080 / 30 fps）与 C11（6,000 kbps）。
 *
 * 刻意做成「真的完整」而不是「刚好够结构下限」：§8.1 的 2,560 B 与 §8.2 的
 * 结构判据是两道独立的闸。只满足 C15/C19 的骨架工程（3+2 片段、3 条字幕）
 * 序列化只有 2,314 B，正好被字节下限拦住 —— 那道闸拦的就是结构齐全但内容
 * 空洞的工程（空标题、单词字幕）。
 *
 * 视频片段同样带 gainDb：视频轨自带声音，内部模型给它 volume 默认 1，
 * 对应 IR 的 0 dB。
 */
function conformingIr(overrides = {}) {
  return {
    schema: TIMELINE_PROJECT_SCHEMA_ID,
    version: 1,
    title: "潮汐与灯塔的二十四秒剪辑",
    description:
      "两轨八片段的线性时间线：远景海面起手，切到灯塔与防波堤，末段收在海鸥掠过的空镜；" +
      "第二与第四个镜头之间各有一处转场，音床由海浪与风声两段铺满全片。",
    output: {
      widthPx: 1_920,
      heightPx: 1_080,
      fps: 30,
      durationMs: OUTPUT_DURATION_MS,
      videoBitrateKbps: 6_000,
      audioBitrateKbps: 160,
      codec: "h264",
    },
    tracks: [
      {
        id: "v-main",
        kind: "video",
        clips: [
          {
            id: "v-shot-a",
            assetId: "pexels/ocean-wide-establishing.mp4",
            startMs: 0,
            durationMs: 4_800,
            opacity: 1,
            scale: 1,
            gainDb: 0,
          },
          {
            id: "v-shot-b",
            assetId: "pexels/lighthouse-dusk.mp4",
            startMs: 4_800,
            durationMs: 4_800,
            opacity: 1,
            scale: 1,
            gainDb: 0,
          },
          {
            id: "v-shot-c",
            assetId: "pexels/breakwater-close.mp4",
            startMs: 9_600,
            durationMs: 4_800,
            opacity: 1,
            scale: 1,
            gainDb: 0,
          },
          {
            id: "v-shot-d",
            assetId: "pexels/gulls-overhead.mp4",
            startMs: 14_400,
            durationMs: 4_800,
            opacity: 1,
            scale: 1,
            gainDb: 0,
          },
          {
            id: "v-shot-e",
            assetId: "pexels/tide-receding.mp4",
            startMs: 19_200,
            durationMs: 4_800,
            opacity: 1,
            scale: 1,
            gainDb: 0,
          },
        ],
      },
      {
        id: "a-bed",
        kind: "audio",
        clips: [
          {
            id: "a-bed-a",
            assetId: "freesound/cc0/surf-bed-loop.wav",
            startMs: 0,
            durationMs: 8_000,
            gainDb: 0,
          },
          {
            id: "a-bed-b",
            assetId: "freesound/cc0/wind-bed-loop.wav",
            startMs: 8_000,
            durationMs: 8_000,
            gainDb: 0,
          },
          {
            id: "a-bed-c",
            assetId: "freesound/cc0/gull-calls.wav",
            startMs: 16_000,
            durationMs: 8_000,
            gainDb: 0,
          },
        ],
      },
    ],
    transitions: [
      { atMs: 4_800, kind: "crossfade", durationMs: 500 },
      { atMs: 14_400, kind: "fade-to-black", durationMs: 800 },
    ],
    captions: [
      { startMs: 400, endMs: 4_200, text: "潮水退去的第一分钟" },
      { startMs: 5_000, endMs: 9_000, text: "灯塔在暮色里亮起" },
      { startMs: 9_800, endMs: 13_800, text: "防波堤挡下最后一排浪" },
      { startMs: 14_600, endMs: 18_400, text: "海鸥掠过堤顶" },
      { startMs: 19_400, endMs: 22_000, text: "水线一寸寸退回去" },
      { startMs: 22_200, endMs: 23_800, text: "留下一整片湿沙" },
    ],
    audioMix: { integratedLufs: -14, truePeakDbtp: -1.2 },
    attribution: {
      entries: [
        {
          text: "Ocean and lighthouse footage by Pexels contributors",
          licenseCode: "PEXELS",
          licenseUrl: "https://www.pexels.com/license/",
          clipId: "v-shot-a",
        },
        {
          text: "Surf and wind beds from Freesound, dedicated to the public domain",
          licenseCode: "CC0-1.0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
          clipId: "a-bed-a",
        },
      ],
    },
    ...overrides,
  };
}

/** 合同 §2.2 实测的那种 271 B 空壳：schema + title + 空 tracks。 */
const HOLLOW_271B = {
  schema: TIMELINE_PROJECT_SCHEMA_ID,
  version: 1,
  title: "空壳视频工程",
  description: "占位",
  output: {
    widthPx: 1_920,
    heightPx: 1_080,
    fps: 30,
    durationMs: 1_000,
    videoBitrateKbps: 6_000,
  },
  tracks: [],
  attribution: { entries: [] },
};

/** 造一段顶层 box 结构完整的 mp4 字节流。最后一个 box 吸收剩余字节。 */
function buildMp4(types, totalBytes) {
  const out = new Uint8Array(totalBytes);
  const view = new DataView(out.buffer);
  let offset = 0;
  types.forEach((type, index) => {
    const isLast = index === types.length - 1;
    const size = isLast ? totalBytes - offset : index === 0 ? 32 : 4_096;
    assert.ok(size >= 8, `box ${type} 尺寸 ${size} 过小`);
    view.setUint32(offset, size);
    for (let i = 0; i < 4; i += 1) {
      out[offset + 4 + i] = type.charCodeAt(i);
    }
    offset += size;
  });
  return out;
}

// ------------------------------------------------------------- §1.1 / §1.3

test("§1.1 四元组逐字，§1.3 运行时版本锁禁 GPU 编码器", () => {
  assert.deepEqual(
    {
      featureId: TIMELINE_CARRIER_QUAD.featureId,
      artifactType: TIMELINE_CARRIER_QUAD.artifactType,
      sourceFormat: TIMELINE_CARRIER_QUAD.sourceFormat,
      sourceMediaType: TIMELINE_CARRIER_QUAD.sourceMediaType,
      editorCapability: TIMELINE_CARRIER_QUAD.editorCapability,
      adapter: TIMELINE_CARRIER_QUAD.adapter,
      projectSchema: TIMELINE_CARRIER_QUAD.projectSchema,
      editability: TIMELINE_CARRIER_QUAD.editability,
      sourceIntegrity: TIMELINE_CARRIER_QUAD.sourceIntegrity,
      openMode: TIMELINE_CARRIER_QUAD.openMode,
      dependencyClosure: TIMELINE_CARRIER_QUAD.dependencyClosure,
    },
    {
      featureId: "video_editing",
      artifactType: "video",
      sourceFormat: "mp4",
      sourceMediaType: "video/mp4",
      editorCapability: "video-timeline",
      adapter: "video-timeline",
      projectSchema: "oceanleo.timeline.v1",
      editability: "bounded",
      sourceIntegrity: "content_addressed",
      openMode: "native-file",
      dependencyClosure: "not_required",
    },
  );
  assert.deepEqual([...TIMELINE_CARRIER_QUAD.previewPurposes], ["full", "preview"]);

  // §1.3：合同 §2.9 记明无 GPU（nvidia-smi 不存在），MUST 用软件编码器。
  assert.equal(TIMELINE_RUNTIME_LOCK.softwareEncoderOnly, true);
  assert.ok(TIMELINE_RUNTIME_LOCK.forbiddenEncoders.includes("h264_nvenc"));
  assert.equal(TIMELINE_RUNTIME_LOCK.napiRsCanvas, "0.1.100");

  // §1.1 末条：MUST NOT 与 workflow 载体的 oceanleo.video-canvas.v1 混淆。
  assert.equal(TIMELINE_PROJECT_SCHEMA_ID, "oceanleo.timeline.v1");
  assert.notEqual(TIMELINE_PROJECT_SCHEMA_ID, "oceanleo.video-canvas.v1");
});

// -------------------------------------------------------------------- §2

test("§2.1 时间线色板逐值，且每条实测都真的过它自己的义务", () => {
  assert.equal(TIMELINE_PALETTE["tl.bg"].value, "#14171B");
  assert.equal(TIMELINE_PALETTE["tl.clip.video"].value, "#1F6FEB");
  assert.equal(TIMELINE_PALETTE["tl.clip.audio"].value, "#2E8B6F");
  assert.equal(TIMELINE_PALETTE["tl.clip.text"].value, "#D9822B");
  assert.equal(TIMELINE_PALETTE["tl.playhead"].value, "#FFD43B");
  assert.equal(TIMELINE_PALETTE["tl.transition"].value, "#8E5BA6");
  // 订正条：tl.grid 从 #3A4149（实为 1.74:1）抬到 #5D6976，义务不放宽。
  assert.equal(TIMELINE_PALETTE["tl.grid"].value, "#5D6976");
  assert.equal(TIMELINE_PALETTE["tl.grid"].contrastFloor, 3.0);
  assert.equal(TIMELINE_PALETTE["tl.grid"].measured, 3.21);

  // 订正条：三个 tl.clip.* 改的是声明等级（SC 1.4.11 的 3.0:1），取值不动。
  for (const token of ["tl.clip.video", "tl.clip.audio", "tl.clip.text"]) {
    assert.equal(TIMELINE_PALETTE[token].contrastFloor, 3.0, token);
  }
  assert.equal(TIMELINE_PALETTE["tl.playhead"].contrastFloor, 4.5);

  for (const [token, entry] of Object.entries(TIMELINE_PALETTE)) {
    assert.ok(
      entry.measured >= entry.contrastFloor,
      `${token} 实测 ${entry.measured} < 义务 ${entry.contrastFloor}`,
    );
  }
});

test("§2.1 末段 片段块上的文字按块定色（白字不是万能解）", () => {
  // 文字对所在块底色 MUST ≥ 4.5:1（SC 1.4.3），逐块实测值照规格。
  assert.deepEqual(TIMELINE_CLIP_LABEL_COLORS["tl.clip.video"], {
    background: "#1F6FEB",
    label: "#FFFFFF",
    measured: 4.63,
  });
  assert.deepEqual(TIMELINE_CLIP_LABEL_COLORS["tl.clip.audio"], {
    background: "#2E8B6F",
    label: "#0B0F14",
    measured: 4.61,
  });
  assert.deepEqual(TIMELINE_CLIP_LABEL_COLORS["tl.clip.text"], {
    background: "#D9822B",
    label: "#14171B",
    measured: 6.15,
  });
  for (const [token, entry] of Object.entries(TIMELINE_CLIP_LABEL_COLORS)) {
    assert.ok(entry.measured >= 4.5, `${token} 标签实测 ${entry.measured} < 4.5`);
  }
  // audio 块 MUST NOT 用白字（实测仅 4.17:1），也 MUST NOT 用时间线底色
  // #14171B（实测 4.31:1）。
  assert.notEqual(TIMELINE_CLIP_LABEL_COLORS["tl.clip.audio"].label, "#FFFFFF");
  assert.notEqual(TIMELINE_CLIP_LABEL_COLORS["tl.clip.audio"].label, "#14171B");
});

test("§2.2 版面与 §2.3 画面/字幕逐值", () => {
  assert.deepEqual(TIMELINE_LAYOUT, {
    trackRowHeightPx: 64,
    rulerHeightPx: 32,
    minimumClipWidthPx: 24,
    playheadWidthPx: 2,
    captionSafeAreaPercent: 5,
    titleSafeAreaPercent: 10,
    minimumHitAreaPx: 24,
  });
  assert.deepEqual(TIMELINE_PICTURE, {
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
});

test("§2.4 无障碍准则编号与阈值", () => {
  assert.equal(TIMELINE_ACCESSIBILITY.captionsSuccessCriterion, "WCAG 2.2 SC 1.2.2");
  assert.equal(
    TIMELINE_ACCESSIBILITY.audioDescriptionSuccessCriterion,
    "WCAG 2.2 SC 1.2.3",
  );
  assert.equal(TIMELINE_ACCESSIBILITY.autoplaySuccessCriterion, "WCAG 2.2 SC 1.4.2");
  assert.equal(TIMELINE_ACCESSIBILITY.flashSuccessCriterion, "WCAG 2.2 SC 2.3.1");
  assert.equal(TIMELINE_ACCESSIBILITY.autoplayCeilingMs, 3_000);
  assert.equal(TIMELINE_ACCESSIBILITY.maxFlashesPerSecond, 3);
  assert.equal(TIMELINE_ACCESSIBILITY.minCaptionsWhenSpeech, 3);
});

test("§2 色板与版面真的接到了时间线渲染上（不是纸面数值）", async () => {
  const area = await readFile(
    resolve("src/shell/video-editor/TimelineArea.tsx"),
    "utf8",
  );
  assert.match(area, /const RULER_HEIGHT = TIMELINE_LAYOUT\.rulerHeightPx/);
  assert.match(area, /const ROW_HEIGHT = TIMELINE_LAYOUT\.trackRowHeightPx/);
  assert.match(area, /const MIN_CLIP_WIDTH_PX = TIMELINE_LAYOUT\.minimumClipWidthPx/);
  assert.match(area, /const PLAYHEAD_WIDTH_PX = TIMELINE_LAYOUT\.playheadWidthPx/);
  assert.match(area, /TIMELINE_PALETTE\["tl\.bg"\]\.value/);
  assert.match(area, /TIMELINE_PALETTE\["tl\.grid"\]\.value/);
  assert.match(area, /TIMELINE_PALETTE\["tl\.playhead"\]\.value/);
  assert.match(area, /TIMELINE_PALETTE\["tl\.transition"\]\.value/);
  assert.match(area, /TIMELINE_CLIP_LABEL_COLORS\["tl\.clip\.video"\]/);
  assert.match(area, /TIMELINE_CLIP_LABEL_COLORS\["tl\.clip\.audio"\]/);
  // 旧的 tailwind 硬编码配色与 1px 红播放头不得残留。
  assert.doesNotMatch(area, /border-sky-300 bg-sky-100/);
  assert.doesNotMatch(area, /bg-emerald-100/);
  assert.doesNotMatch(area, /w-px bg-red-500/);
  // §2.2 C21：片段最小可视宽 24 px，不是原来的 6 px。
  assert.match(area, /Math\.max\(MIN_CLIP_WIDTH_PX, msToPx\(clip\.duration_ms\)\)/);
});

// --------------------------------------------------------------- §3 Schema

test("§3 Schema 落地：合规工程通过，必填/枚举/域/additionalProperties 逐条拦", () => {
  const ok = validateTimelineProjectIr(conformingIr());
  assert.equal(ok.ok, true, JSON.stringify(ok.errors ?? [], null, 2));

  const extra = validateTimelineProjectIr({ ...conformingIr(), mood: "calm" });
  assert.equal(extra.ok, false);
  assert.ok(extra.errors.some((e) => e.code === "additional-property" && e.path === "mood"));

  const clipExtra = conformingIr();
  clipExtra.tracks[0].clips[0].rotation = 12;
  const clipExtraResult = validateTimelineProjectIr(clipExtra);
  assert.equal(clipExtraResult.ok, false);
  assert.ok(
    clipExtraResult.errors.some(
      (e) => e.path === "tracks[0].clips[0].rotation" && e.code === "additional-property",
    ),
  );

  // §3 末段：交付容器锁死 mp4 且必须软件编码，codec 只允许 h264。
  const badCodec = conformingIr();
  badCodec.output.codec = "h265";
  const codecResult = validateTimelineProjectIr(badCodec);
  assert.equal(codecResult.ok, false);
  assert.ok(codecResult.errors.some((e) => e.path === "output.codec"));

  // C8 帧率取值集。
  const badFps = conformingIr();
  badFps.output.fps = 29;
  assert.equal(validateTimelineProjectIr(badFps).ok, false);

  // C15 轨数下限：至少视频 1 + 音频 1。
  const oneTrack = conformingIr();
  oneTrack.tracks = [oneTrack.tracks[0]];
  const oneTrackResult = validateTimelineProjectIr(oneTrack);
  assert.equal(oneTrackResult.ok, false);
  assert.ok(oneTrackResult.errors.some((e) => e.path === "tracks"));

  // IR track kind 是四值枚举，没有 image —— 内部 image 轨必须映射成 overlay。
  const badKind = conformingIr();
  badKind.tracks[0].kind = "image";
  assert.equal(validateTimelineProjectIr(badKind).ok, false);

  // C20 片段最短 400 ms。
  const shortClip = conformingIr();
  shortClip.tracks[0].clips[0].durationMs = 200;
  assert.equal(validateTimelineProjectIr(shortClip).ok, false);

  // 转场 5 种，wipe/cut 也在枚举内。
  assert.deepEqual([...TIMELINE_IR_TRANSITION_KINDS], [
    "cut",
    "crossfade",
    "fade-to-black",
    "wipe",
    "dissolve",
  ]);
  assert.equal(
    TIMELINE_IR_TRANSITION_KINDS.length,
    TIMELINE_CONSTANTS.C23_transitionKindCount,
  );
});

test("§3.2 `ir-validated → invalid`：片段越出成片时长即非法 IR", () => {
  const overrun = conformingIr();
  overrun.tracks[0].clips[4].durationMs = 12_000; // 19,200 + 12,000 > 24,000
  const result = validateTimelineProjectIr(overrun);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some(
      (e) => e.code === "clip-overruns-output" && e.path === "tracks[0].clips[4]",
    ),
    JSON.stringify(result.errors, null, 2),
  );
});

// ------------------------------------------------------------ §1.2 两种字节形态

test("§1.2 形态一：JSON IR 载入并确定性 roundtrip", () => {
  const project = conformingIr();
  const text = serializeTimelineProjectIr(project);
  const bytes = new TextEncoder().encode(text);
  const reparsed = parseTimelineSource(bytes);
  assert.deepEqual(reparsed, project);

  // 字段插入顺序不同，序列化结果必须逐字节相同。
  const shuffled = JSON.parse(
    JSON.stringify({
      attribution: project.attribution,
      audioMix: project.audioMix,
      captions: project.captions,
      transitions: project.transitions,
      tracks: project.tracks,
      output: project.output,
      description: project.description,
      title: project.title,
      version: project.version,
      schema: project.schema,
    }),
  );
  assert.equal(serializeTimelineProjectIr(shuffled), text);

  // 合规工程的 IR 字节自然过 §8.1 的 2,560 B 下限。
  assert.ok(
    bytes.byteLength >= TIMELINE_BYTE_FLOORS.irMinBytes,
    `合规 IR 仅 ${bytes.byteLength} B，未达 ${TIMELINE_BYTE_FLOORS.irMinBytes} B`,
  );

  assert.throws(
    () => parseTimelineSource("{ not json"),
    (error) => error.code === "video-ir-unparsable",
  );
  assert.throws(
    () => parseTimelineSource(JSON.stringify(HOLLOW_271B)),
    (error) => error.code === "video-ir-invalid",
  );
  // 271 B 空壳的字节量级本身就在下限之下。
  assert.ok(JSON.stringify(HOLLOW_271B).length < TIMELINE_BYTE_FLOORS.irMinBytes);
});

test("§1.2 形态二：mp4 逐 box 走通，缺 moov 与空壳被指出（F3 / F1）", () => {
  const healthy = inspectMp4Source(buildMp4(["ftyp", "moov", "mdat"], 2 * 1024 * 1024));
  assert.equal(healthy.ok, true, `${healthy.code} ${healthy.message}`);
  assert.deepEqual(healthy.boxes, ["ftyp", "moov", "mdat"]);
  assert.equal(healthy.hasFtyp, true);
  assert.equal(healthy.hasMoov, true);
  assert.equal(healthy.hasMdat, true);

  // F3：编码中断只产出裸流，缺 moov。
  const bare = inspectMp4Source(buildMp4(["ftyp", "mdat"], 2 * 1024 * 1024));
  assert.equal(bare.ok, false);
  assert.equal(bare.code, "video-mp4-missing-box");
  assert.match(bare.message, /lacks MP4 ftyp\/moov\/mdat boxes/);
  assert.equal(bare.hasMoov, false);

  // F1：box 齐全但字节不足 1 MiB。
  const hollow = inspectMp4Source(buildMp4(["ftyp", "moov", "mdat"], 64 * 1024));
  assert.equal(hollow.ok, false);
  assert.equal(hollow.code, "video-hollow");
  assert.ok(hollow.byteSize < TIMELINE_BYTE_FLOORS.sourceMinBytes);
});

// ================================================================ §3.3 重点

test("§3.3 preview rendition 恒等于源分辨率，缩小版一律拒（F5）", () => {
  const source = { width: 1_920, height: 1_080 };

  // preview 的目标尺寸没有「档位」可选，就是源尺寸。
  assert.deepEqual(previewRenditionSize(source), { width: 1_920, height: 1_080 });
  assert.deepEqual(previewRenditionSize({ width: 1_280, height: 720 }), {
    width: 1_280,
    height: 720,
  });

  // 同分辨率通过。
  const equal = assertPreviewResolution(source, { width: 1_920, height: 1_080 });
  assert.equal(equal.ok, true);
  assert.equal(equal.code, undefined);

  // 屏上取景画布是 1280 宽 —— 拿它当 preview 交付就是 F5，必须被拒。
  const downsampled = assertPreviewResolution(source, { width: 1_280, height: 720 });
  assert.equal(downsampled.ok, false);
  assert.equal(downsampled.code, "video-preview-resolution-mismatch");
  assert.match(downsampled.message, /禁止交付缩小版预览/);
  assert.deepEqual(downsampled.preview, { width: 1_280, height: 720 });
  assert.deepEqual(downsampled.source, { width: 1_920, height: 1_080 });

  // 规格 F5 点名的 640×360，以及只差一个像素的情况，都不许放过。
  assert.equal(assertPreviewResolution(source, { width: 640, height: 360 }).ok, false);
  assert.equal(assertPreviewResolution(source, { width: 1_920, height: 1_079 }).ok, false);
  assert.equal(assertPreviewResolution(source, { width: 1_919, height: 1_080 }).ok, false);
  // 放大也不算「同分辨率」。
  assert.equal(assertPreviewResolution(source, { width: 3_840, height: 2_160 }).ok, false);
});

test("§3.3 thumbnail MAY 缩小，但最小边 MUST ≥ 128 px（C36）", () => {
  const thumb = thumbnailRenditionSize({ width: 1_920, height: 1_080 });
  assert.ok(thumb.width <= 512, `长边 ${thumb.width} 应被限到 512 以内`);
  assert.ok(
    Math.min(thumb.width, thumb.height) >= TIMELINE_CONSTANTS.C36_minimumReviewedCoverEdgePx,
    `最小边 ${Math.min(thumb.width, thumb.height)} < 128`,
  );
  assert.equal(thumbnailResolutionOk(thumb), true);

  // 极端宽幅：短边不许被压到 128 以下。
  const wide = thumbnailRenditionSize({ width: 3_840, height: 360 });
  assert.ok(Math.min(wide.width, wide.height) >= 128, JSON.stringify(wide));
  assert.equal(thumbnailResolutionOk(wide), true);

  assert.equal(thumbnailResolutionOk({ width: 200, height: 100 }), false);

  // thumbnail 与 preview 是两件事：thumbnail 缩小合法，preview 缩小非法。
  assert.notDeepEqual(thumb, previewRenditionSize({ width: 1_920, height: 1_080 }));
});

test("§2.3 / C11 / C12 交付档位与分辨率一致，码率按档取", () => {
  assert.deepEqual(TIMELINE_DELIVERY_TIERS.standard, {
    widthPx: 1_920,
    heightPx: 1_080,
    videoBitrateKbps: 6_000,
  });
  assert.deepEqual(TIMELINE_DELIVERY_TIERS.light, {
    widthPx: 1_280,
    heightPx: 720,
    videoBitrateKbps: 3_000,
  });
  assert.equal(deliveryTierFor({ width: 1_920, height: 1_080 }), "standard");
  assert.equal(deliveryTierFor({ width: 1_280, height: 720 }), "light");
  // 落在档位之间的分辨率不认作任一档。
  assert.equal(deliveryTierFor({ width: 1_600, height: 900 }), null);

  assert.equal(defaultVideoBitrateKbps({ width: 1_920, height: 1_080 }), 6_000);
  assert.equal(defaultVideoBitrateKbps({ width: 1_280, height: 720 }), 3_000);
  const [minKbps, maxKbps] = TIMELINE_CONSTANTS.C10_videoBitrateDomainKbps;
  const odd = defaultVideoBitrateKbps({ width: 640, height: 360 });
  assert.ok(odd >= minKbps && odd <= maxKbps, `${odd} 越出 C10 域`);
});

test("§3.3 预览分辨率契约真的接在交付路径上（不是纸面判据）", async () => {
  const [engine, persistence, hook, contract] = await Promise.all([
    readFile(resolve("src/shell/video-editor/preview-engine.ts"), "utf8"),
    readFile(resolve("src/shell/video-editor/persistence.ts"), "utf8"),
    readFile(resolve("src/shell/video-editor/use-video-timeline.ts"), "utf8"),
    readFile(resolve("src/shell/video-editor/preview-contract.ts"), "utf8"),
  ]);

  // 引擎另起与源等大的离屏画布，交付前自查，不合格就抛。
  assert.match(engine, /captureRenditionCanvas\(/);
  assert.match(engine, /\?\s*previewRenditionSize\(source\)/);
  assert.match(engine, /:\s*thumbnailRenditionSize\(source, maxThumbnailEdgePx\)/);
  assert.match(engine, /if \(!verdict\.ok\)[\s\S]*throw new TimelineCarrierError/);

  // 屏上取景仍可被 PREVIEW_MAX_WIDTH 限，但那条路径只喂视口。
  assert.match(engine, /const PREVIEW_MAX_WIDTH = 1280/);
  assert.match(engine, /这是视口,不是交付物/);

  // 交付函数在上传前再复核一次分辨率。
  assert.match(persistence, /export async function timelinePreviewRenditionPng/);
  assert.match(persistence, /engine\.captureRenditionCanvas\("preview"\)/);
  assert.match(persistence, /assertPreviewResolution\(/);
  assert.match(persistence, /preview_resolution_contract/);

  // 保存草稿的 createPreview 不再复用取景画布。
  assert.match(hook, /timelinePreviewRenditionPng\(engineRef\.current, snapshot\)/);
  assert.doesNotMatch(hook, /timelineCoverPng\(previewCanvasRef\.current\)/);

  // 「预览契约」这个文件名下必须找得到 §3.3 的判据。
  assert.match(contract, /assertPreviewResolution/);
  assert.match(contract, /previewRenditionSize/);
  assert.match(contract, /thumbnailRenditionSize/);
});

test("§8.2 完备判据把 preview 降采样判为不合格", () => {
  const project = conformingIr();
  const base = {
    project,
    irBytes: 8_192,
    sourceBytes: 4 * 1024 * 1024,
    evidenceDurationMs: OUTPUT_DURATION_MS,
    evidenceWidth: 1_920,
    evidenceHeight: 1_080,
    mp4Boxes: ["ftyp", "moov", "mdat"],
    hasSpeech: true,
  };

  const matched = auditTimelineCompleteness({
    ...base,
    previewWidth: 1_920,
    previewHeight: 1_080,
  });
  assert.equal(matched.ok, true, JSON.stringify(matched.failed, null, 2));

  const shrunk = auditTimelineCompleteness({
    ...base,
    previewWidth: 1_280,
    previewHeight: 720,
  });
  assert.equal(shrunk.ok, false);
  assert.equal(shrunk.code, "video-hollow");
  assert.ok(shrunk.failed.some((entry) => entry.id === "preview==source"));
});

// ------------------------------------------------------------- §3.2 状态机

test("§3.2 状态机：合法迁移通、5 条非法迁移一条都不许", () => {
  assert.equal(timelineTransitionAllowed("empty", "ir-validated"), true);
  assert.equal(timelineTransitionAllowed("ir-validated", "clips-resolved"), true);
  assert.equal(timelineTransitionAllowed("clips-resolved", "rendered"), true);
  assert.equal(timelineTransitionAllowed("rendered", "muxed"), true);
  assert.equal(timelineTransitionAllowed("muxed", "ready"), true);
  assert.equal(timelineTransitionAllowed("clips-resolved", "degraded"), true);
  assert.equal(timelineTransitionAllowed("muxed", "invalid"), true);

  assert.equal(TIMELINE_ILLEGAL_TRANSITIONS.length, 5);
  const illegal = TIMELINE_ILLEGAL_TRANSITIONS.map(([a, b]) => `${a}->${b}`);
  assert.deepEqual(illegal, [
    "ir-validated->muxed",
    "degraded->ready",
    "rendered->ready",
    "invalid->rendered",
    "empty->ready",
  ]);
  for (const [from, to] of TIMELINE_ILLEGAL_TRANSITIONS) {
    assert.equal(timelineTransitionAllowed(from, to), false, `${from} → ${to}`);
    assert.throws(
      () => assertTimelineTransition(from, to),
      (error) => error.code === "video-illegal-transition",
      `${from} → ${to} 应抛受控错误`,
    );
  }
  // empty → ready 是 271 B 空壳的产生路径，必须封死。
  assert.equal(timelineTransitionAllowed("empty", "ready"), false);
  // rendered → ready 跳过封装，会产出缺 moov 的裸流。
  assert.equal(timelineTransitionAllowed("rendered", "ready"), false);
});

// ------------------------------------------------------- §8.1 / §8.2 完备判据

test("§8 271 B 空壳不合格，合规成片合格", () => {
  const hollow = auditTimelineCompleteness({
    project: HOLLOW_271B,
    irBytes: 271,
    sourceBytes: 0,
  });
  assert.equal(hollow.ok, false);
  assert.equal(hollow.code, "video-hollow");
  const failedIds = hollow.failed.map((entry) => entry.id);
  for (const id of [
    "ir-schema",
    "tracks>=2",
    "clips>=4",
    "duration>=6000ms",
    "transitions>=2",
    "integratedLufs∈[-15,-13]",
    "attribution>=1",
    "ir>=2560B",
    "mp4>=1048576B",
  ]) {
    assert.ok(failedIds.includes(id), `空壳应在 ${id} 上不合格：${failedIds.join(",")}`);
  }

  const good = auditTimelineCompleteness({
    project: conformingIr(),
    irBytes: 8_192,
    sourceBytes: 4 * 1024 * 1024,
    evidenceDurationMs: OUTPUT_DURATION_MS,
    evidenceWidth: 1_920,
    evidenceHeight: 1_080,
    previewWidth: 1_920,
    previewHeight: 1_080,
    mp4Boxes: ["ftyp", "moov", "mdat"],
    frameGridColorCounts: [40, 51, 33, 47, 62, 28, 39, 55, 44, 31, 58, 36],
    hasSpeech: true,
  });
  assert.equal(good.ok, true, JSON.stringify(good.failed, null, 2));
});

test("§8.1 字节下限拦的是「结构齐全但内容空洞」，不与 §8.2 结构判据重合", () => {
  // 每项结构判据都只踩着下限：2 轨、4 片段、2 转场、3 字幕、1 条署名，
  // 标题描述贴着 schema 的 8 字下限、字幕都是占位词。schema 过，§8.2 的
  // 结构条目也过。
  const skeleton = {
    schema: TIMELINE_PROJECT_SCHEMA_ID,
    version: 1,
    title: "海边短片占位工程",
    description: "占位描述占位描述",
    output: {
      widthPx: 1_920,
      heightPx: 1_080,
      fps: 30,
      durationMs: 8_000,
      videoBitrateKbps: 6_000,
      audioBitrateKbps: 160,
      codec: "h264",
    },
    tracks: [
      {
        id: "v",
        kind: "video",
        clips: [
          { id: "v1", startMs: 0, durationMs: 4_000 },
          { id: "v2", startMs: 4_000, durationMs: 4_000 },
        ],
      },
      {
        id: "a",
        kind: "audio",
        clips: [
          { id: "a1", startMs: 0, durationMs: 4_000 },
          { id: "a2", startMs: 4_000, durationMs: 4_000 },
        ],
      },
    ],
    transitions: [
      { atMs: 4_000, kind: "crossfade", durationMs: 500 },
      { atMs: 4_000, kind: "dissolve", durationMs: 500 },
    ],
    captions: [
      { startMs: 0, endMs: 1_000, text: "一" },
      { startMs: 1_000, endMs: 2_000, text: "二" },
      { startMs: 2_000, endMs: 3_000, text: "三" },
    ],
    audioMix: { integratedLufs: -14, truePeakDbtp: -1.2 },
    attribution: {
      entries: [
        {
          text: "占位署名",
          licenseCode: "CC0-1.0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        },
      ],
    },
  };

  assert.equal(validateTimelineProjectIr(skeleton).ok, true);
  const irBytes = new TextEncoder().encode(serializeTimelineProjectIr(skeleton)).byteLength;
  assert.ok(
    irBytes < TIMELINE_BYTE_FLOORS.irMinBytes,
    `骨架工程 ${irBytes} B 竟已过下限，字节闸失去意义`,
  );

  const report = auditTimelineCompleteness({
    project: skeleton,
    irBytes,
    sourceBytes: 4 * 1024 * 1024,
    evidenceDurationMs: 8_000,
    evidenceWidth: 1_920,
    evidenceHeight: 1_080,
    previewWidth: 1_920,
    previewHeight: 1_080,
    mp4Boxes: ["ftyp", "moov", "mdat"],
    hasSpeech: true,
  });
  assert.equal(report.ok, false);
  assert.equal(report.code, "video-hollow");
  // 唯一不合格项就是字节下限：结构条目全过，内容量不够。
  assert.deepEqual(
    report.failed.map((entry) => entry.id),
    ["ir>=2560B"],
    JSON.stringify(report.failed, null, 2),
  );
});

test("§8.2 逐条判据各自可判：时长漂移 / 分辨率 / 缺 box / 字幕 / 黑屏", () => {
  const project = conformingIr();
  const base = {
    project,
    irBytes: 8_192,
    sourceBytes: 4 * 1024 * 1024,
    evidenceWidth: 1_920,
    evidenceHeight: 1_080,
  };

  // C3：偏差 ≤ 1,500 ms，比音频的 2,500 ms 更严。
  const withinDrift = auditTimelineCompleteness({
    ...base,
    evidenceDurationMs: OUTPUT_DURATION_MS + 1_400,
  });
  assert.ok(!withinDrift.failed.some((e) => e.id === "duration-drift<=1500ms"));
  const overDrift = auditTimelineCompleteness({
    ...base,
    evidenceDurationMs: OUTPUT_DURATION_MS + 2_000,
  });
  assert.equal(overDrift.ok, false);
  assert.ok(overDrift.failed.some((e) => e.id === "duration-drift<=1500ms"));

  // 分辨率必须与 evidence 相等。
  const wrongSize = auditTimelineCompleteness({
    ...base,
    evidenceWidth: 1_280,
    evidenceHeight: 720,
  });
  assert.equal(wrongSize.ok, false);
  assert.ok(wrongSize.failed.some((e) => e.id === "resolution==evidence"));

  // 缺 moov。
  const missingBox = auditTimelineCompleteness({
    ...base,
    mp4Boxes: ["ftyp", "mdat"],
  });
  assert.equal(missingBox.ok, false);
  assert.ok(missingBox.failed.some((e) => e.id === "mp4 ftyp/moov/mdat"));

  // F6：字幕只烧不存 —— 有语音而 captions 少于 3 条。
  const burnedIn = conformingIr();
  burnedIn.captions = [burnedIn.captions[0]];
  const noCaptions = auditTimelineCompleteness({
    ...base,
    project: burnedIn,
    hasSpeech: true,
  });
  assert.equal(noCaptions.ok, false);
  assert.ok(noCaptions.failed.some((e) => e.id === "captions>=3"));

  // §8.2 无转场的多片段视频是硬切拼接。
  const noTransitions = conformingIr();
  delete noTransitions.transitions;
  const hardCuts = auditTimelineCompleteness({ ...base, project: noTransitions });
  assert.equal(hardCuts.ok, false);
  assert.ok(hardCuts.failed.some((e) => e.id === "transitions>=2"));

  // F2：黑屏成片 —— 4×3 网格里有帧颜色数 < 24（C42）。
  const blackFrames = auditTimelineCompleteness({
    ...base,
    frameGridColorCounts: [40, 51, 2, 47, 62, 28, 39, 55, 44, 31, 58, 36],
  });
  assert.equal(blackFrames.ok, false);
  assert.ok(blackFrames.failed.some((e) => e.id === "frame-grid colors>=24"));
});

test("§4 常量表关键项、§8.1 字节下限与 §8.1 末段 qualityPolicy 目标值", () => {
  assert.equal(TIMELINE_CONSTANTS.C1_minDurationMs, 6_000);
  assert.equal(TIMELINE_CONSTANTS.C2_maxDurationMs, 1_800_000);
  assert.equal(TIMELINE_CONSTANTS.C3_durationEvidenceToleranceMs, 1_500);
  assert.deepEqual([...TIMELINE_CONSTANTS.C4_standardResolution], [1_920, 1_080]);
  assert.deepEqual([...TIMELINE_CONSTANTS.C5_lightResolution], [1_280, 720]);
  assert.deepEqual([...TIMELINE_CONSTANTS.C8_fpsSet], [24, 25, 30, 50, 60]);
  assert.equal(TIMELINE_CONSTANTS.C15_minTracks, 2);
  assert.equal(TIMELINE_CONSTANTS.C16_maxTracks, 16);
  assert.equal(TIMELINE_CONSTANTS.C19_minTotalClips, 4);
  assert.equal(TIMELINE_CONSTANTS.C20_minClipDurationMs, 400);
  assert.equal(TIMELINE_CONSTANTS.C31_targetLufs, -14);
  assert.equal(TIMELINE_CONSTANTS.C36_minimumReviewedCoverEdgePx, 128);
  assert.equal(TIMELINE_CONSTANTS.C37_irMinBytes, 2_560);
  assert.equal(TIMELINE_CONSTANTS.C38_mp4MinBytes, 1_048_576);
  assert.equal(TIMELINE_CONSTANTS.C39_mp4MaxBytes, 2_147_483_648);
  // C40：单份 6 秒 1080p 软件编码约 2 分钟 —— 批产成本的依据。
  assert.equal(TIMELINE_CONSTANTS.C40_encodeWallClockCeilingMs, 120_000);
  assert.deepEqual([...TIMELINE_CONSTANTS.C41_frameGrid], [4, 3]);
  assert.equal(TIMELINE_CONSTANTS.C42_frameGridMinColors, 24);

  assert.deepEqual(TIMELINE_BYTE_FLOORS, {
    irMinBytes: 2_560,
    irMaxBytes: 2_097_152,
    sourceMinBytes: 1_048_576,
    sourceMaxBytes: 2_147_483_648,
  });
  assert.deepEqual(TIMELINE_QUALITY_POLICY_TARGET, {
    "minimumSourceBytesByEditorClass.video_editing": 1_048_576,
    minimumVideoDurationMs: 6_000,
  });
});

// ------------------------------------------------- §5.1 / §5.4 与现状对齐

test("§5.1 改片段必须改变成片（A6）", () => {
  const doc = projectIrToTimelineDoc(conformingIr());
  const before = timelineRenderDigest(doc);

  const moved = structuredClone(doc);
  moved.tracks[0].clips[1].start_ms += 1_000;
  assert.notEqual(timelineRenderDigest(moved), before);

  const retimed = structuredClone(doc);
  retimed.tracks[0].clips[1].duration_ms += 1_000;
  assert.notEqual(timelineRenderDigest(retimed), before);

  // 同一份工程重复求值必须稳定，否则「改了才变」这条判据没有意义。
  assert.equal(timelineRenderDigest(projectIrToTimelineDoc(conformingIr())), before);
});

test("TimelineDoc ↔ IR 桥接：image 轨映射 overlay，转场往返不丢", () => {
  const project = conformingIr();
  const doc = projectIrToTimelineDoc(project);

  assert.equal(doc.width, 1_920);
  assert.equal(doc.height, 1_080);
  assert.equal(doc.fps, 30);
  assert.equal(doc.tracks.length, 2);
  assert.equal(doc.tracks[0].kind, "video");
  assert.equal(doc.tracks[1].kind, "audio");
  // IR 的 crossfade / fade-to-black 回到内部模型的 crossfade / black。
  assert.deepEqual(doc.tracks[0].clips[1].transition_in, {
    type: "crossfade",
    duration_ms: 500,
  });
  assert.deepEqual(doc.tracks[0].clips[3].transition_in, {
    type: "black",
    duration_ms: 800,
  });

  const back = timelineDocToProjectIr(doc, {
    title: project.title,
    description: project.description,
    attribution: project.attribution.entries,
    captions: project.captions,
    audioMix: project.audioMix,
    durationMs: project.output.durationMs,
  });
  assert.deepEqual(back, project);

  // 内部 image 轨在 IR 里必须是 overlay —— IR 枚举没有 image。
  const withImage = structuredClone(doc);
  withImage.tracks.push({
    id: "ov-logo",
    kind: "image",
    clips: [
      { id: "ov-logo-a", source_url: "assets/logo.png", start_ms: 0, duration_ms: 4_000 },
    ],
  });
  const imageIr = timelineDocToProjectIr(withImage, {
    title: project.title,
    description: project.description,
    attribution: project.attribution.entries,
    durationMs: project.output.durationMs,
  });
  assert.equal(imageIr.tracks[2].kind, "overlay");
  assert.equal(validateTimelineProjectIr(imageIr).ok, true);
});

test("§5.4 安全与合规：闪光上限、自动播放上限、库存素材只作成分", () => {
  // C33 / SC 2.3.1：任意 1 秒窗口内全屏亮度反转 ≤ 3 次。
  assert.equal(TIMELINE_CONSTANTS.C33_maxFlashesPerSecond, 3);
  assert.equal(TIMELINE_ACCESSIBILITY.maxFlashesPerSecond, 3);
  // C34 / SC 1.4.2：MUST NOT 自动播放带声音的内容超过 3 秒。
  assert.equal(TIMELINE_CONSTANTS.C34_autoplayCeilingMs, 3_000);

  // ADR-05：pexels / pixabay 素材 MAY 作为成片内部成分（IR 里以 clip 出现），
  // MUST NOT 另开单件下载入口 —— IR 的 clip 没有任何下载/导出字段可挂。
  const project = conformingIr();
  const stockClip = project.tracks[0].clips[0];
  assert.match(stockClip.assetId, /^pexels\//);
  assert.equal(validateTimelineProjectIr(project).ok, true);
  const withDownload = conformingIr();
  withDownload.tracks[0].clips[0].downloadUrl = "https://cdn.example/ocean-wide.mp4";
  const rejected = validateTimelineProjectIr(withDownload);
  assert.equal(rejected.ok, false);
  assert.ok(
    rejected.errors.some(
      (e) => e.path === "tracks[0].clips[0].downloadUrl" && e.code === "additional-property",
    ),
  );
});
