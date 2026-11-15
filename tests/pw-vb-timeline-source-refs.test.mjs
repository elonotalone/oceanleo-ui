import assert from "node:assert/strict";
import test from "node:test";
import { isTimelineDoc } from "../src/shell/video-editor/timeline-model.ts";
import { hydrateVideoTimelineDoc, serializeVideoProjectEnvelope, resolveVideoTimelineReferences, timelineDocForStorage } from "../src/shell/video-editor/video-timeline-source.ts";

function document() {
  const source_ref = { artifactId: "11111111-1111-4111-8111-111111111111", revisionId: "22222222-2222-4222-8222-222222222222", path: "assets/video.mp4" };
  return { width: 720, height: 1280, fps: 24, tracks: [{ id: "video", kind: "video", clips: [
    { id: "a", start_ms: 0, duration_ms: 1000, source_ref },
    { id: "b", start_ms: 1000, duration_ms: 1000, source_ref },
  ] }] };
}

test("generic private timeline sources pass the parser, resolve once per dependency and never persist access URLs", async () => {
  const source = document();
  assert.equal(isTimelineDoc(source), true);
  let grants = 0;
  const runtime = await resolveVideoTimelineReferences(source, async () => { grants++; return "https://api.example.test/v1/artifact-renditions/access/test-only"; });
  assert.equal(grants, 1);
  assert.equal(runtime.tracks[0].clips[1].source_url, runtime.tracks[0].clips[0].source_url);
  assert.equal(source.tracks[0].clips[0].source_url, undefined);
  assert.equal(JSON.stringify(timelineDocForStorage(runtime)).includes("test-only"), false);
  const serialized = serializeVideoProjectEnvelope(runtime);
  assert.equal(serialized.includes("test-only"), false);
  assert.equal(hydrateVideoTimelineDoc(serialized).tracks[0].clips[0].source_url, undefined);
});

test("invalid private reference identities and traversal paths fail timeline parsing", () => {
  for (const bad of [{ path: "../secret.mp4" }, { artifactId: "not-an-artifact" }, { revisionId: "wrong-revision" }, { path: "/absolute" }]) {
    const value = document();
    Object.assign(value.tracks[0].clips[0].source_ref, bad);
    assert.equal(isTimelineDoc(value), false);
  }
});

test("private access failure remains visible and cannot turn into a flat or empty timeline", async () => {
  const source = document();
  await assert.rejects(resolveVideoTimelineReferences(source, async () => { throw new Error("access removed"); }), /access removed/);
  assert.equal(source.tracks[0].clips.length, 2);
  assert.ok(source.tracks[0].clips[0].source_ref);
});
