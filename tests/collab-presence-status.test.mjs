import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowOfflinePresence } from "../src/shell/collab/collab-presence-status.ts";

/**
 * Keep the user-facing rule explicit: a room transport can reconnect in the
 * background without being a collaborator outage. The pill is meaningful
 * only after another user's presence was observed.
 */
test("a task room with no collaborators stays quiet when its socket drops", () => {
  assert.equal(shouldShowOfflinePresence({ status: "offline", peerCount: 0, hadPeer: false }), false);
});

test("a file room reports an outage after a collaborator was present", () => {
  assert.equal(shouldShowOfflinePresence({ status: "offline", peerCount: 0, hadPeer: true }), true);
  assert.equal(shouldShowOfflinePresence({ status: "offline", peerCount: 1, hadPeer: false }), true);
  assert.equal(shouldShowOfflinePresence({ status: "synced", peerCount: 0, hadPeer: true }), false);
});
