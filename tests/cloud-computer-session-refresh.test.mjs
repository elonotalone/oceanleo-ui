import assert from "node:assert/strict";
import test from "node:test";
import { createSessionRefresh } from "../src/shell/cloud-computer/agent-dialog/session-refresh.ts";

function setup(t) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  let visible = true;
  let online = true;
  const sent = [];
  const refresh = createSessionRefresh({
    allowed: () => visible,
    send: (program) => {
      if (!online) return false;
      sent.push(program);
      return true;
    },
  });
  t.after(() => refresh.reset());
  return { refresh, sent, tick: (ms) => t.mock.timers.tick(ms),
    visible: (value) => { visible = value; }, online: (value) => { online = value; } };
}

test("one request per program; activity during a request gets a trailing refresh", (t) => {
  const { refresh, sent, tick } = setup(t);
  refresh.request("cursor");
  refresh.request("cursor", "poll");
  refresh.request("cursor", "wake");
  refresh.request("cursor", "activity");
  refresh.request("cursor", "activity");
  assert.deepEqual(sent, ["cursor"]);
  refresh.receive("cursor", "old", true);
  tick(999);
  assert.equal(sent.length, 1);
  tick(1);
  assert.deepEqual(sent, ["cursor", "cursor"]);
  refresh.receive("cursor", "new", true);
  tick(5000);
  assert.equal(sent.length, 2);
});

test("unchanged lists back off to 60s; changed list restores 15s cadence", (t) => {
  const { refresh, sent, tick } = setup(t);
  refresh.request("cursor");
  refresh.receive("cursor", "same", true);
  tick(15000);
  refresh.request("cursor", "poll");
  refresh.receive("cursor", "same", true);
  tick(15000);
  refresh.request("cursor", "poll");
  assert.equal(sent.length, 2);
  tick(15000);
  refresh.request("cursor", "poll");
  refresh.receive("cursor", "same", true);
  tick(30000);
  refresh.request("cursor", "poll");
  assert.equal(sent.length, 3);
  tick(30000);
  refresh.request("cursor", "poll");
  refresh.receive("cursor", "renamed", true);
  tick(15000);
  refresh.request("cursor", "poll");
  assert.equal(sent.length, 5);
});

test("hidden or inactive views send nothing, including queued activity; wake refreshes", (t) => {
  const { refresh, sent, tick, visible } = setup(t);
  refresh.request("codex");
  refresh.receive("codex", "one", true);
  refresh.request("codex", "activity");
  visible(false);
  refresh.pause();
  tick(60000);
  refresh.request("codex", "poll");
  refresh.request("codex", "activity");
  assert.equal(sent.length, 1);
  visible(true);
  refresh.request("codex", "wake");
  assert.equal(sent.length, 2);
});

test("focus and visibility bursts coalesce without adding a trailing request", (t) => {
  const { refresh, sent, tick } = setup(t);
  refresh.request("claude");
  refresh.request("claude", "wake");
  refresh.request("claude", "wake");
  refresh.receive("claude", "one", true);
  tick(5000);
  assert.equal(sent.length, 1);
  refresh.request("claude", "wake");
  refresh.receive("claude", "one", true);
  refresh.request("claude", "wake");
  refresh.request("claude", "wake");
  tick(1000);
  assert.equal(sent.length, 2);
});

test("slow responses never overlap; reconnect resets pending; transient failures remain recoverable", (t) => {
  const { refresh, sent, tick, online } = setup(t);
  refresh.request("cursor");
  tick(120000);
  refresh.request("cursor", "poll");
  refresh.request("cursor", "manual");
  assert.equal(sent.length, 1);
  refresh.reset();
  refresh.request("cursor", "poll");
  assert.equal(sent.length, 2);
  refresh.receive("cursor", "unsupported", false);
  tick(30000);
  refresh.request("cursor", "poll");
  assert.equal(sent.length, 2);
  tick(30000);
  refresh.request("cursor", "poll");
  assert.equal(sent.length, 3);
  refresh.receive("cursor", "supported", true);
  tick(1000);
  refresh.request("cursor", "manual");
  assert.equal(sent.length, 4);
  refresh.reset();
  online(false);
  refresh.request("cursor");
  assert.equal(sent.length, 4);
  online(true);
  refresh.request("cursor");
  assert.equal(sent.length, 5);
});

test("switching programs does not mix in-flight responses or backoff", (t) => {
  const { refresh, sent, tick } = setup(t);
  refresh.request("cursor");
  refresh.request("codex");
  refresh.receive("cursor", "a", true);
  tick(15000);
  refresh.request("cursor", "poll");
  refresh.request("codex", "poll");
  assert.deepEqual(sent, ["cursor", "codex", "cursor"]);
  refresh.reset();
  tick(60000);
  assert.equal(sent.length, 3);
});
