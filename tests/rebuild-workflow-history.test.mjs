import assert from "node:assert/strict";
import test from "node:test";

import {
  VideoCanvasGraphHistory,
  shouldPreserveDirtyWorkflowGraph,
  videoCanvasGraphsEqual,
} from "../src/shell/workflow-carrier/video-canvas-history.ts";

const graph = (...nodes) => ({ nodes, edges: [] });

test("workflow graph history undoes and redoes immutable graph snapshots", () => {
  const initial = graph({ id: "n1", x: 0, y: 0 });
  const moved = graph({ id: "n1", x: 40, y: 12 });
  const connected = {
    nodes: moved.nodes,
    edges: [{ id: "e1", fromNodeId: "n1", toNodeId: "n2" }],
  };
  const history = new VideoCanvasGraphHistory();
  history.reset(initial);

  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
  history.record(moved);
  history.record(connected);
  assert.equal(history.canUndo, true);
  assert.deepEqual(history.undo(), moved);
  assert.equal(history.canRedo, true);
  assert.deepEqual(history.undo(), initial);
  assert.equal(history.canUndo, false);
  assert.deepEqual(history.redo(), moved);
  assert.deepEqual(history.redo(), connected);
  assert.equal(history.canRedo, false);

  history.undo();
  history.record(graph({ id: "n1", x: 80, y: 12 }));
  assert.equal(history.canRedo, false, "a new edit clears the redo branch");
});

test("workflow graph equality notices node moves and accepts identical snapshots", () => {
  assert.equal(videoCanvasGraphsEqual(graph({ id: "n1", x: 0, y: 0 }), graph({ id: "n1", x: 0, y: 0 })), true);
  assert.equal(videoCanvasGraphsEqual(graph({ id: "n1", x: 0, y: 0 }), graph({ id: "n1", x: 1, y: 0 })), false);
});

test("dirty history survives its own save receipt, but resets for external source changes", () => {
  const base = {
    dirty: true,
    loadedReloadNonce: 0,
    reloadNonce: 0,
    loadedRootId: "artifact-1",
    sourceRootId: "artifact-1",
    loadedRevisionId: "rev-1",
    sourceRevisionId: "rev-1",
    ownSaveRevisionId: "",
  };
  assert.equal(shouldPreserveDirtyWorkflowGraph(base), true);
  assert.equal(
    shouldPreserveDirtyWorkflowGraph({
      ...base,
      sourceRevisionId: "rev-2",
      ownSaveRevisionId: "rev-2",
    }),
    true,
    "a durable receipt for this editor's save must not replace local undo history",
  );
  assert.equal(
    shouldPreserveDirtyWorkflowGraph({ ...base, sourceRevisionId: "remote-rev" }),
    false,
    "a remote revision change for the same item must be hydrated",
  );
  assert.equal(
    shouldPreserveDirtyWorkflowGraph({ ...base, sourceRootId: "artifact-2" }),
    false,
    "switching artifacts must reset graph history",
  );
  assert.equal(
    shouldPreserveDirtyWorkflowGraph({ ...base, reloadNonce: 1 }),
    false,
    "an explicit reload must reset graph history",
  );
  assert.equal(shouldPreserveDirtyWorkflowGraph({ ...base, dirty: false }), false);
  assert.equal(
    shouldPreserveDirtyWorkflowGraph({
      ...base,
      loadedReloadNonce: 1,
      reloadNonce: 1,
      sourceRevisionId: "rev-2",
      ownSaveRevisionId: "rev-2",
    }),
    true,
    "history remains stable on later autosaves after a prior explicit reload",
  );
});
