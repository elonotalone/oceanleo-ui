import assert from "node:assert/strict";
import test from "node:test";
import { createVideoProject, projectHead, projectTimelineDocument, buildTimelineFromApprovedTakes, configureTimelineNode, attachFinalRenderAsset, recordTimelineHandoff } from "../src/shell/video-canvas/engine/project-model.ts";
import { hydrateVideoTimelineDoc, timelineDocForStorage, resolveVideoTimelineReferences } from "../src/shell/video-editor/video-timeline-source.ts";
import { isTimelineDoc, normalizeTimelineDoc } from "../src/shell/video-editor/timeline-model.ts";
import { PW_VB_MESSAGES } from "../src/i18n/ui/messages/pw-vb-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";

function fixture() {
  const project = createVideoProject("Film");
  const version = project.versions[project.headVersionId];
  version.scenes = [{ sceneId: "scene", title: "Scene", shotIds: ["shot-b", "shot-a", "shot-c"] }];
  version.shots = ["a", "b", "c"].map((id) => ({ shotId: `shot-${id}`, sceneId: "scene", title: id,
    intendedDurationSeconds: 3, storyboardId: `sb-${id}`, takeIds: [`take-${id}`], approvedTakeId: `take-${id}` }));
  version.storyboards = ["a", "b", "c"].map(id => ({ storyboardId: `sb-${id}`, shotId: `shot-${id}`, frameAssetIds: [] }));
  version.takes = ["a", "b", "c"].map((id) => ({ takeId: `take-${id}`, shotId: `shot-${id}`, assetId: id, status: id === "c" ? "candidate" : "approved" }));
  version.timelines = [{ timelineId: "main", title: "Cut", clipIds: [] }];
  version.clips = [];
  version.graph.nodes = [
    { nodeId: "output", kind: "delivery", title: "Output", position: { x: 0, y: 0 }, localEditRecipe: [], params: { ratio: "9:16", fps: 24 } },
    { nodeId: "caption", kind: "subtitle", title: "Caption", text: "A subtitle", shotId: "shot-a", position: { x: 0, y: 0 }, localEditRecipe: [], params: { startMs: 200, durationMs: 1400 } },
    { nodeId: "voice", kind: "audio", title: "Voice", assetId: "voice", shotId: "shot-a", position: { x: 0, y: 0 }, localEditRecipe: [], params: { startMs: 0, durationMs: 1500, volume: 0.8 } },
    { nodeId: "music", kind: "audio", title: "Music", assetId: "music", position: { x: 0, y: 0 }, localEditRecipe: [], params: { startMs: 0, volume: 0.3 } },
    { nodeId: "unused", kind: "subtitle", title: "Not approved", shotId: "shot-c", text: "Do not include", position: { x: 0, y: 0 }, localEditRecipe: [] },
  ];
  for (const [id, kind, seconds] of [["a", "video", 3], ["b", "video", 2], ["c", "video", 9], ["voice", "audio", 2], ["music", "audio", 12]]) {
    project.assets[id] = { assetId: id, title: id, kind, origin: "provider", immutable: true, createdAt: "2026-11-15T00:00:00Z", url: `https://cdn.oceanleo.com/${id}.${kind === "audio" ? "wav" : "mp4"}`, durationSeconds: seconds };
  }
  return project;
}

test("compose uses storyboard order, approved shots only and delivery aspect/fps", () => {
  const project = fixture();
  const composed = projectTimelineDocument(project);
  assert.deepEqual(composed.document.tracks[0].clips.map((c) => c.source_url), [project.assets.b.url, project.assets.a.url]);
  assert.deepEqual(composed.document.tracks[0].clips.map((c) => [c.start_ms, c.duration_ms]), [[0, 2000], [2000, 3000]]);
  assert.deepEqual([composed.document.width, composed.document.height, composed.document.fps], [1080, 1920, 24]);
  const built = buildTimelineFromApprovedTakes(project).project;
  assert.deepEqual(projectHead(built).clips.map((c) => c.assetId), ["b", "a"]);
});

test("compose includes timed subtitles, voice/music tracks and volume without unapproved subtitles", () => {
  const { document, inputAssetIds } = projectTimelineDocument(fixture());
  const text = document.tracks.find((t) => t.kind === "text").clips;
  assert.equal(text.length, 1);
  assert.deepEqual([text[0].text, text[0].start_ms, text[0].duration_ms], ["A subtitle", 2200, 1400]);
  const audio = document.tracks.filter((t) => t.kind === "audio").map((t) => t.clips[0]);
  assert.deepEqual(audio.map((c) => [c.start_ms, c.duration_ms, c.volume]), [[2000, 1500, 0.8], [0, 5000, 0.3]]);
  assert.deepEqual(inputAssetIds, ["b", "a", "voice", "music"]);
});

test("one handover document passes the actual timeline parser and preserves full asset URLs, timing and settings", () => {
  const project = fixture();
  project.assets.a.url += `?signature=${"long".repeat(60)}`;
  const composed = projectTimelineDocument(project);
  const envelope = JSON.parse(composed.projectDocument);
  assert.equal(envelope.schema, "oceanleo.timeline.v1");
  assert.equal(envelope.version, 1);
  assert.equal(isTimelineDoc(envelope.data), true);
  assert.deepEqual(hydrateVideoTimelineDoc(composed.projectDocument), composed.document);
  assert.deepEqual(composed.document, normalizeTimelineDoc(composed.document));
  assert.equal(envelope.canvasSource.projectId, project.projectId);
  assert.equal(envelope.canvasSource.projectVersionId, project.headVersionId);
  assert.deepEqual(envelope.canvasSource.shots.map((s) => s.shotId), ["shot-b", "shot-a"]);
  assert.equal(envelope.data.tracks[0].clips[1].source_url, project.assets.a.url);
});

