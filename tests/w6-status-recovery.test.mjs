import { test } from "node:test";
import assert from "node:assert/strict";

import { createImStore } from "../src/shell/messages/realtime/store.ts";
import { applyDialog, initialDialogState } from "../src/shell/cloud-computer/agent-dialog/reduce.ts";

function fakeSocket() {
  const listeners = new Set();
  return {
    start() {},
    stop() {},
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(output) {
      for (const listener of [...listeners]) listener(output);
    },
    state: () => "open",
    tokenChanged() {},
    noteActivity() {},
    noteVisibility() {},
    sendTyping() {},
  };
}

function timerHarness() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    setTimer(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, item]) => item.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await Promise.resolve();
      }
      now = target;
      await Promise.resolve();
    },
    pending() {
      return timers.size;
    },
  };
}

const page = { items: [], next_cursor: null };

test("agent dialog link evidence removes a stale reconnect notice immediately", () => {
  let state = initialDialogState();
  state = applyDialog(state, { type: "frame", frame: { t: "error", code: "dialog_unreachable", program: "claude" } });
  assert.equal(state.offline, true);
  assert.equal(state.messages.some((message) => message.kind === "notice" && message.code === "dialog_unreachable"), true);

  state = applyDialog(state, { type: "link-evidence" });
  assert.equal(state.offline, false);
  assert.equal(state.messages.some((message) => message.kind === "notice" && message.code === "dialog_unreachable"), false);
});

test("failed first inbox load retries and clears its error after recovery", async () => {
  const timers = timerHarness();
  const socket = fakeSocket();
  let attempts = 0;
  const store = createImStore({
    socket,
    fetchUnread: async () => ({ total: 0, mentions: 0, requests: 0, by_conversation: {} }),
    fetchConversations: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      return page;
    },
    notifyDesktop() {},
    isHidden: () => false,
    selfId: async () => "me",
    fallbackTitle: () => "消息",
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  await store.loadInbox("all");
  assert.equal(store.inbox().loaded, false);
  assert.equal(store.inbox().error, "offline");
  assert.equal(timers.pending(), 1);

  await timers.advance(999);
  assert.equal(attempts, 1);
  await timers.advance(1);
  assert.equal(attempts, 2);
  assert.equal(store.inbox().loaded, true);
  assert.equal(store.inbox().error, null);
  assert.equal(timers.pending(), 0);
});

test("online/focus wake retries a failed inbox load immediately", async () => {
  const timers = timerHarness();
  let attempts = 0;
  const store = createImStore({
    socket: fakeSocket(),
    fetchUnread: async () => ({ total: 0, mentions: 0, requests: 0, by_conversation: {} }),
    fetchConversations: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("offline");
      return page;
    },
    notifyDesktop() {},
    isHidden: () => false,
    selfId: async () => "me",
    fallbackTitle: () => "消息",
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });

  await store.loadInbox("all");
  store.retryInboxNow?.();
  await Promise.resolve();
  assert.equal(attempts, 2);
  assert.equal(store.inbox().loaded, true);
  assert.equal(store.inbox().error, null);
  assert.equal(timers.pending(), 0);
});
