import assert from "node:assert/strict";
import test from "node:test";
import { Model3DCollabSnapshotPolicy } from "../src/shell/media-editors/model3d-collab-snapshot.ts";
import { EntityEditSession, EntityUndoStack } from "../src/shell/video-editor/entity-undo.ts";
import { model3dToEntities, model3dFromEntities } from "../src/shell/collab/adapters/model3d.ts";

const scene = (checkpointUrl, operations = []) => ({ checkpointUrl, operations, view: {} });

test("checkpoint receipts do not add an authored collaboration step, while the next edit does", () => {
  const policy = new Model3DCollabSnapshotPolicy();
  const original = scene("r1");
  const copy = scene("r1", [{ id: "copy" }]);
  const savedCopy = scene("r2");
  assert.equal(policy.project("root", 0, true, original), original);
  assert.equal(policy.project("root", 1, true, copy), copy);
  assert.equal(policy.project("root", 1, true, savedCopy), copy);
  const deleted = scene("r2", [{ id: "delete" }]);
  assert.equal(policy.project("root", 2, true, deleted), deleted);
  assert.equal(policy.project("root", 2, true, scene("r3")), deleted);
});

test("readiness refreshes a loaded source without publishing a loading placeholder", () => {
  const policy = new Model3DCollabSnapshotPolicy();
  assert.equal(policy.project("root", 0, false, scene("")), null);
  const first = scene("r1");
  assert.equal(policy.project("root", 0, true, first), first);
  assert.equal(policy.project("root", 0, false, scene("")), null);
  const reloaded = scene("r2");
  assert.equal(policy.project("root", 0, true, reloaded), reloaded);
});

test("remote changes explicitly replace the same-revision baseline and survive later receipt-only renders", () => {
  const policy = new Model3DCollabSnapshotPolicy();
  const original = scene("r1");
  policy.project("root", 1, true, original);
  const remote = scene("r1", [{ id: "other-person" }]);
  policy.acceptRemote(remote, 1);
  assert.equal(policy.project("root", 1, true, scene("r2")), remote);
  const next = scene("r2", [{ id: "my-next-edit" }]);
  assert.equal(policy.project("root", 2, true, next), next);
  const otherDocument = scene("other-source");
  assert.equal(policy.project("other-root", 2, true, otherDocument), otherDocument);
});

test("real entity history restores the clone operation and checkpoint after a saved deletion", () => {
  const policy = new Model3DCollabSnapshotPolicy();
  const session = new EntityEditSession({ toEntities: model3dToEntities, fromEntities: model3dFromEntities,
    stack: new EntityUndoStack({ coalesceMs: 0 }) });
  const original = scene("r1");
  session.noteKnown(policy.project("root", 0, true, original));
  const clone = { id: "copy", kind: "presence", target: "clone:1", present: true, parent: "root", index: 1, spec: { kind: "clone", source: "base:0" } };
  const copied = scene("r1", [clone]);
  session.noteLocal(policy.project("root", 1, true, copied));
  session.noteLocal(policy.project("root", 1, true, scene("r2")));
  const deleted = scene("r2", [{ id: "delete", kind: "presence", target: "clone:1", parent: "root", index: 1, present: false }]);
  session.noteLocal(policy.project("root", 2, true, deleted));
  session.noteLocal(policy.project("root", 2, true, scene("r3")));
  const result = session.undo(deleted);
  assert.equal(result.skipped, 0);
  assert.equal(result.state.checkpointUrl, "r1");
  assert.deepEqual(result.state.operations, [clone]);
});
