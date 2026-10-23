import test from "node:test";
import assert from "node:assert/strict";
import { loadModel3DCollabRevision } from "../src/shell/media-editors/model3d-collab-revision.ts";

test("own receipts require the complete immutable identity, including async fetch races", async () => {
  const own = new Set(["A:r1"]);
  let calls = 0;
  const isOwn = (artifact, revision) => own.has(`${artifact}:${revision}`);
  const fetchRevision = async () => { calls++; return { checkpointUrl: "remote.glb", operations: [] }; };
  assert.equal(await loadModel3DCollabRevision("A", "r1", isOwn, fetchRevision), null);
  assert.equal(calls, 0);
  assert.equal((await loadModel3DCollabRevision("B", "r1", isOwn, fetchRevision)).checkpointUrl, "remote.glb");
  assert.equal((await loadModel3DCollabRevision("A", "r2", isOwn, fetchRevision)).checkpointUrl, "remote.glb");
  assert.equal(await loadModel3DCollabRevision("A", "r3", isOwn, async () => {
    own.add("A:r3"); return { checkpointUrl: "own.glb" };
  }), null);
});

test("genuine typed remote manifest reconstructs its canonical GLB and source identity", async () => {
  const state = await loadModel3DCollabRevision("A", "remote", () => false, async (artifact, revision, pick) => {
    assert.equal(pick({ artifactId: artifact, revisionId: revision, url: "https://models/remote.glb", format: "glb",
      meta: { editor: "three-gltf-editor-v2", editor_manifest_url: "https://models/remote.json" },
      artifact: { renditions: { source: { digest: "sha256:remote" } } } }), "https://models/remote.json");
    return { checkpointUrl: "", operations: [], view: { exposure: 1.7, annotations: [{ id: "note", text: "remote" }] } };
  });
  assert.equal(state.checkpointUrl, "https://models/remote.glb");
  assert.equal(state.provenance.artifactId, "A");
  assert.equal(state.provenance.revisionId, "remote");
  assert.equal(state.provenance.sourceDigest, "sha256:remote");
  assert.equal(state.view.exposure, 1.7);
  assert.equal(state.view.annotations[0].text, "remote");
});

test("failed manifest or missing canonical source never applies an empty scene", async () => {
  assert.equal(await loadModel3DCollabRevision("A", "remote", () => false, async () => null), null);
  assert.equal(await loadModel3DCollabRevision("A", "remote", () => false, async () => ({ checkpointUrl: "", operations: [] })), null);
});
