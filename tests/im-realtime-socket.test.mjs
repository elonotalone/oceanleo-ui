// 消息实时通道客户端（work-chat W08，契约 §6.1）：真实 socket.ts + 假 WebSocket + 假计时器。
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AUTH_TIMEOUT_MS,
  IDLE_MS,
  PING_MS,
  TYPING_GAP_MS,
  backoffDelay,
  createImSocket,
} from "../src/shell/messages/realtime/socket.ts";
import { imEnabledFor, imSocketUrl } from "../src/shell/messages/messages-family.ts";

function harness({ tokens = ["tok-1"], hidden = false, random = () => 0.5 } = {}) {
  let now = 1_000_000;
  let nextId = 1;
  const timers = new Map();
  const sockets = [];
  const state = { hidden, tokens: tokens.slice(), tokenCalls: 0 };
  const deps = {
    url: () => "wss://gw.test/v1/im/ws",
    async getToken() {
      state.tokenCalls += 1;
      return state.tokens.length > 1 ? state.tokens.shift() : state.tokens[0] ?? null;
    },
    createSocket(url) {
      const ws = {
        url,
        sent: [],
        closedWith: null,
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        send(data) {
          this.sent.push(JSON.parse(data));
        },
        close(code) {
          this.closedWith = code ?? 1000;
        },
        // 测试辅助
        open() {
          this.onopen?.();
        },
        recv(obj) {
          this.onmessage?.({ data: JSON.stringify(obj) });
        },
        drop(code = 1006) {
          this.onclose?.({ code });
        },
      };
      sockets.push(ws);
      return ws;
    },
    setTimer(fn, ms) {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    random,
    now: () => now,
    isHidden: () => state.hidden,
  };
  const advance = async (ms) => {
    const target = now + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
      await Promise.resolve();
    }
    now = target;
    await Promise.resolve();
  };
  const flush = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };
  return { deps, sockets, state, advance, flush, timers, setNow: (v) => (now = v), getNow: () => now };
}

async function connectReady(h, socket) {
  socket.start();
  await h.flush();
  const ws = h.sockets.at(-1);
  ws.open();
  ws.recv({ type: "ready", user_id: "u1", server_time: "x" });
  return ws;
}

test("退避：1s→2s→4s→…封顶 30s，抖动在 ±20% 内", () => {
  const mid = () => 0.5;
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 9].map((n) => backoffDelay(n, mid)), [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  for (const n of [0, 1, 2, 3, 4]) {
    const low = backoffDelay(n, () => 0);
    const high = backoffDelay(n, () => 1);
    const base = Math.min(30000, 1000 * 2 ** n);
    assert.ok(low >= Math.max(1000, base * 0.8 - 1) && low <= base, `n=${n} low=${low}`);
    assert.ok(high <= Math.min(30000, base * 1.2 + 1) && high >= base, `n=${n} high=${high}`);
  }
});

test("第一帧就是 auth（带 token）；ready 后才算 open，25 秒一次 ping", async () => {
  const h = harness();
  const socket = createImSocket(h.deps);
  const states = [];
  socket.subscribe((out) => out.kind === "state" && states.push(out.state));
  socket.start();
  await h.flush();
  const ws = h.sockets[0];
  assert.equal(ws.url, "wss://gw.test/v1/im/ws");
  ws.open();
  assert.deepEqual(ws.sent[0], { type: "auth", token: "tok-1" });
  assert.equal(socket.state(), "connecting", "还没 ready 不算连上");
  ws.recv({ type: "ready", user_id: "u1" });
  assert.equal(socket.state(), "open");
  assert.deepEqual(states, ["connecting", "open"]);
  const before = ws.sent.length;
  await h.advance(PING_MS);
  assert.deepEqual(ws.sent.slice(before).filter((f) => f.type === "ping"), [{ type: "ping" }]);
  await h.advance(PING_MS * 2);
  assert.equal(ws.sent.filter((f) => f.type === "ping").length, 3);
});

