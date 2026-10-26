import assert from "node:assert/strict";
import test from "node:test";
import { RemoteInputScheduler } from "../src/api/remote-desktop-scheduler.ts";

function harness() {
  let now = 0, blocked = false;
  const sent = [], busy = [], errors = [];
  const scheduler = new RemoteInputScheduler({
    now: () => now,
    write(seq, action) { if (blocked) return false; sent.push({ seq, action }); return true; },
    congestion: (value) => busy.push(value), failure: (code) => errors.push(code),
  });
  return { scheduler, sent, busy, errors, advance(ms) { now += ms; scheduler.tick(); }, block(value) { blocked = value; } };
}

test("fast gateway acceptance never releases the eight-input execution window", () => {
  const h = harness();
  for (let i = 1; i <= 8; i++) { h.scheduler.enqueue({ kind: "keypress", key: "ArrowRight" }); h.scheduler.accepted(i); }
  h.scheduler.enqueue({ kind: "type", text: "ordered" });
  assert.equal(h.sent.length, 8);
  h.scheduler.executedThrough(4);
  assert.equal(h.sent.length, 9);
  assert.equal(h.sent.at(-1).action.text, "ordered");
});

test("one thousand pending moves collapse to the tail without crossing drag barriers", () => {
  const h = harness();
  h.block(true);
  h.scheduler.enqueue({ kind: "pointer_down", x: 0, y: 0 });
  for (let i = 0; i < 1000; i++) h.scheduler.enqueue({ kind: "move", x: i / 1000, y: .5 });
  h.scheduler.enqueue({ kind: "pointer_up", x: 1, y: 1 });
  h.block(false); h.scheduler.tick(); h.scheduler.accepted(1); h.scheduler.accepted(2);
  assert.deepEqual(h.sent.map((item) => item.action.kind), ["pointer_down", "move", "pointer_up"]);
  assert.equal(h.sent[1].action.x, .999);
  assert.deepEqual(h.errors, []);
});

test("wheel events retain rounding semantics and text/key barriers", () => {
  const h = harness(); h.block(true);
  for (const action of [{ kind: "scroll", deltaY: 1 }, { kind: "scroll", deltaY: 1 }, { kind: "type", text: "hello" }, { kind: "scroll", deltaY: -1 }, { kind: "key_up", key: "Shift" }]) h.scheduler.enqueue(action);
  h.block(false); h.scheduler.tick(); for (let i = 1; i < 5; i++) h.scheduler.accepted(i);
  assert.deepEqual(h.sent.map((item) => item.action.kind), ["scroll", "scroll", "type", "scroll", "key_up"]);
});

test("pipelined rejection waits for all replies, retries in order, never replays accepted input", () => {
  const h = harness();
  h.scheduler.enqueue({ kind: "pointer_down" }); h.scheduler.enqueue({ kind: "pointer_up" });
  h.scheduler.rejected(1, "input_queue_full", 100);
  h.advance(100); assert.equal(h.sent.length, 2, "seq 2 still in socket; cannot speculate");
  h.scheduler.rejected(2, "input_queue_full", 100);
  h.advance(99); assert.equal(h.sent.length, 2);
  h.advance(1); assert.deepEqual(h.sent.map((item) => item.seq), [1, 2, 1]);
  h.scheduler.accepted(1); assert.equal(h.sent.at(-1).seq, 2);
  h.scheduler.accepted(2); h.scheduler.executedThrough(2); h.advance(100);
  assert.deepEqual(h.sent.map((item) => item.seq), [1, 2, 1, 2]);
});

test("normal input pipelines eight actions without waiting one RTT per event", () => {
  const h = harness();
  for (let i = 0; i < 10; i++) h.scheduler.enqueue({ kind: "keypress", key: "ArrowDown" });
  assert.equal(h.sent.length, 8);
  for (let i = 1; i <= 8; i++) h.scheduler.accepted(i);
  assert.equal(h.sent.length, 8);
  h.scheduler.executedThrough(8);
  assert.equal(h.sent.length, 10);
});

test("actual execution timeout attempts safety release once and never replays after cleanup", () => {
  const h = harness();
  h.scheduler.enqueue({ kind: "key_down", key: "Shift" }); h.scheduler.accepted(1);
  h.advance(5000);
  assert.deepEqual(h.errors, ["input_ack_unknown"]);
  assert.equal(h.sent.at(-1).action.kind, "release_all");
  const count = h.sent.length;
  h.advance(10000); h.scheduler.accepted(1); h.scheduler.executedThrough(1);
  assert.equal(h.scheduler.enqueue({ kind: "type", text: "never replay" }), false);
  assert.equal(h.sent.length, count);
});

test("socket backpressure drains; stalled local input has a finite deadline", () => {
  const h = harness(); h.block(true);
  h.scheduler.enqueue({ kind: "type", text: "one" }); h.advance(4999);
  assert.equal(h.sent.length, 0);
  h.block(false); h.scheduler.tick(); assert.equal(h.sent.length, 1);
  const stalled = harness(); stalled.block(true); stalled.scheduler.enqueue({ kind: "move", x: 0, y: 0 });
  for (let i = 0; i < 5; i++) { stalled.scheduler.enqueue({ kind: "move", x: .5, y: .5 }); stalled.advance(1000); }
  assert.deepEqual(stalled.errors, ["input_backlog_timeout"]);
});

test("release has reserved queue space and text overflow is reported, never silently successful", () => {
  const h = harness(); h.block(true);
  for (let i = 0; i < 32; i++) assert.equal(h.scheduler.enqueue({ kind: "type", text: "x" }), true);
  assert.equal(h.scheduler.enqueue({ kind: "key_up", key: "Shift" }), true);
  assert.equal(h.scheduler.enqueue({ kind: "type", text: "must not vanish" }), false);
  assert.deepEqual(h.errors, ["input_backlog_timeout"]);
});

test("untrusted execution watermark and unsolicited rejection fail closed", () => {
  const h = harness(); h.scheduler.executedThrough(99);
  assert.deepEqual(h.errors, ["response_malformed"]);
  const other = harness(); other.scheduler.rejected(2, "rate_limited", 25);
  assert.deepEqual(other.errors, ["response_malformed"]);
});

test("emergency release retires every rejected and queued down before bypassing the barrier", () => {
  const h = harness();
  h.scheduler.enqueue({ kind: "pointer_down" });
  h.scheduler.enqueue({ kind: "type", text: "never replay" });
  h.scheduler.rejected(1, "rate_limited", 1000);
  h.scheduler.rejected(2, "rate_limited", 1000);
  h.scheduler.enqueue({ kind: "key_down", key: "Shift" });
  h.scheduler.emergencyRelease();
  const count = h.sent.length;
  assert.deepEqual(h.sent.at(-1), { seq: 3, action: { kind: "release_all" } });
  h.advance(2000); h.scheduler.accepted(1); h.scheduler.executedThrough(1);
  assert.equal(h.sent.length, count);
  assert.equal(h.scheduler.enqueue({ kind: "pointer_down" }), false);
});
