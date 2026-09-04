/**
 * W02 判据 1：审阅会话。接受前 revision 不前进；拒绝丢弃；可回滚。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { validReviewProposal } from "../src/shell/hosted-editor/index.ts";
import { createReviewSession } from "../src/shell/agent-review/session.ts";

function textProposal(revision = 3) {
  return {
    proposalId: "p-text-1",
    commandId: "richdoc.rewrite",
    summary: { before: "旧句", after: "新句" },
    diff: "-旧句\n+新句",
    targetSelection: null,
    revision,
  };
}

function objectProposal(revision = 4) {
  return {
    proposalId: "p-obj-1",
    commandId: "grid.set-cell",
    summary: { before: "1 格保持原值", after: "1 格将被改写" },
    objects: [
      { id: "A1", op: "update", label: "A1", before: "1", after: "2" },
      { id: "B1", op: "update", label: "B1", before: "x", after: "y" },
    ],
    targetSelection: null,
    revision,
  };
}

function parked(proposal, editorId = "grid") {
  return {
    proposal,
    params: { value: "2" },
    inverseParams: { value: "1" },
    editorId,
  };
}

test("提案必须过宿主 validReviewProposal（不自研校验器）", () => {
  assert.equal(validReviewProposal(textProposal()), true);
  assert.equal(validReviewProposal(objectProposal()), true);
  assert.equal(validReviewProposal({ ...textProposal(), diff: undefined }), false);
});

test("接受前 currentRevision 停在提案 revision", () => {
  const session = createReviewSession();
  const proposal = objectProposal(7);
  assert.equal(session.receive(parked(proposal), 7), "ok");
  assert.equal(session.snapshot().currentRevision, 7);
  assert.equal(session.snapshot().status, "open");
});

test("文档已前进则 stale，不能当接受", () => {
  const session = createReviewSession();
  assert.equal(session.receive(parked(objectProposal(3)), 4), "stale");
  assert.equal(session.snapshot().status, "stale");
});

test("非法提案拒绝接收", () => {
  const session = createReviewSession();
  const bad = parked({ ...textProposal(), commandId: "" });
  assert.equal(session.receive(bad, 0), "invalid");
  assert.equal(session.snapshot().status, "idle");
});

test("对象类可逐条决定；拒绝全部则丢弃且 revision 不前进", () => {
  const session = createReviewSession();
  session.receive(parked(objectProposal(4)), 4);
  session.decideItem("A1", "accept");
  session.decideItem("B1", "reject");
  assert.deepEqual(session.acceptedObjectIds(), ["A1"]);
  session.rejectAll();
  session.markDiscarded();
  assert.equal(session.snapshot().currentRevision, 4);
  assert.equal(session.snapshot().status, "discarded");
  assert.equal(session.snapshot().parked, null);
});

test("接受后 revision 才前进；回滚回到上一版", () => {
  const session = createReviewSession();
  session.receive(parked(objectProposal(4)), 4);
  session.acceptAll();
  session.markApplied(5);
  assert.equal(session.snapshot().currentRevision, 5);
  assert.equal(session.canRollback(), true);
  const inverse = session.rollback();
  assert.ok(inverse);
  assert.equal(session.snapshot().currentRevision, 4);
  assert.equal(inverse.proposal.objects[0].before, "2");
  assert.equal(inverse.proposal.objects[0].after, "1");
});
