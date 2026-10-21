import assert from "node:assert/strict";
import test from "node:test";

import {
  asEditorToHostMessage,
  asHostToEditorMessage,
  EDITOR_PROTOCOL,
  isEditorRecoverySnapshot,
} from "../src/shell/editor-protocol.ts";

const instanceId = "native-cas-protocol-test";
const envelope = (message) => ({
  protocol: EDITOR_PROTOCOL,
  instanceId,
  ...message,
});

test("optional native CAS guard is retained and accepts only nonnegative safe integers", () => {
  const snapshot = {
    revision: 9,
    expectedNativeRevision: 41,
    payload: { schema: "oceanleo.canvas.collab.v1", op: "patch" },
  };
  assert.equal(isEditorRecoverySnapshot(snapshot), true);
  assert.deepEqual(
    asHostToEditorMessage(
      envelope({ type: "recovery-restore", recoveryId: "write-1", snapshot }),
      instanceId,
    )?.snapshot,
    snapshot,
  );
  for (const expectedNativeRevision of [-1, 1.25, Number.MAX_SAFE_INTEGER + 1, "41"]) {
    assert.equal(
      isEditorRecoverySnapshot({ ...snapshot, expectedNativeRevision }),
      false,
    );
    assert.equal(
      asHostToEditorMessage(
        envelope({
          type: "recovery-restore",
          recoveryId: "write-invalid",
          snapshot: { ...snapshot, expectedNativeRevision },
        }),
        instanceId,
      ),
      null,
    );
  }
  assert.equal(
    isEditorRecoverySnapshot({ revision: 9, payload: snapshot.payload }),
    true,
    "legacy recovery snapshots remain valid without CAS",
  );
});

test("recovery result carries exact native CAS proof and rejects malformed proof", () => {
  const ack = {
    type: "recovery-result",
    recoveryId: "write-1",
    ok: true,
    revision: 42,
    expectedNativeRevision: 41,
  };
  assert.deepEqual(asEditorToHostMessage(envelope(ack), instanceId), envelope(ack));
  for (const expectedNativeRevision of [-1, 1.25, Number.MAX_SAFE_INTEGER + 1, "41"]) {
    assert.equal(
      asEditorToHostMessage(
        envelope({ ...ack, expectedNativeRevision }),
        instanceId,
      ),
      null,
    );
  }
  assert.equal(
    asEditorToHostMessage(
      envelope({
        type: "recovery-result",
        recoveryId: "legacy-write",
        ok: true,
        revision: 9,
      }),
      instanceId,
    )?.expectedNativeRevision,
    undefined,
    "legacy acknowledgements remain parseable but cannot satisfy the CAS caller",
  );
});
