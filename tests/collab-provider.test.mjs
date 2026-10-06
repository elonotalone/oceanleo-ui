import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";

import { CollabTicketError, createCollabProvider } from "../src/shell/collab/provider.ts";
import { colorForUser } from "../src/shell/collab/color.ts";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(predicate, label = "condition", timeout = 2000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error(`timeout waiting for ${label}`);
    await sleep(5);
  }
}

// ---------------------------------------------------------------- 假 WebSocket + 假服务端
class FakeSocket {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.binaryType = "blob";
    this.sent = []; // 客户端发出的帧：string | Uint8Array
    this.closedWith = null;
    this.onopen = this.onmessage = this.onclose = this.onerror = null;
    FakeSocket.instances.push(this);
    queueMicrotask(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      this.onopen?.({});
    });
  }
  send(data) {
    this.sent.push(data);
  }
  close(code = 1000) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.closedWith = code;
    queueMicrotask(() => this.onclose?.({ code }));
  }
  // —— 服务端动作
  serverText(obj) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  serverBinary(bytes) {
    this.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  }
  serverDrop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
  texts() {
    return this.sent.filter((d) => typeof d === "string").map((d) => JSON.parse(d));
  }
  binaries() {
    return this.sent.filter((d) => typeof d !== "string");
  }
}

function frame(type, write) {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, type);
  write(enc);
  return encoding.toUint8Array(enc);
}
const syncStep1Frame = (doc) => frame(0, (e) => syncProtocol.writeSyncStep1(e, doc));
const syncStep2Frame = (doc, sv) => frame(0, (e) => syncProtocol.writeSyncStep2(e, doc, sv));
const awarenessFrame = (aw, ids) => frame(1, (e) => encoding.writeVarUint8Array(e, awarenessProtocol.encodeAwarenessUpdate(aw, ids)));

/** 解一帧二进制：返回 {kind: "step1"|"step2"|"update"|"awareness", payload} */
function parseBinary(bytes) {
  const d = decoding.createDecoder(bytes);
  const type = decoding.readVarUint(d);
  if (type === 1) return { kind: "awareness", payload: decoding.readVarUint8Array(d) };
  const sub = decoding.readVarUint(d);
  return { kind: ["step1", "step2", "update"][sub], payload: decoding.readVarUint8Array(d) };
}

const ME = { id: "user-me", name: "我", color: colorForUser("user-me"), avatar_url: null };
const OTHER = { id: "user-other", name: "他", color: "hsl(1, 1%, 1%)", avatar_url: "javascript:alert(1)" };

function ticketFactory(overrides = {}) {
  const calls = [];
  const fn = async () => {
    const n = calls.length + 1;
    calls.push(n);
    if (overrides.fail) {
      const f = overrides.fail(n);
      if (f) throw f;
    }
    return {
      ticket: `ticket-${n}`,
      room_key: "artifact:a1",
      role: overrides.role ?? "editor",
      ws_path: "/v1/collab/ws",
      needs_seed: overrides.needsSeed ?? false,
      self: ME,
    };
  };
  fn.calls = calls;
  return fn;
}

function setup(over = {}) {
  FakeSocket.instances = [];
  const fetchTicket = ticketFactory(over.ticket);
  const provider = createCollabProvider({
    roomKey: "artifact:a1",
    fetchTicket,
    wsUrl: (path) => `wss://gateway.test${path}`,
    WebSocketImpl: FakeSocket,
    backoffInitialMs: 10,
    backoffMaxMs: 40,
    renewIntervalMs: 15,
    acquireTimeoutMs: 80,
    readyTimeoutMs: 200,
    ...over.provider,
  });
  return { provider, fetchTicket };
}

const READY = { type: "ready", room_key: "artifact:a1", role: "editor", needs_seed: false, is_saver: true, lock: null };

async function connectReady(over = {}, ready = {}) {
  const ctx = setup(over);
  await until(() => FakeSocket.instances.length === 1, "socket");
  const socket = FakeSocket.instances[0];
  await until(() => socket.sent.length > 0, "auth frame");
  socket.serverText({ ...READY, ...ready });
  return { ...ctx, socket };
}

