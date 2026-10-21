import test from "node:test";
import assert from "node:assert/strict";
import { durableVideoSaveReceipt } from "../src/shell/workflow-carrier/video-canvas-save-receipt.ts";

const artifactId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const expectedRevisionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const nextRevisionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function committedItem(revisionId = nextRevisionId, previousRevisionId = expectedRevisionId) {
  return {
    artifactId,
    revisionId,
    artifactType: "workflow",
    meta: { previous_revision_id: previousRevisionId },
    artifact: {
      artifactId,
      revisionId,
      artifactType: "workflow",
      editorCapability: "video-canvas",
      sourceFormat: "oceanleo.video.project.v2",
      integrity: { ok: true },
      renditions: {
        source: { purpose: "source", revisionId },
        preview: { purpose: "preview", revisionId, digest: `sha256:${"d".repeat(64)}` },
      },
    },
  };
}

test("video save receipt requires a same-root complete new revision", () => {
  const expected = { artifactId, expectedRevisionId };
  assert.equal(durableVideoSaveReceipt(committedItem(), expected), true);
  assert.equal(
    durableVideoSaveReceipt(committedItem(), {
      ...expected,
      seenRevisionIds: new Set([nextRevisionId]),
    }),
    false,
    "a previously observed same-root revision is not a new commit receipt",
  );

  assert.equal(durableVideoSaveReceipt(committedItem(expectedRevisionId), expected), false);
  const wrongRoot = committedItem();
  wrongRoot.artifactId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  assert.equal(durableVideoSaveReceipt(wrongRoot, expected), false);

  const stalePreview = committedItem();
  stalePreview.artifact.renditions.preview.revisionId = expectedRevisionId;
  assert.equal(durableVideoSaveReceipt(stalePreview, expected), false);

  const incomplete = committedItem();
  delete incomplete.artifact.renditions;
  assert.doesNotThrow(() => durableVideoSaveReceipt(incomplete, expected));
  assert.equal(durableVideoSaveReceipt(incomplete, expected), false);

  const wrongParent = committedItem(nextRevisionId, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee");
  assert.equal(durableVideoSaveReceipt(wrongParent, expected), false);
});
