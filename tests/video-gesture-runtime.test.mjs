import assert from "node:assert/strict";
import test from "node:test";

import {
  beginTimelineGesture,
  cancelTimelineGesture,
  commitTimelineGesture,
  createTimelineGestureHistory,
  updateTimelineGesture,
} from "../src/shell/video-editor/timeline-gesture-history.ts";

function documentAt(value) {
  return {
    version: 1,
    tracks: [{ id: "track-1", clips: [{ id: "clip-1", start_ms: value }] }],
  };
}

test("100 transient video updates cancel to the exact base without history or revision", () => {
  const base = documentAt(0);
  const priorUndo = documentAt(-2);
  const priorRedo = documentAt(-1);
  let state = beginTimelineGesture(
    createTimelineGestureHistory(base, {
      undo: [priorUndo],
      redo: [priorRedo],
      revision: 41,
      dirty: false,
    }),
  );
  for (let index = 1; index <= 100; index += 1) {
    state = updateTimelineGesture(state, () => documentAt(index));
  }
  assert.equal(state.document.tracks[0].clips[0].start_ms, 100);
  assert.equal(state.revision, 41);
  assert.equal(state.dirty, false);

  state = cancelTimelineGesture(state);
  assert.equal(state.document, base);
  assert.deepEqual(state.undo, [priorUndo]);
  assert.deepEqual(state.redo, [priorRedo]);
  assert.equal(state.revision, 41);
  assert.equal(state.dirty, false);
  assert.equal(state.base, null);
});

test("100 transient video updates commit as exactly one dirty revision and undo entry", () => {
  const base = documentAt(0);
  const priorUndo = documentAt(-2);
  const staleRedo = documentAt(-1);
  let state = beginTimelineGesture(
    createTimelineGestureHistory(base, {
      undo: [priorUndo],
      redo: [staleRedo],
      revision: 9,
      dirty: false,
    }),
  );
  for (let index = 1; index <= 100; index += 1) {
    state = updateTimelineGesture(state, () => documentAt(index));
  }
  state = commitTimelineGesture(state);

  assert.equal(state.document.tracks[0].clips[0].start_ms, 100);
  assert.deepEqual(state.undo, [priorUndo, base]);
  assert.deepEqual(state.redo, []);
  assert.equal(state.revision, 10);
  assert.equal(state.dirty, true);
  assert.equal(state.base, null);

  const alreadyCommitted = commitTimelineGesture(state);
  assert.equal(alreadyCommitted, state);
  assert.equal(alreadyCommitted.undo.length, 2);
  assert.equal(alreadyCommitted.revision, 10);
});
