/**
 * W6-r2: valid stored source loads, a representative edit mutates it, a commit
 * stub receives the modified payload, and reopening restores that payload.
 * Failure regressions stay fail-closed (no blank overwrite).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  storedEditorProjectUrl,
} from "../src/shell/advanced-routes/stored-editor-project.ts";
import { blankDesignDocument } from "../src/shell/design-canvas/blank-design-document.ts";
import {
  hydrateDesignCanvasSource,
  planDesignCanvasSource,
  serializeDesignCanvasSource,
} from "../src/shell/design-canvas/design-canvas-source.ts";
import { parseDesignDocumentProject } from "../src/shell/image-editor/design-document-schema.ts";
import {
  createFabricImageProject,
  parseFabricImageProject,
} from "../src/shell/image-editor/editor-persistence.ts";
import { imageSaveAdmitted } from "../src/shell/image-editor/image-source-ready.ts";
import { parseVideoProjectEnvelope } from "../src/shell/media-editors/source-integrity.mjs";
import {
  addClipToTrack,
  createEmptyDoc,
  isTimelineDoc,
  patchClipIn,
} from "../src/shell/video-editor/timeline-model.ts";

function stubCommit(payload) {
  return { revisionId: "rev-next", payload };
}

test("stored projects skip credentialed source-tree descriptors for readable delivery bytes", async () => {
  const sourceTree = "/v1/artifacts/00000000-0000-4000-8000-000000000001/revisions/00000000-0000-4000-8000-000000000002/source-tree/@source";
  const project = blankDesignDocument("已有设计稿的完整工程标题");
  const deliveryUrl = "https://files.example.test/design.json";
  const item = {
    artifactId: "design-root",
    meta: { editor_project_url: sourceTree },
    artifact: { renditions: { source: { url: sourceTree } } },
    url: deliveryUrl,
  };
  assert.equal(storedEditorProjectUrl(item), deliveryUrl);
  let fetched = "";
  const result = await hydrateDesignCanvasSource(planDesignCanvasSource(item), async (url) => {
    fetched = url;
    return serializeDesignCanvasSource(project);
  });
  assert.equal(result.ok, true);
  assert.equal(fetched, deliveryUrl);
  assert.equal(storedEditorProjectUrl({ artifact: item.artifact }), "");
});

test("design: valid remote design-document loads, title edit serializes, reopen restores", async () => {
  const stored = blankDesignDocument("本地设计稿 W10");
  const plan = planDesignCanvasSource({
    artifactId: "design-art",
    meta: { editor_project_url: "https://cdn.test/design.json" },
  });
  assert.equal(plan.kind, "remote");
  const loaded = await hydrateDesignCanvasSource(plan, async () =>
    JSON.stringify(stored),
  );
  assert.equal(loaded.ok, true);
  const edited = { ok: true, project: { ...loaded.project, title: "修订后的设计稿标题" } };
  assert.equal(edited.ok, true);
  const committed = stubCommit(serializeDesignCanvasSource(edited.project));
  const reopened = parseDesignDocumentProject(committed.payload);
  assert.equal(reopened.title, "修订后的设计稿标题");

  const invalid = planDesignCanvasSource({
    artifactId: "design-art",
    meta: { designDocument: { not: "oceanleo.design-document.v1" } },
  });
  assert.equal(invalid.kind, "fail");
});

test("image: save refuses blank overwrite until sourceReady; snapshot edit reopens", () => {
  assert.equal(
    imageSaveAdmitted({
      loading: false,
      sourceReady: false,
      sceneDiagnostic: { message: "分层工程缺失" },
    }).ok,
    false,
  );
  assert.equal(
    imageSaveAdmitted({
      loading: false,
      sourceReady: true,
      sceneDiagnostic: null,
    }).ok,
    true,
  );
  const snapshot = {
    json: { objects: [{ type: "rect", fill: "#111111" }] },
    doc: { width: 1080, height: 1080 },
    canvasBackground: "#ffffff",
  };
  const project = createFabricImageProject(snapshot);
  const edited = createFabricImageProject({
    ...snapshot,
    json: { objects: [{ type: "rect", fill: "#ff00aa" }] },
    canvasBackground: "#112233",
  });
  const committed = stubCommit(JSON.stringify(edited));
  const reopened = parseFabricImageProject(JSON.parse(committed.payload));
  assert.ok(reopened);
  assert.equal(reopened.snapshot.canvasBackground, "#112233");
  assert.equal(reopened.snapshot.json.objects[0].fill, "#ff00aa");
  assert.equal(project.snapshot.canvasBackground, "#ffffff");
});

test("video-timeline: valid stored envelope loads, clip edit serializes, reopen restores text", () => {
  const doc = createEmptyDoc();
  const textTrack = doc.tracks.find((track) => track.kind === "text");
  const withClip = addClipToTrack(doc, textTrack.id, {
    id: "clip_text_1",
    start_ms: 0,
    duration_ms: 3000,
    text: "片头字幕",
  });
  assert.equal(isTimelineDoc(withClip), true);
  const envelope = JSON.stringify({
    schema: "oceanleo.timeline.v1",
    version: 1,
    data: withClip,
  });
  const loaded = parseVideoProjectEnvelope(envelope);
  const edited = patchClipIn(loaded, "clip_text_1", { text: "修订后的字幕" });
  const committed = stubCommit(
    JSON.stringify({ schema: "oceanleo.timeline.v1", version: 1, data: edited }),
  );
  const reopened = parseVideoProjectEnvelope(committed.payload);
  assert.equal(
    reopened.tracks.find((track) => track.kind === "text").clips[0].text,
    "修订后的字幕",
  );
});
