/**
 * W6-r4: remaining families get a real host-side load → mutate → serialize
 * → reopen, or an honest hosted/non-editable proof. Fail-closed stays.
 * These call live loaders and command surfaces, not registry metadata.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

import { inspectPdf, rotatePdfPage } from "../src/shell/media-editors/pdf-operations.ts";
import { audioSourcePersistenceAdmitted, pdfSourcePersistenceAdmitted } from "../src/shell/advanced-routes/non-richdoc-source-gate.ts";
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

// 10-23 D4：批注由 EmbedPDF 写（浏览器验收）；字节级可在 node 里跑的只剩页面整理。
test("pdf: stored bytes load, page rotation mutates, reopen keeps the rotation", async () => {
  const created = await PDFDocument.create();
  created.addPage([400, 400]);
  const original = await created.save();
  assert.equal(
    pdfSourcePersistenceAdmitted({
      loading: false,
      failure: null,
      hasBytes: original.length > 0,
    }).ok,
    true,
  );
  assert.equal(
    pdfSourcePersistenceAdmitted({
      loading: false,
      failure: null,
      hasBytes: false,
    }).ok,
    false,
  );

  const rotated = await rotatePdfPage(original, 0, 90);
  const committed = stubCommit(rotated);
  assert.equal(await inspectPdf(committed.payload), 1);
  const reopened = await PDFDocument.load(committed.payload);
  assert.equal(reopened.getPage(0).getRotation().angle, 90);
});

test("video-timeline: stored envelope loads, clip text mutates, reopen restores", () => {
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
