/**
 * W6-r4: remaining host-side families load stored source, honor a shown
 * command, serialize the mutation, and reopen it. Missing/unreadable source
 * stays fail-closed. Game play preview has no host edit model.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { PDFDocument } from "pdf-lib";

import {
  audioSourcePersistenceAdmitted,
  model3dSourcePersistenceAdmitted,
  pdfSourcePersistenceAdmitted,
} from "../src/shell/advanced-routes/non-richdoc-source-gate.ts";
import { buildPdfCommandSurface } from "../src/shell/media-editors/pdf-command-surface.ts";
import {
  createBlankPdf,
  inspectPdf,
  rotatePdfPage,
} from "../src/shell/media-editors/pdf-operations.ts";
import { loadInitialPdfSource } from "../src/shell/media-editors/pdf-source.ts";
import { createVideoCommandSurface } from "../src/shell/video-editor/video-command-surface.ts";
import {
  addClipToTrack,
  createEmptyDoc,
  docDurationMs,
  findClip,
  isTimelineDoc,
  patchClipIn,
} from "../src/shell/video-editor/timeline-model.ts";
import {
  VIDEO_TIMELINE_MISSING_MEDIA,
  VIDEO_TIMELINE_MISSING_PROJECT,
  hydrateVideoTimelineDoc,
  planVideoTimelineSource,
  serializeVideoProjectEnvelope,
} from "../src/shell/video-editor/video-timeline-source.ts";
import { parseVideoProjectEnvelope } from "../src/shell/media-editors/source-integrity.mjs";

function stubCommit(payload) {
  return { revisionId: "rev-next", payload };
}

async function pageRotation(bytes, pageIndex = 0) {
  const document = await PDFDocument.load(bytes);
  return document.getPage(pageIndex).getRotation().angle;
}

// 10-23 D4：单实例 PDF 编辑器的指令面（media-editors/pdf-command-surface.ts）。
function livePdfEditor(initialBytes, pageCount) {
  let bytes = initialBytes;
  const editor = {
    bridge: {
      goToPage: () => undefined,
      searchHits: async () => [],
      revealHit: () => undefined,
      createAnnotation: () => true,
      pages: () => Array.from({ length: pageCount }, (_, index) => ({ index, size: { width: 595, height: 842 }, rotation: 0 })),
      annotationCount: () => 0,
    },
    loading: false,
    processing: false,
    pageCount,
    currentPage: 1,
    zoom: 100,
    dirty: false,
    error: "",
    editRevision: 0,
    currentBytes: () => bytes,
    async rotatePage(pageIndex, clockwise = true) {
      bytes = await rotatePdfPage(bytes, pageIndex, clockwise ? 90 : -90);
      editor.editRevision += 1;
      editor.dirty = true;
      return true;
    },
    async deletePage() {
      return false;
    },
  };
  return editor;
}

function liveVideoEditor(initialDoc) {
  let doc = structuredClone(initialDoc);
  const editor = {
    loadingSource: false,
    sourceReady: true,
    exporting: false,
    error: "",
    dirty: false,
    editRevision: 0,
    playheadMs: 0,
    playing: false,
    selectedClipId: "",
    get doc() {
      return doc;
    },
    get durationMs() {
      return docDurationMs(doc);
    },
    patchClip(clipId, patch) {
      doc = patchClipIn(doc, clipId, patch);
      editor.editRevision += 1;
      editor.dirty = true;
    },
    deleteClip() {
      return false;
    },
    cutRange() {
      return false;
    },
    setClipSpeed() {},
    async addMediaUrl() {},
    seek(ms) {
      editor.playheadMs = ms;
    },
  };
  return editor;
}

test("pdf: stored bytes hydrate, rotate command mutates, reopen restores rotation", async () => {
  const seed = await PDFDocument.load(await createBlankPdf());
  seed.insertPage(0, [595.28, 841.89]);
  let bytes = await seed.save();
  const pageCount = await inspectPdf(bytes);
  assert.equal(pageCount, 2);
  assert.equal(await pageRotation(bytes, 0), 0);

  const editor = livePdfEditor(bytes, pageCount);
  const surface = buildPdfCommandSurface(editor, {
    download: async () => "",
    save: async () => ({ ok: true, message: "saved" }),
  });
  assert.ok(surface.describe().some((spec) => spec.id === "pdf.rotate-page"));
  const result = await surface.run("pdf.rotate-page", { direction: "cw" });
  assert.equal(result.ok, true);

  const mutated = editor.currentBytes();
  assert.equal(await pageRotation(mutated, 0), 90);
  const committed = stubCommit(mutated);
  const reopenedCount = await inspectPdf(committed.payload);
  assert.equal(reopenedCount, 2);
  assert.equal(await pageRotation(committed.payload, 0), 90);

  await assert.rejects(
    () =>
      loadInitialPdfSource({
        source: "",
        siteId: "oceanleo",
        title: "缺源 PDF",
        signal: new AbortController().signal,
        allowBlank: false,
      }),
    /缺少可验证的源文件/,
  );
  assert.equal(
    pdfSourcePersistenceAdmitted({
      loading: false,
      failure: "PDF 源未成功载入",
      hasBytes: false,
    }).ok,
    false,
  );
});

test("video-timeline: envelope hydrates, volume command mutates, reopen restores", async () => {
  const doc = createEmptyDoc();
  const videoTrack = doc.tracks.find((track) => track.kind === "video");
  const withClip = addClipToTrack(doc, videoTrack.id, {
    id: "clip_video_1",
    start_ms: 0,
    duration_ms: 4000,
    source_url: "https://cdn.test/clip.mp4",
    volume: 1,
  });
  assert.equal(isTimelineDoc(withClip), true);
  const stored = serializeVideoProjectEnvelope(withClip);
  const loaded = hydrateVideoTimelineDoc(stored);
  assert.equal(findClip(loaded, "clip_video_1").clip.volume ?? 1, 1);

  const editor = liveVideoEditor(loaded);
  const surface = createVideoCommandSurface({
    editor,
    deliver: async () => {},
  });
  assert.ok(
    surface.describe().some((spec) => spec.id === "video-timeline.set-clip-volume"),
  );
  const result = await surface.run("video-timeline.set-clip-volume", {
    clipId: "clip_video_1",
    percent: 40,
  });
  assert.equal(result.ok, true);
  assert.equal(findClip(editor.doc, "clip_video_1").clip.volume, 0.4);

  const committed = stubCommit(serializeVideoProjectEnvelope(editor.doc));
  const reopened = parseVideoProjectEnvelope(committed.payload);
  assert.equal(findClip(reopened, "clip_video_1").clip.volume, 0.4);

  const missingProject = planVideoTimelineSource({
    artifactId: "vid-art",
    source: "artifact",
    kind: "video",
    meta: { editor_project_schema: "oceanleo.timeline.v1" },
  });
  assert.equal(missingProject.kind, "fail");
  assert.equal(missingProject.error, VIDEO_TIMELINE_MISSING_PROJECT);

  const missingMedia = planVideoTimelineSource({
    artifactId: "vid-art",
    revisionId: "vid-rev",
    source: "artifact",
    kind: "video",
    artifactType: "video",
    artifact: { artifactId: "vid-art", revisionId: "vid-rev" },
    meta: {},
  });
  assert.equal(missingMedia.kind, "fail");
  assert.equal(missingMedia.error, VIDEO_TIMELINE_MISSING_MEDIA);

  assert.throws(
    () => parseVideoProjectEnvelope("{not-json"),
    /无法解析/,
  );
});