test("事件帧转给订阅者；坏帧与未知帧被忽略", async () => {
  const h = harness();
  const socket = createImSocket(h.deps);
  const events = [];
  socket.subscribe((out) => out.kind === "event" && events.push(out.event));
  const ws = await connectReady(h, socket);
  ws.recv({ type: "event", event: { type: "unread.changed", unread: { total: 3 } } });
  ws.onmessage({ data: "not json" });
  ws.onmessage({ data: new ArrayBuffer(4) });
  ws.recv({ type: "pong" });
  ws.recv({ type: "event", event: { nope: 1 } });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "unread.changed");
});

test("断线重连：指数退避；重连后再次 ready 通知订阅者补数据；首次连接不通知", async () => {
  const h = harness({ tokens: ["a", "b", "c"] });
  const socket = createImSocket(h.deps);
  const outs = [];
  socket.subscribe((out) => outs.push(out.kind));
  const ws1 = await connectReady(h, socket);
  assert.equal(outs.includes("resync"), false, "第一次连上不用补");

  ws1.drop();
  assert.equal(socket.state(), "connecting", "掉线后对外仍是「正在连接」");
  await h.advance(999);
  assert.equal(h.sockets.length, 1, "1 秒内不重连");
  await h.advance(2);
  await h.flush();
  assert.equal(h.sockets.length, 2);
  // 第二个连接也没成功（没 ready 就掉线）→ 等 2 秒
  h.sockets[1].open();
  h.sockets[1].drop();
  await h.advance(1999);
  await h.flush();
  assert.equal(h.sockets.length, 2);
  await h.advance(2);
  await h.flush();
  assert.equal(h.sockets.length, 3);
  // 这次成功：补数据通知恰好一次，退避清零
  h.sockets[2].open();
  assert.equal(h.sockets[2].sent[0].type, "auth");
  h.sockets[2].recv({ type: "ready", user_id: "u1" });
  assert.equal(outs.filter((k) => k === "resync").length, 1);
  h.sockets[2].drop();
  await h.advance(1001);
  await h.flush();
  assert.equal(h.sockets.length, 4, "成功之后退避从 1 秒重新算");
});

test("4401（token 失效）重连时重新取 token", async () => {
  const h = harness({ tokens: ["old", "new"] });
  const socket = createImSocket(h.deps);
  const ws = await connectReady(h, socket);
  assert.equal(ws.sent[0].token, "old");
  ws.drop(4401);
  await h.advance(1100);
  await h.flush();
  h.sockets[1].open();
  assert.equal(h.sockets[1].sent[0].token, "new");
});

test("token 续期发 auth.refresh；没连上时不发", async () => {
  const h = harness();
  const socket = createImSocket(h.deps);
  socket.tokenChanged("early");
  const ws = await connectReady(h, socket);
  socket.tokenChanged("tok-2");
  assert.deepEqual(ws.sent.at(-1), { type: "auth.refresh", token: "tok-2" });
  socket.tokenChanged(null);
  assert.equal(ws.sent.filter((f) => f.type === "auth.refresh").length, 1);
});

test("标签页隐藏或 5 分钟没操作 → presence away；回来 → active", async () => {
  const h = harness();
  const socket = createImSocket(h.deps);
  const ws = await connectReady(h, socket);
  const presences = () => ws.sent.filter((f) => f.type === "presence").map((f) => f.state);
  assert.deepEqual(presences(), ["active"], "连上就报一次 active");

  h.state.hidden = true;
  socket.noteVisibility();
  assert.deepEqual(presences(), ["active", "away"]);
  socket.noteVisibility(); // 重复通知不重复发
  assert.deepEqual(presences(), ["active", "away"]);
  h.state.hidden = false;
  socket.noteVisibility();
  assert.deepEqual(presences(), ["active", "away", "active"]);

  await h.advance(IDLE_MS - 1000);
  socket.noteActivity(); // 4 分 59 秒时操作一下，重新计时
  await h.advance(IDLE_MS - 1000);
  assert.deepEqual(presences(), ["active", "away", "active"], "还没到 5 分钟没操作");
  await h.advance(1500);
  assert.deepEqual(presences(), ["active", "away", "active", "away"]);
  socket.noteActivity();
  assert.deepEqual(presences(), ["active", "away", "active", "away", "active"]);
});

