import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyDoc } from "../src/shell/video-editor/timeline-model.ts";
import {
  LEGACY_TIMELINE_SCHEMA,
  OPENVIDEO_PROJECT_SCHEMA,
  emptyOpenVideoProject,
  msToUs,
  usToMs,
} from "../src/shell/video-editor/designcombo/schema.ts";
import {
  VIDEO_LEGACY_READONLY_NOTICE,
  nextVideoConversionState,
  openVideoToTimelineDoc,
  planVideoLegacyConversion,
  timelineDocToOpenVideo,
} from "../src/shell/video-editor/designcombo/legacy-conversion.ts";

test("opening a legacy doc cannot jump to converted without request", () => {
  assert.equal(
    nextVideoConversionState("readonly", { type: "resolve" }),
    "readonly",
  );
  assert.equal(
    nextVideoConversionState("readonly", { type: "request" }),
    "converting",
  );
  assert.equal(
    nextVideoConversionState("converting", { type: "resolve" }),
    "converted",
  );
  assert.equal(
    nextVideoConversionState("converting", { type: "reject" }),
    "failed",
  );
});

test("empty legacy timeline is a human-readable failure", () => {
  const planned = planVideoLegacyConversion({
    doc: createEmptyDoc(),
    schema: LEGACY_TIMELINE_SCHEMA,
  });
  assert.equal(planned.ok, false);
  assert.match(planned.reason, /空的/);
});

test("a clip-bearing timeline maps into OpenVideo JSON and back", () => {
  const doc = createEmptyDoc();
  doc.tracks[0].clips.push({
    id: "c1",
    start_ms: 0,
    duration_ms: 2000,
    source_url: "https://example.com/a.mp4",
    in_ms: 0,
    source_duration_ms: 5000,
    speed: 1,
    volume: 1,
  });
  const planned = planVideoLegacyConversion({
    doc,
    schema: LEGACY_TIMELINE_SCHEMA,
  });
  assert.equal(planned.ok, true);
  assert.ok(Object.keys(planned.data.clips).length >= 1);
  const ovClip = planned.data.clips.c1;
  assert.ok(ovClip, "转换后必须还能找到片子 c1");
  assert.ok(ovClip.timing?.display, "新核片子必须带 display 时间");
  // 2000 ms × 1000 = 2_000_000 µs. Literal, not msToUs(2000) (A-105).
  const displayFrom = ovClip.timing.display.from;
  const displayTo = ovClip.timing.display.to;
  const displaySpan = displayTo - displayFrom;
  assert.equal(
    displayFrom,
    0,
    `片子从时间线 0 起；起点写成 ${displayFrom} 等于整段被挪走`,
  );
  assert.equal(
    displayTo,
    2_000_000,
    `2 秒的片子转过去变成了 ${displayTo / 1000} 毫秒`,
  );
  assert.equal(
    displaySpan,
    2_000_000,
    `2 秒的片子转过去变成了 ${displaySpan / 1000} 毫秒`,
  );
  assert.equal(
    ovClip.timing.duration,
    2_000_000,
    `2 秒的片子在新核里写成了 ${ovClip.timing.duration / 1000} 毫秒，不是 2 秒`,
  );
  const round = openVideoToTimelineDoc(planned.data);
  const video = round.tracks.find((track) => track.kind === "video");
  assert.equal(video.clips.length, 1);
  assert.equal(video.clips[0].source_url, "https://example.com/a.mp4");
  assert.equal(video.clips[0].duration_ms, 2000);
});

test("one second on the old timeline is one million microseconds in the new core", () => {
  assert.equal(
    msToUs(1000),
    1_000_000,
    "旧时间线 1 秒必须写成 1_000_000 微秒；写成 1000 微秒等于把 1 秒变成 1 毫秒",
  );
  assert.equal(
    usToMs(1_000_000),
    1000,
    "新核里 1_000_000 微秒必须读回 1 秒；少除 1000 会把 1 秒读成 1000 秒",
  );
  assert.equal(
    msToUs(2000),
    2_000_000,
    "2 秒必须是 2_000_000 微秒，不能因为往返还能解回 2000 毫秒就放过",
  );
  assert.equal(
    usToMs(2_000_000),
    2000,
    "2_000_000 微秒必须读回 2 秒",
  );
});

test("unknown payload explains why conversion cannot start", () => {
  const planned = planVideoLegacyConversion({ doc: { foo: 1 }, schema: "nope" });
  assert.equal(planned.ok, false);
  assert.match(planned.reason, /没有可识别/);
});

test("readonly notice is a complete sentence", () => {
  assert.match(VIDEO_LEGACY_READONLY_NOTICE, /只读/);
  assert.match(VIDEO_LEGACY_READONLY_NOTICE, /转换/);
});

test("new-core schema id is not the legacy id", () => {
  assert.notEqual(OPENVIDEO_PROJECT_SCHEMA, LEGACY_TIMELINE_SCHEMA);
  const empty = emptyOpenVideoProject();
  assert.equal(empty.tracks.length, 4);
  const mapped = timelineDocToOpenVideo(createEmptyDoc());
  assert.ok(mapped.settings.width > 0);
});

