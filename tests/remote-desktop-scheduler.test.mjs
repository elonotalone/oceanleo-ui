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

test("gateway acceptance releases credit without any execution report", () => {
  const h = harness();
  for (let i = 1; i <= 250; i++) {
    assert.equal(h.scheduler.enqueue({ kind: "keypress", key: "ArrowRight" }), true);
    h.scheduler.accepted(i);
  }
  assert.equal(h.sent.length, 250);
  h.advance(60_000);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.busy, []);
});

test("one thousand pending moves keep the latest position without crossing drag barriers", () => {
  const h = harness(); h.block(true);
  h.scheduler.enqueue({ kind: "pointer_down", x: 0, y: 0 });
  for (let i = 0; i < 1000; i++) h.scheduler.enqueue({ kind: "move", x: i / 1000, y: .5 });
  h.scheduler.enqueue({ kind: "pointer_up", x: 1, y: 1 });
  h.block(false); h.scheduler.tick();
  assert.deepEqual(h.sent.map((item) => item.action.kind), ["pointer_down", "move", "pointer_up"]);
  assert.equal(h.sent[1].action.x, .999);
  assert.deepEqual(h.errors, []);
});

test("wheel distance accumulates within gesture segments and preserves text/key barriers", () => {
  const h = harness(); h.block(true);
  for (const action of [{ kind: "scroll", deltaY: 1 }, { kind: "scroll", deltaY: 1 }, { kind: "type", text: "hello" }, { kind: "scroll", deltaY: -1 }, { kind: "key_up", key: "Shift" }]) h.scheduler.enqueue(action);
  h.block(false); h.scheduler.tick();
  assert.deepEqual(h.sent.map((item) => item.action.kind), ["scroll", "type", "scroll", "key_up"]);
  assert.equal(h.sent[0].action.deltaY, 2);
  assert.equal(h.sent[2].action.deltaY, -1);
});

test("alternating wheel/move floods remain bounded and retain total wheel distance", () => {
  const h = harness(); h.block(true);
  for (let i = 0; i < 2000; i++) {
    h.scheduler.enqueue({ kind: "move", x: i / 2000, y: .5 });
    h.scheduler.enqueue({ kind: "scroll", deltaY: .5 });
  }
  h.block(false); h.scheduler.tick();
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[0].action.x, 1999 / 2000);
  assert.equal(h.sent[1].action.deltaY, 1000);
  assert.deepEqual(h.busy, []);
});

test("large accumulated scroll is split within schema bounds without losing distance", () => {
  const h = harness(); h.block(true);
  for (let i = 0; i < 50; i++) h.scheduler.enqueue({ kind: "scroll", deltaY: 500 });
  h.block(false); h.scheduler.tick();
  assert.deepEqual(h.sent.map((item) => item.action.deltaY), [10_000, 10_000, 5000]);
});

test("pipelined rejection waits for every reply and retries only definitely rejected sequences", () => {
  const h = harness();
  h.scheduler.enqueue({ kind: "pointer_down" }); h.scheduler.enqueue({ kind: "pointer_up" });
  h.scheduler.rejected(1, "input_queue_full", 100);
  h.advance(100); assert.equal(h.sent.length, 2);
  h.scheduler.rejected(2, "input_queue_full", 100);
  h.advance(99); assert.equal(h.sent.length, 2);
  h.advance(1); assert.deepEqual(h.sent.map((item) => item.seq), [1, 2, 1]);
  h.scheduler.accepted(1); assert.equal(h.sent.at(-1).seq, 2);
  h.scheduler.accepted(2); h.scheduler.executedThrough(2); h.advance(60_000);
  assert.deepEqual(h.sent.map((item) => item.seq), [1, 2, 1, 2]);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.busy, []);
});

test("ordinary gateway RTT pressure stays silent and drains on acceptance", () => {
  const h = harness();
  for (let i = 0; i < 10; i++) h.scheduler.enqueue({ kind: "keypress", key: "ArrowDown" });
  assert.equal(h.sent.length, 8);
  h.advance(60_000);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.busy, []);
  h.scheduler.accepted(1); h.scheduler.accepted(2);
  assert.equal(h.sent.length, 10);
});

test("five seconds without execution never terminates or replays accepted input", () => {
  const h = harness();
  h.scheduler.enqueue({ kind: "key_down", key: "Shift" }); h.scheduler.accepted(1);
  h.advance(60_000);
  assert.deepEqual(h.errors, []);
  assert.equal(h.sent.length, 1);
  h.scheduler.executedThrough(1);
  h.scheduler.enqueue({ kind: "key_up", key: "Shift" });
  assert.equal(h.sent.at(-1).action.kind, "key_up");
});

test("socket backpressure retains input without an execution deadline or a false busy banner", () => {
  const h = harness(); h.block(true);
  h.scheduler.enqueue({ kind: "type", text: "one" }); h.advance(60_000);
  assert.equal(h.sent.length, 0);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.busy, []);
  h.block(false); h.scheduler.tick(); assert.equal(h.sent.length, 1);
});

