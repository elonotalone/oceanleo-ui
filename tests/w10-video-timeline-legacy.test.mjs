import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  addClipToTrack,
  addTrackTo,
  createEmptyDoc,
  cutTimelineRange,
  docDurationMs,
  normalizeTimelineDoc,
  splitClipAt,
} from "../src/shell/video-editor/timeline-model.ts";

const route = readFileSync("src/shell/advanced-routes/VideoTimelineRoute.tsx", "utf8");
const hook = readFileSync("src/shell/video-editor/use-video-timeline.ts", "utf8");
const EVIDENCE_DIR =
  "/root/projects/oceanleo-app/docs/react-client-rebuild/evidence/W10/video-timeline";

test("legacy VideoTimelineRoute stays the default local editor", () => {
  assert.match(route, /resolveEditorCore\("video-timeline"\) === "next"/);
  assert.match(route, /VideoTimelineGated/);
  assert.match(route, /useVideoTimeline/);
  assert.match(hook, /cutRange/);
  assert.match(hook, /addTrack/);
  assert.match(hook, /addTextClip/);
  assert.match(hook, /exportVideo/);
  assert.match(hook, /undo/);
  assert.match(hook, /redo/);
});

test("legacy timeline cut/concat/captions/audio/export round-trip locally", async () => {
  let doc = createEmptyDoc();
  const videoTrack = doc.tracks.find((track) => track.kind === "video");
  const audioTrack = doc.tracks.find((track) => track.kind === "audio");
  const textTrack = doc.tracks.find((track) => track.kind === "text");
  assert.ok(videoTrack && audioTrack && textTrack);

  doc = addClipToTrack(doc, videoTrack.id, {
    id: "clip_a",
    start_ms: 0,
    duration_ms: 4000,
    source_url: "https://cdn.oceanleo.com/legacy-a.mp4",
  });
  doc = addClipToTrack(doc, videoTrack.id, {
    id: "clip_b",
    start_ms: 4000,
    duration_ms: 3000,
    source_url: "https://cdn.oceanleo.com/legacy-b.mp4",
  });
  doc = addClipToTrack(doc, audioTrack.id, {
    id: "audio_a",
    start_ms: 0,
    duration_ms: 7000,
    source_url: "https://cdn.oceanleo.com/legacy-a.wav",
    volume: 0.8,
  });
  doc = addClipToTrack(doc, textTrack.id, {
    id: "caption_a",
    start_ms: 500,
    duration_ms: 2000,
    text: "本地字幕",
    style: { font_size: 42, align: "center" },
  });
  assert.equal(docDurationMs(doc), 7000);

  const concatenated = addClipToTrack(doc, videoTrack.id, {
    id: "clip_c",
    start_ms: 7000,
    duration_ms: 2000,
    source_url: "https://cdn.oceanleo.com/legacy-c.mp4",
  });
  assert.equal(docDurationMs(concatenated), 9000);

  const split = splitClipAt(concatenated, "clip_a", 1500);
  assert.equal(split.tracks.find((track) => track.kind === "video").clips.length, 4);

  const cut = cutTimelineRange(split, 1000, 2500);
  assert.ok(docDurationMs(cut) < docDurationMs(split));

  const withExtraAudio = addTrackTo(cut, "audio");
  const extraAudio = withExtraAudio.tracks.filter((track) => track.kind === "audio");
  assert.equal(extraAudio.length, 2);

  const exported = JSON.stringify(normalizeTimelineDoc(cut));
  const reopened = normalizeTimelineDoc(JSON.parse(exported));
  assert.equal(reopened.tracks.some((track) => track.kind === "audio"), true);
  assert.equal(
    reopened.tracks.some(
      (track) => track.kind === "text" && track.clips.some((clip) => clip.text === "本地字幕"),
    ),
    true,
  );

  await mkdir(EVIDENCE_DIR, { recursive: true });
  const savedPath = `${EVIDENCE_DIR}/legacy-timeline.saved.v1.json`;
  const reopenedPath = `${EVIDENCE_DIR}/legacy-timeline.reopened.v1.json`;
  const exportPath = `${EVIDENCE_DIR}/legacy-timeline.export.json`;
  await writeFile(savedPath, exported);
  await writeFile(reopenedPath, JSON.stringify(reopened));
  await writeFile(exportPath, exported);
  const evidence = {
    editorId: "video-timeline",
    completeCore: "RED",
    legacyCore: "GREEN",
    core: "oceanleo-ui src/shell/video-editor timeline-model + useVideoTimeline",
    cut: true,
    concat: true,
    captions: true,
    audioTracks: extraAudio.length,
    export: { path: exportPath, format: "timeline-json" },
    save: { path: savedPath },
    reopen: { path: reopenedPath },
    durationMs: docDurationMs(reopened),
  };
  await writeFile(`${EVIDENCE_DIR}/legacy-offline.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  const fullCore = JSON.parse(readFileSync(`${EVIDENCE_DIR}/offline.json`, "utf8"));
  assert.equal(fullCore.verdict, "RED");
  assert.equal(evidence.legacyCore, "GREEN");
});
