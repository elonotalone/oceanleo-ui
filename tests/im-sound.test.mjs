// F03：新消息提示音。假 AudioContext + 假状态仓，跑真实 sound.ts。
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GESTURE_EVENTS,
  SOUND_DURATION_S,
  SOUND_THROTTLE_MS,
  attachMessageSound,
  createMessageSound,
  shouldPlayMessageSound,
} from "../src/shell/messages/notify/sound.ts";

function fakeAudio({ state = "running" } = {}) {
  const log = { created: 0, resumed: 0, oscStarts: [], oscStops: [], closed: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const ctx = {
    state,
    currentTime: 10,
    destination: { dest: true },
    resume() {
      log.resumed += 1;
      ctx.state = "running";
      return Promise.resolve();
    },
    close() {
      log.closed += 1;
      return Promise.resolve();
    },
    createOscillator() {
      return {
        type: "",
        frequency: param(),
        connect() {},
        start(t) {
          log.oscStarts.push(t);
        },
        stop(t) {
          log.oscStops.push(t);
        },
      };
    },
    createGain() {
      return { gain: param(), connect() {} };
    },
  };
  return { ctx, log };
}

function soundHarness({ ctxState = "running" } = {}) {
  const audio = fakeAudio({ state: ctxState });
  const clock = { now: 1_000_000 };
  const sound = createMessageSound({
    createContext() {
      audio.log.created += 1;
      return audio.ctx;
    },
    now: () => clock.now,
  });
  return { ...audio, clock, sound };
}

const SELF = "u-me";
const msg = (extra = {}) => ({ sender_kind: "user", sender_id: "u-other", mentions: [], mention_all: false, ...extra });
const base = (over = {}) => ({
  settings: { sound: true },
  message: msg(),
  conversationId: "c1",
  conversation: { muted: false, notify_level: "all" },
  selfId: SELF,
  foregroundConversationId: null,
  ...over,
});

test("shouldPlay：正常新消息响", () => {
  assert.equal(shouldPlayMessageSound(base()), true);
});

test("shouldPlay：四种不响的条件", () => {
  // 1 设置关
  assert.equal(shouldPlayMessageSound(base({ settings: { sound: false } })), false);
  assert.equal(shouldPlayMessageSound(base({ settings: null })), false);
  // 2 自己发的
  assert.equal(shouldPlayMessageSound(base({ message: msg({ sender_id: SELF }) })), false);
  // 3 正在看的那个会话
  assert.equal(shouldPlayMessageSound(base({ foregroundConversationId: "c1" })), false);
  assert.equal(shouldPlayMessageSound(base({ foregroundConversationId: "c2" })), true);
  // 4 会话静音 / 不提醒
  assert.equal(shouldPlayMessageSound(base({ conversation: { muted: true, notify_level: "all" } })), false);
  assert.equal(shouldPlayMessageSound(base({ conversation: { muted: false, notify_level: "none" } })), false);
  assert.equal(shouldPlayMessageSound(base({ conversation: { muted: false, notify_level: "mentions" } })), false);
});

test("shouldPlay：@我 在静音会话里仍然响，notify_level=none 除外；系统消息不响；未知自己是谁不响", () => {
  const mention = msg({ mentions: [SELF] });
  assert.equal(shouldPlayMessageSound(base({ message: mention, conversation: { muted: true, notify_level: "all" } })), true);
  assert.equal(shouldPlayMessageSound(base({ message: mention, conversation: { muted: false, notify_level: "mentions" } })), true);
  assert.equal(shouldPlayMessageSound(base({ message: mention, conversation: { muted: true, notify_level: "none" } })), false);
  assert.equal(shouldPlayMessageSound(base({ message: msg({ mention_all: true }), conversation: { muted: true, notify_level: "all" } })), true);
  assert.equal(shouldPlayMessageSound(base({ message: msg({ sender_kind: "system", sender_id: null }) })), false);
  assert.equal(shouldPlayMessageSound(base({ selfId: null })), false);
});

test("手势之前：AudioContext 一个都没创建，play 静默", () => {
  const h = soundHarness();
  assert.equal(h.sound.play(), false);
  assert.equal(h.log.created, 0);
  assert.equal(h.log.oscStarts.length, 0);
});

test("第一次手势后创建 AudioContext，之后能响，音长 150–250ms", () => {
  const h = soundHarness();
  h.sound.noteUserGesture();
  assert.equal(h.log.created, 1);
  assert.equal(h.sound.play(), true);
  assert.equal(h.log.oscStarts.length, 1);
  const length = h.log.oscStops[0] - h.log.oscStarts[0];
  assert.ok(length >= 0.15 && length <= 0.25, `音长 ${length}s`);
  assert.ok(Math.abs(SOUND_DURATION_S - length) < 1e-9);
  h.sound.noteUserGesture();
  assert.equal(h.log.created, 1, "再来手势不重复创建");
});

test("被浏览器挂起的 AudioContext：手势里 resume，没恢复前不响", async () => {
  const h = soundHarness({ ctxState: "suspended" });
  h.sound.noteUserGesture();
  assert.equal(h.log.resumed, 1);
  await Promise.resolve();
  assert.equal(h.ctx.state, "running");
  assert.equal(h.sound.play(), true);
  const stuck = soundHarness({ ctxState: "suspended" });
  stuck.ctx.resume = () => Promise.resolve(); // 一直恢复不了
  stuck.sound.noteUserGesture();
  assert.equal(stuck.sound.play(), false);
});

test("节流：2 秒内最多响一次；被节流的不重置计时", () => {
  const h = soundHarness();
  h.sound.noteUserGesture();
  assert.equal(h.sound.play(), true);
  h.clock.now += 500;
  assert.equal(h.sound.play(), false);
  h.clock.now += SOUND_THROTTLE_MS - 501;
  assert.equal(h.sound.play(), false, "距上次 1999ms");
  h.clock.now += 1;
  assert.equal(h.sound.play(), true, "距上次整 2000ms");
  assert.equal(h.log.oscStarts.length, 2);
  // 一口气来 30 条：只响一声
  const burst = soundHarness();
  burst.sound.noteUserGesture();
  let played = 0;
  for (let i = 0; i < 30; i += 1) {
    if (burst.sound.play()) played += 1;
    burst.clock.now += 20;
  }
  assert.equal(played, 1);
});

function fakeStore({ inbox = [], selfId = SELF, foreground = null } = {}) {
  const handlers = new Set();
  return {
    onEvent(type, handler) {
      assert.equal(type, "message.created");
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    selfId: () => selfId,
    inbox: () => ({ items: inbox }),
    foregroundConversation: () => foreground,
    emit(conversationId, message) {
      for (const h of [...handlers]) h({ type: "message.created", conversation_id: conversationId, message });
    },
    handlers,
  };
}

function fakeWindow() {
  const listeners = new Map();
  return {
    addEventListener(name, fn) {
      listeners.set(name, [...(listeners.get(name) ?? []), fn]);
    },
    removeEventListener(name, fn) {
      listeners.set(name, (listeners.get(name) ?? []).filter((x) => x !== fn));
    },
    dispatch(name) {
      for (const fn of listeners.get(name) ?? []) fn();
    },
    count: () => [...listeners.values()].reduce((n, a) => n + a.length, 0),
  };
}

test("接线：手势前到达静默；手势后新消息响；设置关了不响；卸载后清干净", () => {
  const h = soundHarness();
  const store = fakeStore({ inbox: [{ id: "c1", muted: false, notify_level: "all" }] });
  const win = fakeWindow();
  const settings = { sound: true };
  const off = attachMessageSound({ store, sound: h.sound, getSettings: () => settings, gestureTarget: win });
  assert.equal(win.count(), GESTURE_EVENTS.length);

  store.emit("c1", msg());
  assert.equal(h.log.oscStarts.length, 0, "手势之前静默");

  win.dispatch("pointerdown");
  h.clock.now += 5000;
  store.emit("c1", msg());
  assert.equal(h.log.oscStarts.length, 1);

  settings.sound = false;
  h.clock.now += 5000;
  store.emit("c1", msg());
  assert.equal(h.log.oscStarts.length, 1, "设置关了不响");

  off();
  assert.equal(win.count(), 0);
  assert.equal(store.handlers.size, 0);
  assert.equal(h.log.closed, 1);
});

test("接线：自己发的、正在看的会话、静音会话都不响；设置还没取到也不响", () => {
  const h = soundHarness();
  const store = fakeStore({
    inbox: [
      { id: "c1", muted: false, notify_level: "all" },
      { id: "c-muted", muted: true, notify_level: "all" },
      { id: "c-fg", muted: false, notify_level: "all" },
    ],
    foreground: "c-fg",
  });
  const win = fakeWindow();
  let settings = null;
  attachMessageSound({ store, sound: h.sound, getSettings: () => settings, gestureTarget: win });
  win.dispatch("keydown");
  store.emit("c1", msg());
  assert.equal(h.log.oscStarts.length, 0, "设置没取到：静默");
  settings = { sound: true };
  h.clock.now += 5000;
  store.emit("c1", msg({ sender_id: SELF }));
  store.emit("c-fg", msg());
  store.emit("c-muted", msg());
  assert.equal(h.log.oscStarts.length, 0);
  store.emit("c-muted", msg({ mentions: [SELF] }));
  assert.equal(h.log.oscStarts.length, 1, "静音会话里 @我 仍然响");
});
