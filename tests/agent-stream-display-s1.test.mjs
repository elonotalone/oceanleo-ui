import test from "node:test";
import assert from "node:assert/strict";

import { oceanMessageFingerprint } from "../src/shell/cloud-computer/agent-dialog/oceanleo-program.ts";

test("stream polling fingerprint changes when an existing assistant row grows", () => {
  const before = oceanMessageFingerprint([
    { id: 7, role: "assistant", content: "先" },
  ]);
  const during = oceanMessageFingerprint([
    { id: 7, role: "assistant", content: "先出现" },
  ]);
  assert.notEqual(before, during);
});

test("a length-only change detector would fail the streaming contract", () => {
  const before = [{ id: 7, role: "assistant", content: "先" }];
  const during = [{ id: 7, role: "assistant", content: "先出现" }];
  assert.equal(before.length, during.length);
  assert.notEqual(oceanMessageFingerprint(before), oceanMessageFingerprint(during));
});