// ---------------------------------------------------------------- 用例
test("第一帧是 auth（带票），ready 之前不发任何二进制帧；ready 后发 step1 与自己的 awareness", async () => {
  const { provider, socket, fetchTicket } = await connectReady();
  try {
    assert.equal(socket.url, "wss://gateway.test/v1/collab/ws");
    assert.equal(socket.binaryType, "arraybuffer");
    assert.deepEqual(socket.sent[0], JSON.stringify({ type: "auth", ticket: "ticket-1" }));
    assert.equal(fetchTicket.calls.length, 1);
    assert.equal(provider.status, "syncing");
    assert.equal(provider.role, "editor");
    assert.equal(provider.isSaver, true);
    assert.equal(provider.roomKey, "artifact:a1");
    assert.deepEqual(provider.self, ME);
    const kinds = socket.binaries().map((b) => parseBinary(b).kind);
    assert.deepEqual(kinds, ["step1", "awareness"]);
  } finally {
    provider.destroy();
  }
});

test("sync：服务端 step2 带来文档内容并进入 synced；服务端 step1 → 客户端回 step2", async () => {
  const { provider, socket } = await connectReady();
  try {
    const server = new Y.Doc();
    server.getText("t").insert(0, "服务端已有的内容");
    // 回应客户端 step1
    socket.serverBinary(syncStep2Frame(server, Y.encodeStateVector(provider.doc)));
    assert.equal(provider.doc.getText("t").toString(), "服务端已有的内容");
    assert.equal(provider.status, "synced");

    // 服务端发 step1（它没有客户端本地内容）
    provider.doc.getMap("m").set("k", "客户端本地内容");
    const before = socket.binaries().length;
    socket.serverBinary(syncStep1Frame(new Y.Doc()));
    const replies = socket.binaries().slice(before).map(parseBinary);
    const step2 = replies.find((r) => r.kind === "step2");
    assert.ok(step2, "收到 step1 后回了 step2");
    const probe = new Y.Doc();
    Y.applyUpdate(probe, step2.payload);
    assert.equal(probe.getMap("m").get("k"), "客户端本地内容");
  } finally {
    provider.destroy();
  }
});

test("本地改动作为 sync update 发出；远端 update 应用但不回显", async () => {
  const { provider, socket } = await connectReady();
  try {
    const before = socket.binaries().length;
    provider.doc.getText("t").insert(0, "你好");
    const sent = socket.binaries().slice(before).map(parseBinary);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].kind, "update");
    const probe = new Y.Doc();
    Y.applyUpdate(probe, sent[0].payload);
    assert.equal(probe.getText("t").toString(), "你好");

    // 远端更新
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(provider.doc));
    remote.getText("t").insert(2, "，世界");
    const upd = Y.encodeStateAsUpdate(remote, Y.encodeStateVector(provider.doc));
    const n = socket.binaries().length;
    socket.serverBinary(frame(0, (e) => syncProtocol.writeUpdate(e, upd)));
    assert.equal(provider.doc.getText("t").toString(), "你好，世界");
    assert.equal(socket.binaries().length, n, "远端来的更新不再发回去");
  } finally {
    provider.destroy();
  }
});

test("viewer：本地更新不发出，也不回应服务端 step1；仍能收到远端更新", async () => {
  const { provider, socket } = await connectReady({}, { role: "viewer", is_saver: false });
  try {
    assert.equal(provider.role, "viewer");
    const before = socket.binaries().length;
    provider.doc.getText("t").insert(0, "viewer 偷改");
    socket.serverBinary(syncStep1Frame(new Y.Doc()));
    assert.equal(socket.binaries().length, before, "viewer 一帧都不发");

    const remote = new Y.Doc();
    remote.getText("t").insert(0, "别人的实时改动");
    socket.serverBinary(frame(0, (e) => syncProtocol.writeUpdate(e, Y.encodeStateAsUpdate(remote))));
    assert.ok(provider.doc.getText("t").toString().includes("别人的实时改动"));

    // 权限升级为 editor：重新发 step1 拉取
    const n = socket.binaries().length;
    socket.serverText({ type: "role", role: "editor" });
    assert.equal(provider.role, "editor");
    assert.equal(parseBinary(socket.binaries()[n]).kind, "step1");
  } finally {
    provider.destroy();
  }
});