test("a real key backlog pauses new presses, permits releases and recovers without closing", () => {
  const h = harness(); h.block(true);
  for (let i = 0; i < 32; i++) assert.equal(h.scheduler.enqueue({ kind: "type", text: `${i}` }), true);
  assert.equal(h.scheduler.enqueue({ kind: "type", text: "paused" }), false);
  assert.deepEqual(h.busy, [true]);
  assert.equal(h.scheduler.enqueue({ kind: "key_up", key: "Shift" }), true);
  h.block(false); h.scheduler.tick();
  for (let i = 1; i <= 33; i++) h.scheduler.accepted(i);
  assert.equal(h.sent.length, 33);
  assert.deepEqual(h.sent.slice(0, 32).map((entry) => entry.action.text), Array.from({ length: 32 }, (_, i) => `${i}`));
  assert.equal(h.sent.at(-1).action.kind, "key_up");
  assert.deepEqual(h.busy, [true, false]);
  assert.deepEqual(h.errors, []);
});

test("untrusted execution watermark and unsolicited rejection fail closed", () => {
  const h = harness(); h.scheduler.executedThrough(99);
  assert.deepEqual(h.errors, ["response_malformed"]);
  const other = harness(); other.scheduler.rejected(2, "rate_limited", 25);
  assert.deepEqual(other.errors, ["response_malformed"]);
});

test("emergency release retires every rejected and queued press before bypassing the barrier", () => {
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

test("a release flood remains bounded and never substitutes release_all for an ordinary key-up", () => {
  const h = harness(); h.block(true);
  h.scheduler.enqueue({ kind: "key_down", key: "Shift" });
  for (let i = 0; i < 1000; i++) {
    h.scheduler.enqueue({ kind: "key_up", key: `Unused${i}` });
    h.scheduler.enqueue({ kind: "move", x: .5, y: .5 });
  }
  assert.equal(h.scheduler.enqueue({ kind: "key_up", key: "Shift" }), true);
  h.block(false); h.scheduler.tick();
  for (let i = 1; i <= 300; i++) h.scheduler.accepted(i);
  assert.equal(h.sent.some((entry) => entry.action.kind === "release_all"), false);
  assert.equal(h.sent.at(-1).action.kind, "key_up");
  assert.equal(h.sent.at(-1).action.key, "Shift");
  assert.ok(h.sent.length < 200);
  assert.deepEqual(h.errors, []);
});

test("explicit handoff waits for release execution, never acceptance, and freezes late input", async () => {
  const h=harness();h.scheduler.enqueue({kind:"key_down",key:"Shift"});
  let done=false;const wait=h.scheduler.releaseForHandoff().then(()=>{done=true;});
  assert.equal(h.scheduler.enqueue({kind:"type",text:"late"}),false);
  const release=h.sent.find(x=>x.action.kind==='release_all');assert.ok(release);
  h.scheduler.accepted(release.seq);await Promise.resolve();assert.equal(done,false);
  h.scheduler.executedThrough(release.seq-1);await Promise.resolve();assert.equal(done,false);
  h.scheduler.executedThrough(release.seq);await wait;assert.equal(done,true);
  assert.equal(h.scheduler.enqueue({kind:"keypress",key:"Enter"}),false);
  h.scheduler.finishHandoff();assert.equal(h.scheduler.enqueue({kind:"keypress",key:"Enter"}),true);h.scheduler.dispose();
});
test("handoff with no prior input still needs a real release sequence",async()=>{const h=harness();const p=h.scheduler.releaseForHandoff();assert.deepEqual(h.sent.map(x=>[x.seq,x.action.kind]),[[1,'release_all']]);h.scheduler.executedThrough(1);await p;h.scheduler.dispose();});

test('handoff execution can precede accepted and concurrent calls share one release',async()=>{const h=harness();const p=h.scheduler.releaseForHandoff();assert.equal(h.scheduler.releaseForHandoff(),p);h.scheduler.executedThrough(1);h.scheduler.accepted(1);await p;assert.equal(h.sent.length,1);h.scheduler.dispose();});
test('blocked handoff binds only to its eventual written sequence',async()=>{const h=harness();h.block(true);let done=false;const p=h.scheduler.releaseForHandoff().then(()=>{done=true;});h.scheduler.executedThrough(0);await Promise.resolve();assert.equal(done,false);assert.equal(h.sent.length,0);h.block(false);h.scheduler.tick();h.scheduler.executedThrough(1);await p;h.scheduler.dispose();});
test('explicit rejected release retries only that exact seq and never completes on acceptance',async()=>{const h=harness();let done=false;const p=h.scheduler.releaseForHandoff().then(()=>{done=true;});h.scheduler.rejected(1,'rate_limited',25);h.advance(25);assert.deepEqual(h.sent.map(x=>x.seq),[1,1]);h.scheduler.accepted(1);await Promise.resolve();assert.equal(done,false);h.scheduler.executedThrough(1);await p;h.scheduler.dispose();});
test('queued release cannot use an older execution watermark',async()=>{const h=harness();for(let i=0;i<8;i++)h.scheduler.enqueue({kind:'keypress',key:'Enter'});let done=false;const p=h.scheduler.releaseForHandoff().then(()=>{done=true;});h.scheduler.executedThrough(8);await Promise.resolve();assert.equal(done,false);h.scheduler.accepted(1);assert.equal(h.sent.at(-1).seq,9);h.scheduler.executedThrough(9);await p;h.scheduler.dispose();});
for(const mode of ['timeout','dispose','malformed'])test(`handoff ${mode} never confirms execution`,async()=>{const h=harness();const p=h.scheduler.releaseForHandoff();const rejected=assert.rejects(p,/input_ack_unknown/);if(mode==='timeout')h.advance(5000);if(mode==='dispose')h.scheduler.dispose();if(mode==='malformed')h.scheduler.executedThrough(10);await rejected;assert.equal(h.scheduler.enqueue({kind:'type',text:'stale'}),false);h.scheduler.dispose();});