test("already-openvideo documents skip conversion and keep the source clips", () => {
  const existing = emptyOpenVideoProject();
  const planned = planVideoLegacyConversion({
    doc: existing,
    schema: OPENVIDEO_PROJECT_SCHEMA,
  });
  assert.equal(planned.ok, true);
  assert.match(planned.summary, /不用转换/);
});

test("planning conversion does not mutate the caller's timeline doc", () => {
  const doc = createEmptyDoc();
  doc.tracks[0].clips.push({
    id: "keep",
    start_ms: 0,
    duration_ms: 1000,
    source_url: "https://example.com/a.mp4",
  });
  const before = JSON.stringify(doc);
  planVideoLegacyConversion({ doc, schema: LEGACY_TIMELINE_SCHEMA });
  assert.equal(JSON.stringify(doc), before);
});

function textTrackOf(doc) {
  const track = doc.tracks.find((entry) => entry.kind === "text");
  assert.ok(track, "旧时间线必须有文字轨");
  return track;
}

function clipByText(project, text) {
  return Object.values(project.clips).find((clip) => clip.text === text);
}

function centerOf(transform) {
  return {
    x: transform.x + transform.width / 2,
    y: transform.y + transform.height / 2,
  };
}

test("title cards keep their on-canvas place and size; a caption bar is not a silent success", () => {
  const doc = createEmptyDoc();
  const canvasW = doc.width;
  const canvasH = doc.height;
  doc.tracks[0].clips.push({
    id: "video-keep",
    start_ms: 0,
    duration_ms: 4000,
    source_url: "https://example.com/a.mp4",
  });
  textTrackOf(doc).clips.push(
    {
      id: "title-card",
      start_ms: 0,
      duration_ms: 2000,
      text: "开场标题",
      style: { x: 0.5, y: 0.35, font_size: 120, align: "center" },
    },
    {
      id: "footer-note",
      start_ms: 2000,
      duration_ms: 1500,
      text: "底部说明",
      style: { x: 0.5, y: 0.88, font_size: 40, align: "center" },
    },
  );
  const planned = planVideoLegacyConversion({
    doc,
    schema: LEGACY_TIMELINE_SCHEMA,
  });
  assert.equal(planned.ok, true);
  assert.equal(
    planned.dropped.some((line) => /文字片段/.test(line)),
    false,
    "标题卡还在时，dropped 不该点名文字片段丢了",
  );
  assert.match(planned.summary, /已转成新时间线/);

  const title = clipByText(planned.data, "开场标题");
  const footer = clipByText(planned.data, "底部说明");
  assert.ok(title, "标题卡「开场标题」转换后还在，不能整段丢掉");
  assert.ok(footer, "文字「底部说明」转换后还在，不能整段丢掉");
  assert.ok(title.transform, "标题卡转换后必须有画面位置");
  assert.ok(footer.transform, "底部说明转换后必须有画面位置");

  const titleCenter = centerOf(title.transform);
  const footerCenter = centerOf(footer.transform);
  assert.ok(
    Math.abs(titleCenter.x - 0.5 * canvasW) <= 1,
    `标题卡横向中心必须保住（实际 ${titleCenter.x}，期望 ${0.5 * canvasW}）`,
  );
  assert.ok(
    Math.abs(titleCenter.y - 0.35 * canvasH) <= 1,
    `标题卡纵向中心必须保住，不能被改成底栏（实际 ${titleCenter.y}，期望 ${0.35 * canvasH}）`,
  );
  assert.ok(
    Math.abs(footerCenter.y - 0.88 * canvasH) <= 1,
    `底部说明的纵向中心必须保住（实际 ${footerCenter.y}，期望 ${0.88 * canvasH}）`,
  );
  assert.notEqual(
    title.transform.y,
    footer.transform.y,
    "两条文字的位置被写成同一个值，闸只锁了个数就会放过",
  );
  assert.ok(
    title.transform.height >= 120,
    `放大的标题不能被塞进 100px 字幕条（实际高度 ${title.transform.height}）`,
  );
  assert.ok(
    title.transform.width >= 120,
    `放大的标题宽度不能被写成一条细缝（实际宽度 ${title.transform.width}）`,
  );
  assert.notEqual(
    title.transform.width === 600 && title.transform.height === 100,
    true,
    "标题卡不能被写死成 600×100 字幕框",
  );
  assert.ok(
    Math.abs(titleCenter.y - (0.85 * canvasH)) > 40,
    "标题卡不能被静默改到画面下方字幕条的位置",
  );
  assert.equal(
    planned.data.clips["title-card"]?.text,
    "开场标题",
    "标题卡必须按原片段 id 写进新工程，不能换一条占位",
  );
});

test("dropping the text track is not a quiet converted summary", () => {
  const doc = createEmptyDoc();
  textTrackOf(doc).clips.push({
    id: "only-title",
    start_ms: 0,
    duration_ms: 1800,
    text: "只剩标题",
    style: { x: 0.5, y: 0.4, font_size: 96 },
  });
  const mapped = timelineDocToOpenVideo(doc);
  const kept = clipByText(mapped, "只剩标题");
  assert.ok(kept, "只有文字轨的旧时间线，转换后标题片段还在");
  assert.ok(kept.transform, "标题片段转换后必须有画面位置");
  assert.ok(
    Math.abs(centerOf(kept.transform).y - 0.4 * doc.height) <= 1,
    "只有文字轨时，标题位置仍然要保住",
  );
});