test("awareness：房间里的其他人进 peers（颜色按 id 重算、头像只认 http(s)、自己不算）；离开后消失", async () => {
  const { provider, socket } = await connectReady();
  try {
    const seen = [];
    provider.subscribe(() => seen.push(provider.peers.map((p) => p.id)));
    const otherDoc = new Y.Doc();
    const otherAw = new awarenessProtocol.Awareness(otherDoc);
    otherAw.setLocalState({ user: OTHER, cursor: { anchor: 3 } });
    const selfTab = new awarenessProtocol.Awareness(new Y.Doc());
    selfTab.setLocalState({ user: ME });
    socket.serverBinary(awarenessFrame(otherAw, [otherAw.clientID]));
    socket.serverBinary(awarenessFrame(selfTab, [selfTab.clientID]));
    assert.equal(provider.peers.length, 1);
    assert.equal(provider.peers[0].id, "user-other");
    assert.equal(provider.peers[0].color, colorForUser("user-other"), "他人自报的颜色不信");
    assert.equal(provider.peers[0].avatar_url, null, "javascript: 头像被丢弃");
    assert.ok(seen.length >= 1);
    assert.deepEqual(provider.awareness.getStates().get(otherAw.clientID).cursor, { anchor: 3 });

    // 对方离开
    otherAw.setLocalState(null);
    socket.serverBinary(awarenessFrame(otherAw, [otherAw.clientID]));
    assert.equal(provider.peers.length, 0);
    otherAw.destroy();
    selfTab.destroy();
  } finally {
    provider.destroy();
  }
});

test("本机 awareness 的变化（光标）会发给服务端", async () => {
  const { provider, socket } = await connectReady();
  try {
    const before = socket.binaries().length;
    provider.awareness.setLocalStateField("cursor", { anchor: 7 });
    const frames = socket.binaries().slice(before).map(parseBinary);
    assert.equal(frames.at(-1).kind, "awareness");
    const probe = new awarenessProtocol.Awareness(new Y.Doc());
    awarenessProtocol.applyAwarenessUpdate(probe, frames.at(-1).payload, "test");
    const state = probe.getStates().get(provider.awareness.clientID);
    assert.equal(state.user.id, "user-me");
    assert.deepEqual(state.cursor, { anchor: 7 });
    probe.destroy();
  } finally {
    provider.destroy();
  }
});

test("控制帧：saver / lock / external_revision / role", async () => {
  const { provider, socket } = await connectReady();
  try {
    let notified = 0;
    provider.subscribe(() => (notified += 1));
    socket.serverText({ type: "saver", is_saver: false });
    assert.equal(provider.isSaver, false);
    socket.serverText({ type: "saver", is_saver: true });
    assert.equal(provider.isSaver, true);

    const lock = { holder: OTHER, mode: "pro", expires_at: new Date(Date.now() + 60000).toISOString() };
    socket.serverText({ type: "lock", lock });
    assert.equal(provider.lock.holder.id, "user-other");
    socket.serverText({ type: "lock", lock: null });
    assert.equal(provider.lock, null);

    const got = [];
    const off = provider.onExternalRevision((id, origin) => got.push([id, origin]));
    socket.serverText({ type: "external_revision", revision_id: "rev-9", origin: "ai" });
    socket.serverText({ type: "external_revision", revision_id: "rev-10" });
    assert.deepEqual(got, [["rev-9", "ai"], ["rev-10", "other"]]);
    off();
    socket.serverText({ type: "external_revision", revision_id: "rev-11", origin: "pro" });
    assert.equal(got.length, 2);

    socket.serverText({ type: "role", role: "viewer" });
    assert.equal(provider.role, "viewer");
    assert.ok(notified >= 4);
    socket.serverText("not json at all");
    socket.onmessage({ data: "{broken" });
    assert.equal(provider.role, "viewer", "坏帧被忽略");
  } finally {
    provider.destroy();
  }
});

test("锁：acquire 发 lock.acquire，收到自己持锁的 lock 帧 → true，之后每个间隔发 renew，release 发 release", async () => {
  const { provider, socket } = await connectReady();
  try {
    const p = provider.acquireLock();
    await until(() => socket.texts().some((t) => t.type === "lock.acquire"), "acquire frame");
    assert.deepEqual(socket.texts().find((t) => t.type === "lock.acquire"), { type: "lock.acquire", mode: "pro" });
    socket.serverText({ type: "lock", lock: { holder: ME, mode: "pro", expires_at: new Date(Date.now() + 60000).toISOString() } });
    assert.equal(await p, true);
    assert.equal(provider.lock.holder.id, "user-me");
    await until(() => socket.texts().filter((t) => t.type === "lock.renew").length >= 2, "renew x2");
    provider.releaseLock();
    assert.equal(socket.texts().at(-1).type, "lock.release");
    assert.equal(provider.lock, null);
    const renews = socket.texts().filter((t) => t.type === "lock.renew").length;
    await sleep(50);
    assert.equal(socket.texts().filter((t) => t.type === "lock.renew").length, renews, "释放后不再续");
  } finally {
    provider.destroy();
  }
});