test("隐藏的标签页上，用户操作不会把状态改回 active", async () => {
  const h = harness({ hidden: true });
  const socket = createImSocket(h.deps);
  const ws = await connectReady(h, socket);
  assert.deepEqual(ws.sent.filter((f) => f.type === "presence").map((f) => f.state), ["away"]);
  socket.noteActivity();
  assert.deepEqual(ws.sent.filter((f) => f.type === "presence").map((f) => f.state), ["away"]);
});

test("typing：每个会话 3 秒最多一次；线程与主线分开计；没连上不发", async () => {
  const h = harness();
  const socket = createImSocket(h.deps);
  socket.sendTyping("c1");
  const ws = await connectReady(h, socket);
  const typing = () => ws.sent.filter((f) => f.type === "typing");
  assert.equal(typing().length, 0, "没连上时的 typing 不补发");
  socket.sendTyping("c1");
  socket.sendTyping("c1");
  await h.advance(TYPING_GAP_MS - 1);
  socket.sendTyping("c1");
  assert.equal(typing().length, 1);
  await h.advance(2);
  socket.sendTyping("c1");
  assert.equal(typing().length, 2);
  socket.sendTyping("c2");
  socket.sendTyping("c1", "root-1");
  assert.equal(typing().length, 4);
  assert.deepEqual(typing().at(-1), { type: "typing", conversation_id: "c1", thread_root_id: "root-1" });
});

test("10 秒内没等到 ready：关掉重连", async () => {
  const h = harness();
  const socket = createImSocket(h.deps);
  socket.start();
  await h.flush();
  const ws = h.sockets[0];
  ws.open();
  await h.advance(AUTH_TIMEOUT_MS + 1);
  assert.equal(ws.closedWith, 4000);
  await h.advance(1100);
  await h.flush();
  assert.equal(h.sockets.length, 2);
});

test("stop：不再重连；旧连接晚到的回调被忽略；再 start 又能连", async () => {
  const h = harness();
  const socket = createImSocket(h.deps);
  const outs = [];
  socket.subscribe((o) => outs.push(o));
  const ws = await connectReady(h, socket);
  socket.stop();
  assert.equal(socket.state(), "closed");
  assert.equal(ws.closedWith, 1000);
  const n = outs.length;
  ws.recv({ type: "event", event: { type: "unread.changed", unread: {} } });
  ws.drop();
  await h.advance(60_000);
  await h.flush();
  assert.equal(h.sockets.length, 1);
  assert.equal(outs.length, n, "停掉之后不再有任何输出");
  socket.start();
  await h.flush();
  assert.equal(h.sockets.length, 2);
});

test("地址不可用（境内 / 网关地址不合格）→ disabled，不创建连接", async () => {
  const h = harness();
  const socket = createImSocket({ ...h.deps, url: () => null });
  socket.start();
  await h.flush();
  assert.equal(socket.state(), "disabled");
  assert.equal(h.sockets.length, 0);
});

test("网关地址 → ws 地址；境内与未登录不可用", () => {
  assert.equal(imSocketUrl("https://api.oceanleo.com"), "wss://api.oceanleo.com/v1/im/ws");
  assert.equal(imSocketUrl("https://api.dev.oceanleo.com/"), "wss://api.dev.oceanleo.com/v1/im/ws");
  assert.equal(imSocketUrl("http://127.0.0.1:8008"), "ws://127.0.0.1:8008/v1/im/ws");
  assert.equal(imSocketUrl(""), null);
  assert.equal(imSocketUrl("ftp://x"), null);
  assert.equal(imEnabledFor("cn", true), false);
  assert.equal(imEnabledFor("com", false), false);
  assert.equal(imEnabledFor("com", true), true);
  assert.equal(imEnabledFor("ws", true), true);
});
