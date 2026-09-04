import assert from "node:assert/strict";
import test from "node:test";

import { createEmptyDoc } from "../src/shell/video-editor/timeline-model.ts";
import {
  LEGACY_TIMELINE_SCHEMA,
  OPENVIDEO_PROJECT_SCHEMA,
  emptyOpenVideoProject,
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
  const round = openVideoToTimelineDoc(planned.data);
  const video = round.tracks.find((track) => track.kind === "video");
  assert.equal(video.clips.length, 1);
  assert.equal(video.clips[0].source_url, "https://example.com/a.mp4");
  assert.equal(video.clips[0].duration_ms, 2000);
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