test("锁：别人持有且未过期 → 不用问服务端直接 false；别人抢先 → false；没回复 → 超时 false", async () => {
  const { provider, socket } = await connectReady();
  try {
    socket.serverText({ type: "lock", lock: { holder: OTHER, mode: "pro", expires_at: new Date(Date.now() + 60000).toISOString() } });
    const asked = socket.texts().length;
    assert.equal(await provider.acquireLock(), false);
    assert.equal(socket.texts().length, asked, "没发 lock.acquire");

    // 对方的锁已过期（本地时间）→ 问服务端；服务端回另一个人的锁 → false
    socket.serverText({ type: "lock", lock: { holder: OTHER, mode: "pro", expires_at: new Date(Date.now() - 10000).toISOString() } });
    const p = provider.acquireLock();
    await until(() => socket.texts().some((t) => t.type === "lock.acquire"));
    socket.serverText({ type: "lock", lock: { holder: { ...OTHER, id: "third" }, mode: "pro", expires_at: new Date(Date.now() + 60000).toISOString() } });
    assert.equal(await p, false);

    socket.serverText({ type: "lock", lock: null });
    assert.equal(await provider.acquireLock(), false, "服务端不回话 → 超时 false");
  } finally {
    provider.destroy();
  }
});

test("markSaved / completeSeed 发对应控制帧；needsSeed 来自票和 ready", async () => {
  const { provider, socket } = await connectReady({ ticket: { needsSeed: true } }, { needs_seed: true });
  try {
    assert.equal(provider.needsSeed, true);
    provider.completeSeed(["oceanleo:grid", "oceanleo:grid"]);
    assert.deepEqual(socket.texts().find((t) => t.type === "seed.done"), { type: "seed.done", roots: ["oceanleo:grid"] });
    assert.equal(provider.needsSeed, false);
    provider.completeSeed(["x"]);
    assert.equal(socket.texts().filter((t) => t.type === "seed.done").length, 1, "只发一次");
    provider.markSaved("rev-1");
    assert.deepEqual(socket.texts().at(-1), { type: "mark", kind: "save", revision_id: "rev-1" });
  } finally {
    provider.destroy();
  }
});

test("断线：offline → 退避后重新拿票重连；离线时的本地改动在重连后合进服务端", async () => {
  const { provider, socket, fetchTicket } = await connectReady();
  try {
    const server = new Y.Doc();
    socket.serverBinary(syncStep2Frame(server, Y.encodeStateVector(provider.doc)));
    assert.equal(provider.status, "synced");

    socket.serverDrop(1006);
    assert.equal(provider.status, "offline");
    provider.doc.getText("t").insert(0, "离线时写的");

    await until(() => FakeSocket.instances.length === 2, "second socket");
    const s2 = FakeSocket.instances[1];
    await until(() => s2.sent.length > 0);
    assert.equal(fetchTicket.calls.length, 2, "重连重新拿票");
    assert.deepEqual(s2.sent[0], JSON.stringify({ type: "auth", ticket: "ticket-2" }));
    assert.equal(provider.status, "connecting");
    s2.serverText({ ...READY, is_saver: false });
    assert.equal(provider.status, "syncing");
    assert.equal(provider.isSaver, false);

    // 服务端的 step1（它还没有离线内容）→ 客户端 step2 带上离线改动
    const before = s2.binaries().length;
    s2.serverBinary(syncStep1Frame(server));
    const step2 = s2.binaries().slice(before).map(parseBinary).find((r) => r.kind === "step2");
    Y.applyUpdate(server, step2.payload);
    assert.equal(server.getText("t").toString(), "离线时写的");
    // 客户端自己的 step1 也被发出（拉服务端在离线期间的变化）
    assert.ok(s2.binaries().map(parseBinary).some((r) => r.kind === "step1"));
  } finally {
    provider.destroy();
  }
});