test("delivery settings can change size, aspect and frame rate without changing approved sources", () => {
  let project = configureTimelineNode(fixture(), "output", "width", 720);
  project = configureTimelineNode(project, "output", "height", 1280);
  project = configureTimelineNode(project, "output", "fps", 60);
  let doc = projectTimelineDocument(project).document;
  assert.deepEqual([doc.width, doc.height, doc.fps], [720, 1280, 60]);
  project = configureTimelineNode(project, "output", "ratio", "1:1");
  doc = projectTimelineDocument(project).document;
  assert.deepEqual([doc.width, doc.height], [1080, 1080]);
  assert.throws(() => configureTimelineNode(project, "voice", "width", 123));
  assert.throws(() => configureTimelineNode(project, "output", "fps", NaN));
});

test("approved missing video and missing audio fail before rendering; rejected-only canvas cannot compose", () => {
  const project = fixture();
  delete project.assets.voice;
  assert.throws(() => projectTimelineDocument(project), /音轨缺少可用音频/);
  delete project.assets.a;
  assert.throws(() => projectTimelineDocument(project), /镜头缺少可用视频/);
  for (const take of project.versions[project.headVersionId].takes) take.status = "candidate";
  assert.throws(() => projectTimelineDocument(project), /批准视频候选/);
});

test("film delivery and timeline handover persist Library identities and input lineage on the canvas", () => {
  const project = fixture();
  const item = { artifactId: "film-root", revisionId: "film-revision" };
  const cut = projectTimelineDocument(project);
  const delivered = attachFinalRenderAsset(project, { kind: "video", origin: "provider", title: "Film", url: "https://cdn.oceanleo.com/film.mp4", libraryItem: item }, cut.inputAssetIds, "canvas.timeline.final-render");
  assert.deepEqual(delivered.asset.libraryItem, item);
  assert.equal(projectHead(delivered.project).graph.nodes.find((n) => n.kind === "delivery").assetId, delivered.asset.assetId);
  assert.deepEqual(delivered.project.lineage.map((l) => l.parentAssetId), cut.inputAssetIds);
  const handed = recordTimelineHandoff(delivered.project, { artifactId: "timeline-root", revisionId: "timeline-revision" }, project.headVersionId);
  assert.equal(handed.timelineHandoff.projectVersionId, project.headVersionId);
  assert.equal(handed.timelineHandoff.artifactId, "timeline-root");
});

test("compose/delivery copy contains every message in every supported locale", () => {
  const keys = Object.keys(PW_VB_MESSAGES.zh);
  for (const locale of LOCALES) {
    assert.deepEqual(Object.keys(PW_VB_MESSAGES[locale]), keys);
    for (const value of Object.values(PW_VB_MESSAGES[locale])) assert.ok(typeof value === "string" && value.length > 0, locale);
  }
});


test("private canvas sources remain owner-checked references through handover, hydration and storage", async () => {
  const project = fixture();
  const ref = { artifactId: "11111111-1111-4111-8111-111111111111", revisionId: "22222222-2222-4222-8222-222222222222", path: "assets/a.mp4", sha256: "a".repeat(64), byteSize: 1234, mediaType: "video/mp4" };
  project.assets.a.sourceDependency = ref;
  delete project.assets.a.url;
  const composed = projectTimelineDocument(project);
  const stored = hydrateVideoTimelineDoc(composed.projectDocument);
  const clip = stored.tracks[0].clips[1];
  assert.deepEqual(clip.source_ref, { artifactId: ref.artifactId, revisionId: ref.revisionId, path: ref.path });
  assert.equal(clip.source_url, undefined);
  let grants = 0;
  const runtime = await resolveVideoTimelineReferences(stored, async (source) => {
    grants++; assert.deepEqual(source, clip.source_ref); return "https://api.example.test/v1/artifact-renditions/access/temporary-test";
  });
  assert.equal(grants, 1);
  assert.match(runtime.tracks[0].clips[1].source_url, /temporary-test/);
  assert.equal(timelineDocForStorage(runtime).tracks[0].clips[1].source_url, undefined);
  assert.equal(JSON.stringify(timelineDocForStorage(runtime)).includes("temporary-test"), false);
  assert.equal(JSON.stringify(stored).includes("temporary-test"), false);
  const malformed = structuredClone(stored);
  malformed.tracks[0].clips[1].source_ref.path = "../other-owner";
  assert.equal(isTimelineDoc(malformed), false);
});


test("compose rejects a cut beyond the renderer clip limit before any server work", () => {
  const project = fixture();
  const head = project.versions[project.headVersionId];
  for (let index = 0; index < 120; index++) head.graph.nodes.push({
    nodeId: `extra-caption-${index}`, kind: "subtitle", title: "Caption", text: "Subtitle",
    position: { x: 0, y: 0 }, localEditRecipe: [], durationSeconds: 1,
  });
  assert.throws(() => projectTimelineDocument(project), /片段或音轨太多/);
});
