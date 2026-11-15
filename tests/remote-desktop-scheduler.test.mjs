import assert from "node:assert/strict";
import test from "node:test";
import { RemoteInputScheduler } from "../src/api/remote-desktop-scheduler.ts";

function receipt(scheduler, seq) { scheduler.receipt({ seq, status: "executed", executed_at_ms: 1 }); }
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

test("terminal DC receipt releases exactly one credit", () => {
  const h = harness();
  for (let i = 1; i <= 250; i++) {
    assert.equal(h.scheduler.enqueue({ kind: "keypress", key: "ArrowRight" }), true);
    receipt(h.scheduler, i);
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

test("ordinary DC receipt pressure stays silent and drains on terminal receipt", () => {
  const h = harness();
  for (let i = 0; i < 10; i++) h.scheduler.enqueue({ kind: "keypress", key: "ArrowDown" });
  assert.equal(h.sent.length, 8);
  h.advance(60_000);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.busy, []);
  receipt(h.scheduler, 1); receipt(h.scheduler, 2);
  assert.equal(h.sent.length, 10);
});

test("five seconds without execution never terminates or replays accepted input", () => {
  const h = harness();
  h.scheduler.enqueue({ kind: "key_down", key: "Shift" }); receipt(h.scheduler, 1);
  h.advance(60_000);
  assert.deepEqual(h.errors, []);
  assert.equal(h.sent.length, 1);
  receipt(h.scheduler, 1);
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
  for (let i = 1; i <= 33; i++) receipt(h.scheduler, i);
  assert.equal(h.sent.length, 33);
  assert.deepEqual(h.sent.slice(0, 32).map((entry) => entry.action.text), Array.from({ length: 32 }, (_, i) => `${i}`));
  assert.equal(h.sent.at(-1).action.kind, "key_up");
  assert.deepEqual(h.busy, [true, false]);
  assert.deepEqual(h.errors, []);
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
  for (let i = 1; i <= 300; i++) receipt(h.scheduler, i);
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
  receipt(h.scheduler, release.seq+1);await Promise.resolve();assert.equal(done,false);
  receipt(h.scheduler, release.seq-1);await Promise.resolve();assert.equal(done,false);
  receipt(h.scheduler, release.seq);await wait;assert.equal(done,true);
  assert.equal(h.scheduler.enqueue({kind:"keypress",key:"Enter"}),false);
  h.scheduler.finishHandoff();assert.equal(h.scheduler.enqueue({kind:"keypress",key:"Enter"}),true);h.scheduler.dispose();
});
test("handoff with no prior input still needs a real release sequence",async()=>{const h=harness();const p=h.scheduler.releaseForHandoff();assert.deepEqual(h.sent.map(x=>[x.seq,x.action.kind]),[[1,'release_all']]);receipt(h.scheduler, 1);await p;h.scheduler.dispose();});

test('handoff execution can precede accepted and concurrent calls share one release',async()=>{const h=harness();const p=h.scheduler.releaseForHandoff();assert.equal(h.scheduler.releaseForHandoff(),p);receipt(h.scheduler, 1);receipt(h.scheduler, 1);await p;assert.equal(h.sent.length,1);h.scheduler.dispose();});
test('blocked handoff binds only to its eventual written sequence',async()=>{const h=harness();h.block(true);let done=false;const p=h.scheduler.releaseForHandoff().then(()=>{done=true;});receipt(h.scheduler, 0);await Promise.resolve();assert.equal(done,false);assert.equal(h.sent.length,0);h.block(false);h.scheduler.tick();receipt(h.scheduler, 1);await p;h.scheduler.dispose();});
test('queued release cannot use an older terminal receipt',async()=>{const h=harness();for(let i=0;i<8;i++)h.scheduler.enqueue({kind:'keypress',key:'Enter'});let done=false;const p=h.scheduler.releaseForHandoff().then(()=>{done=true;});receipt(h.scheduler, 8);await Promise.resolve();assert.equal(done,false);receipt(h.scheduler, 1);assert.equal(h.sent.at(-1).seq,9);receipt(h.scheduler, 9);await p;h.scheduler.dispose();});
for(const mode of ['timeout','dispose','malformed'])test(`handoff ${mode} never confirms execution`,async()=>{const h=harness();const p=h.scheduler.releaseForHandoff();const rejected=assert.rejects(p,/input_ack_unknown/);if(mode==='timeout')h.advance(5000);if(mode==='dispose')h.scheduler.dispose();if(mode==='malformed'){receipt(h.scheduler, 10);h.advance(5000);}await rejected;assert.equal(h.scheduler.enqueue({kind:'type',text:'stale'}),false);h.scheduler.dispose();});

test("a re-attached stream continues numbering above the session's accepted input", () => {
  const { scheduler, sent, errors } = harness();
  scheduler.seed(41);
  receipt(scheduler, 37); // the gateway's older terminal receipt is not a malformed reply
  scheduler.enqueue({ kind: "release_all" });
  assert.deepEqual(sent.map((entry) => entry.seq), [42]);
  assert.equal(scheduler.lastSequence(), 42);
  scheduler.seed(10); // never moves backwards
  assert.equal(scheduler.lastSequence(), 42);
  assert.deepEqual(errors, []);
});