test("退避：连续失败按 10→20→40→40ms 递增（上限生效），成功后重置", async () => {
  const stamps = [];
  const { provider } = setup({
    ticket: {
      fail: (n) => {
        stamps.push(Date.now());
        return n <= 4 ? new CollabTicketError(503, "busy") : null;
      },
    },
  });
  try {
    await until(() => stamps.length === 5, "5 attempts", 3000);
    const gaps = stamps.slice(1).map((t, i) => t - stamps[i]);
    assert.ok(gaps[0] >= 8 && gaps[0] < 35, `gap0 ${gaps[0]}`);
    assert.ok(gaps[1] >= 18, `gap1 ${gaps[1]}`);
    assert.ok(gaps[2] >= 36, `gap2 ${gaps[2]}`);
    assert.ok(gaps[3] >= 36 && gaps[3] < 90, `gap3（上限）${gaps[3]}`);
    assert.equal(provider.status === "offline" || provider.status === "connecting", true);
    // 没连上过：按单人处理，可以存版本
    assert.equal(provider.isSaver, true);
  } finally {
    provider.destroy();
  }
});

test("拿票被拒绝（403）→ denied，不再重试；没连上过时按单人处理", async () => {
  const { provider, fetchTicket } = setup({ ticket: { fail: () => new CollabTicketError(403, "forbidden") } });
  try {
    await until(() => provider.status === "denied", "denied");
    await sleep(80);
    assert.equal(fetchTicket.calls.length, 1);
    assert.equal(FakeSocket.instances.length, 0);
    assert.equal(provider.isSaver, true);
  } finally {
    provider.destroy();
  }
});

test("服务端以 4403 / 1008 关闭 → denied，不重连", async () => {
  const { provider, socket, fetchTicket } = await connectReady();
  try {
    socket.serverDrop(4403);
    assert.equal(provider.status, "denied");
    await sleep(60);
    assert.equal(fetchTicket.calls.length, 1);
  } finally {
    provider.destroy();
  }
});

test("连上后迟迟不 ready → 主动关闭并重连", async () => {
  const { provider } = setup({ provider: { readyTimeoutMs: 30 } });
  try {
    await until(() => FakeSocket.instances.length === 1);
    await until(() => FakeSocket.instances[0].closedWith === 4000, "ready timeout close");
    await until(() => FakeSocket.instances.length === 2, "retry");
  } finally {
    provider.destroy();
  }
});

test("destroy：释放锁、告诉别人我离开、关连接、不再重连；之后的调用是空操作", async () => {
  const { provider, socket, fetchTicket } = await connectReady();
  const p = provider.acquireLock();
  await until(() => socket.texts().some((t) => t.type === "lock.acquire"));
  socket.serverText({ type: "lock", lock: { holder: ME, mode: "pro", expires_at: new Date(Date.now() + 60000).toISOString() } });
  await p;
  const clientId = provider.awareness.clientID;
  provider.destroy();
  assert.equal(socket.closedWith, 1000);
  const texts = socket.texts();
  assert.equal(texts.at(-1).type, "lock.release");
  // 最后一帧 awareness 是「我离开」（状态为 null）
  const lastAw = socket.binaries().map(parseBinary).filter((r) => r.kind === "awareness").at(-1);
  const probe = new awarenessProtocol.Awareness(new Y.Doc());
  probe.setLocalState({ user: ME });
  const probeStates = [];
  probe.on("update", (c) => probeStates.push(c));
  const peer = new awarenessProtocol.Awareness(new Y.Doc());
  awarenessProtocol.applyAwarenessUpdate(peer, lastAw.payload, "t");
  assert.equal(peer.getStates().has(clientId), false);
  probe.destroy();
  peer.destroy();
  provider.destroy(); // 重复 destroy 不抛
  assert.equal(await provider.acquireLock(), false);
  await sleep(60);
  assert.equal(fetchTicket.calls.length, 1);
  assert.equal(FakeSocket.instances.length, 1);
});

test("没有任何 iframe/postMessage：provider 只用 WebSocket（静态检查）", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/shell/collab/provider.ts", import.meta.url), "utf8");
  assert.equal(/postMessage|iframe|innerHTML|dangerouslySetInnerHTML/.test(src), false);
});
