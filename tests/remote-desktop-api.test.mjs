import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const storage = new Map();
globalThis.window = { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };

const api = await import(
  await compileModule("src/api/remote-desktop.ts", {
    "../lib/auth/client": dataModule(
      `export async function accessToken(){ return globalThis.__rdToken === undefined ? "user-token" : globalThis.__rdToken; }`,
    ),
    "../lib/auth/config": dataModule(`export const GATEWAY_BASE = "https://gw.test";`),
  })
);

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const reply = await handler(url, init);
    return {
      ok: reply.status < 400,
      status: reply.status,
      async json() {
        if (reply.body === undefined) throw new Error("no body");
        return reply.body;
      },
    };
  };
  return calls;
}

const JPEG = "data:image/jpeg;base64,/9j/AAAA";

test("media negotiation uses existing owner/controller authorization and accepts only receive-only viewer descriptors", async () => {
  const media = { provider: "artc", transport: "artc-v1", app_id: "app", channel_id: "session", user_id: "viewer", publisher_id: "desktop", token: "opaque", timestamp: 2000000000, expires_at: "2033-05-18T03:33:20Z", role: "viewer", track: "screen", camera: false, microphone: false };
  const calls = mockFetch(() => ({ status: 200, body: { media, media_status: { state: "publishing", geometry: { display_id: "monitor-2", width: 1920, height: 1080 } } } }));
  const result = await api.remoteDesktopClient.negotiateMedia("d/1", "session 1", "monitor-2");
  assert.equal(result.ok, true);
  assert.equal(calls[0].url, "https://gw.test/v1/devices/d%2F1/remote-desktop/sessions/session%201/media");
  assert.equal(calls[0].init.headers.Authorization, "Bearer user-token");
  assert.match(calls[0].init.headers["X-OceanLeo-Controller"], /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(calls[0].init.body), { transport: "artc-v1", display_id: "monitor-2" });
  for (const invalid of [{ ...media, role: "publisher" }, { ...media, microphone: true }, { ...media, camera: true }, { ...media, track: "camera" }, { ...media, expires_at: "invalid" }, { ...media, publisher_id: "" }]) assert.equal(api.parseRemoteMedia(invalid), null);
  assert.equal(api.parseRemoteMediaStatus({ state: "publishing", geometry: { display_id: "a", width: -1, height: 100 } }).geometry, undefined);
});

test.afterEach(() => {
  delete globalThis.__rdToken;
});

test("端点、方法与用户 Bearer 与固定接口 v1 一致，设备密钥不出现", async () => {
  const calls = mockFetch((url) => {
    if (url.endsWith("/controllers")) return { status: 200, body: { controller_id: "viewer-1" } };
    if (url.endsWith("/status")) {
      return { status: 200, body: { supported: true, enabled: true, online: true, session_id: null } };
    }
    if (url.endsWith("/sessions")) {
      return { status: 200, body: { session_id: "s 1", state: "connecting", expires_at: "2026-10-24T22:00:00Z" } };
    }
    if (url.endsWith("/frame")) {
      return {
        status: 200,
        body: { state: "active", frame: { image: JPEG, width: 1280, height: 720, sequence: 3 } },
      };
    }
    if (url.endsWith("/input")) return { status: 200, body: { accepted: true, seq: 7 } };
    return { status: 200, body: { closed: true } };
  });

  const status = await api.remoteDesktopClient.getStatus("d/1");
  assert.deepEqual(status.data, { supported: true, enabled: true, online: true, session_id: null });
  const created = await api.remoteDesktopClient.createSession("d/1");
  assert.equal(created.data.session_id, "s 1");
  const frame = await api.remoteDesktopClient.getFrame("d/1", "s 1");
  assert.equal(frame.data.frame.sequence, 3);
  const sent = await api.remoteDesktopClient.sendInput("d/1", "s 1", 7, { kind: "click", x: 0.5, y: 0.25, button: "left" });
  assert.deepEqual(sent.data, { accepted: true, seq: 7 });
  const closed = await api.remoteDesktopClient.closeSession("d/1", "s 1");
  assert.deepEqual(closed.data, { closed: true });

  const base = "https://gw.test/v1/devices/d%2F1/remote-desktop";
  assert.deepEqual(
    calls.map((call) => [call.init.method || "GET", call.url]),
    [
      ["POST", "https://gw.test/v1/devices/controllers"],
      ["GET", `${base}/status`],
      ["POST", `${base}/sessions`],
      ["GET", `${base}/sessions/s%201/frame`],
      ["POST", `${base}/sessions/s%201/input`],
      ["DELETE", `${base}/sessions/s%201`],
    ],
  );
  for (const call of calls) {
    assert.equal(call.init.headers.Authorization, "Bearer user-token");
    assert.match(call.init.headers["X-OceanLeo-Controller"], /^[a-f0-9]{64}$/);
    assert.equal(call.init.cache, "no-store");
  }
  assert.deepEqual(JSON.parse(calls[4].init.body), {
    seq: 7,
    action: { kind: "click", x: 0.5, y: 0.25, button: "left" },
  });
});

test("没有登录令牌不发请求", async () => {
  globalThis.__rdToken = null;
  const calls = mockFetch(() => ({ status: 200, body: {} }));
  const result = await api.remoteDesktopClient.getStatus("d1");
  assert.deepEqual([result.ok, result.error, result.status], [false, "unauthorized", 401]);
  assert.equal(calls.length, 0);
});

test("HTTP 失败解出码；detail 对象 / 字符串 / 顶层 code 都认；409 保留状态", async () => {
  mockFetch(() => ({ status: 409, body: { detail: { code: "session_active" } } }));
  let result = await api.remoteDesktopClient.createSession("d1");
  assert.deepEqual([result.ok, result.error, result.status], [false, "session_active", 409]);
  mockFetch(() => ({ status: 403, body: { detail: "remote_desktop_disabled" } }));
  result = await api.remoteDesktopClient.createSession("d1");
  assert.equal(result.error, "remote_desktop_disabled");
  mockFetch(() => ({ status: 502 }));
  result = await api.remoteDesktopClient.getFrame("d1", "s");
  assert.equal(result.error, "HTTP 502");
});

test("网络异常是 network_error；取消是 aborted，不当成网络故障", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  assert.equal((await api.remoteDesktopClient.getFrame("d1", "s")).error, "network_error");
  const controller = new AbortController();
  globalThis.fetch = async () => {
    controller.abort();
    throw new DOMException("aborted", "AbortError");
  };
  const result = await api.remoteDesktopClient.getFrame("d1", "s", { signal: controller.signal });
  assert.equal(result.error, "aborted");
});

test("读不懂的响应形状按 response_malformed 处理，不把脏图喂给页面", async () => {
  mockFetch(() => ({ status: 200, body: { supported: "yes" } }));
  assert.equal((await api.remoteDesktopClient.getStatus("d1")).error, "response_malformed");
  mockFetch(() => ({ status: 200, body: { state: "active", frame: { image: "javascript:alert(1)", width: 1, height: 1, sequence: 1 } } }));
  assert.equal((await api.remoteDesktopClient.getFrame("d1", "s")).error, "response_malformed");
  mockFetch(() => ({ status: 200, body: { state: "active", frame: { image: JPEG, width: 0, height: 1, sequence: 1 } } }));
  assert.equal((await api.remoteDesktopClient.getFrame("d1", "s")).error, "response_malformed");
  mockFetch(() => ({ status: 200, body: { state: "weird", frame: null } }));
  assert.equal((await api.remoteDesktopClient.getFrame("d1", "s")).error, "response_malformed");
  mockFetch(() => ({ status: 200, body: {} }));
  assert.equal((await api.remoteDesktopClient.createSession("d1")).error, "response_malformed");
});

test("PNG 兼容；connecting 无帧与 closed 带 error 均可解析", () => {
  const png = api.parseFrame({
    state: "active",
    frame: { image: "data:image/png;base64,AAAA", width: 10, height: 5, sequence: 0 },
  });
  assert.equal(png.frame.width, 10);
  assert.deepEqual(api.parseFrame({ state: "connecting", frame: null }), { state: "connecting", frame: null });
  assert.deepEqual(api.parseFrame({ state: "closed", frame: null, error: "device_offline" }), {
    state: "closed",
    frame: null,
    error: "device_offline",
  });
});

test("pending consent is preserved and can never carry a desktop frame", async () => {
  mockFetch((url) => url.endsWith("/controllers") ? { status: 200, body: { controller_id: "controller-1" } } : { status: 200, body: { session_id: "pending-1", state: "pending_consent", expires_at: "2026-10-25T12:00:00Z" } });
  const created = await api.remoteDesktopClient.createSession("mac");
  assert.equal(created.data.state, "pending_consent");
  assert.deepEqual(api.parseFrame({ state: "pending_consent", frame: null }), { state: "pending_consent", frame: null });
  assert.equal(api.parseFrame({ state: "pending_consent", frame: { image: JPEG, width: 1, height: 1, sequence: 1 } }), null);
  assert.equal(api.parseFrame({ state: "closed", frame: { image: JPEG, width: 1, height: 1, sequence: 1 } }), null);
});

test("signed-out availability is not replaced by the legacy online flag", async () => {
  mockFetch(() => ({ status: 200, body: { supported: true, enabled: false, online: true, session_id: null, availability: "signed_out" } }));
  assert.equal((await api.remoteDesktopClient.getStatus("mac")).data.availability, "signed_out");
});

test("源码不含设备密钥 / 本机令牌 / 本地存储路径，画面不落盘", async () => {
  const source = (
    await Promise.all(
      ["src/api/remote-desktop.ts", "src/pages/RemoteDesktopPanel.tsx", "src/pages/remote-desktop-input.ts"].map(
        (file) => readFile(resolve(file), "utf8"),
      ),
    )
  ).join("\n");
  for (const forbidden of [
    "device_secret",
    "Device ",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "127.0.0.1",
    "localhost",
    "console.log",
  ]) {
    assert.ok(!source.includes(forbidden), `不该出现：${forbidden}`);
  }
});

function binaryPacket(sequence = 1) {
  const bytes = new ArrayBuffer(28), view = new DataView(bytes);
  view.setUint32(0, 0x4f4c5244); view.setUint32(4, 0x02010000);
  view.setUint32(8, 1920); view.setUint32(12, 1080); view.setUint32(20, sequence);
  new Uint8Array(bytes, 24).set([0xff, 0xd8, 0xff, 0xd9]);
  return bytes;
}

test("v2 binary envelope rejects wrong headers, dimensions, unsafe sequence and oversized bytes", () => {
  assert.equal(api.parseBinaryFrame(binaryPacket()).width, 1920);
  for (const offset of [0, 4, 8, 12]) {
    const packet = binaryPacket(); new DataView(packet).setUint32(offset, 0);
    assert.equal(api.parseBinaryFrame(packet), null);
  }
  const packet = binaryPacket(); new DataView(packet).setUint32(16, 0x200000);
  assert.equal(api.parseBinaryFrame(packet), null);
  assert.equal(api.parseBinaryFrame(new ArrayBuffer(1_500_025)), null);
});

class FakeSocket {
  static OPEN = 1;
  static latest;
  readyState = 1;
  bufferedAmount = 0;
  sent = [];
  constructor(url) { this.url = url; FakeSocket.latest = this; }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; }
  message(data) { this.onmessage({ data: typeof data === "object" && !(data instanceof ArrayBuffer) ? JSON.stringify(data) : data }); }
}

async function streamHarness() {
  window.location = { href: "https://oceanleo.com/devices" };
  globalThis.WebSocket = FakeSocket;
  const log = { states: [], frames: [], errors: [], congestion: [] };
  const promise = api.remoteDesktopClient.openStream("d1", "private-handle", { state: (...state) => log.states.push(state), frame: (frame) => log.frames.push(frame), error: (error) => log.errors.push(error), congestion: (busy) => log.congestion.push(busy) });
  await new Promise((resolve) => setImmediate(resolve));
  const socket = FakeSocket.latest;
  socket.onopen();
  socket.message({ type: "state", state: "pending_consent" });
  return { socket, stream: (await promise).data, log };
}

test("v2 authenticates only inside the private socket, refuses input before approval, and ACKs displayed frames", async () => {
  const { socket, stream, log } = await streamHarness();
  try {
    assert.doesNotMatch(socket.url, /user-token|controller=|token=/);
    assert.equal(socket.sent[0].type, "auth");
    assert.equal(socket.sent[0].token, "user-token");
    assert.equal(stream.send({ kind: "key_down", key: "Shift" }), false);
    socket.message({ type: "state", state: "active" });
    assert.equal(stream.send({ kind: "key_down", key: "Shift" }), true);
    socket.message({ type: "input_ack", seq: 1 });
    socket.message(binaryPacket());
    assert.equal(log.frames[0].sequence, 1);
    assert.match(log.frames[0].image, /^blob:/);
    assert.equal(socket.sent.filter((message) => message.type === "frame_ack").length, 0);
    stream.acknowledgeFrame(1);
    assert.deepEqual(socket.sent.at(-1), { type: "frame_ack", sequence: 1 });
  } finally { stream.close(); }
});

test("v2 never accepts a frame before approval and bounds executed-unacknowledged inputs", async () => {
  let harness = await streamHarness();
  harness.socket.message(binaryPacket());
  assert.deepEqual(harness.log.errors, ["response_malformed"]);
  assert.equal(harness.log.frames.length, 0);
  harness = await streamHarness();
  harness.socket.message({ type: "state", state: "active" });
  try {
    for (let index = 0; index < 8; index++) {
      assert.equal(harness.stream.send({ kind: "key_down", key: "a" }), true);
      harness.socket.message({ type: "input_ack", seq: index + 1 });
    }
    for (let index = 0; index < 1000; index++) assert.equal(harness.stream.send({ kind: "move", x: index / 1000, y: .5 }), true);
    assert.equal(harness.stream.send({ kind: "key_up", key: "a" }), true);
    assert.equal(harness.socket.sent.filter((message) => message.type === "input").length, 8);
    assert.deepEqual(harness.log.errors, []);
    assert.equal(harness.socket.readyState, 1);
    harness.socket.message({ type: "state", state: "active", acked_seq: 8 });
    assert.equal(harness.socket.sent.at(-2).action.kind, "move");
    assert.equal(harness.socket.sent.at(-1).action.kind, "key_up");
  } finally { harness.stream.close(); }
});

test("recoverable rejection and local socket pressure preserve pixels and resume without reconnect", async () => {
  const { socket, stream, log } = await streamHarness();
  try {
    socket.message({ type: "state", state: "active", acked_seq: 0 });
    socket.message(binaryPacket());
    socket.bufferedAmount = 65_000;
    stream.acknowledgeFrame(1);
    assert.equal(stream.send({ kind: "move", x: .2, y: .3 }), true);
    assert.equal(socket.sent.filter((item) => item.type === "input").length, 0);
    assert.equal(log.frames.length, 1);
    assert.deepEqual(log.errors, []);
    socket.bufferedAmount = 0;
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(socket.sent.filter((item) => item.type === "frame_ack").length, 1, "buffer pressure must not lose frame credit");
    assert.equal(socket.sent.at(-1).seq, 1);
    socket.message({ type: "input_rejected", seq: 1, error: "rate_limited", retry_after_ms: 25 });
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.deepEqual(socket.sent.filter((item) => item.type === "input").map((item) => item.seq), [1, 1]);
    socket.message({ type: "input_ack", seq: 1 });
    socket.message({ type: "state", state: "active", acked_seq: 1 });
    assert.equal(log.congestion.at(-1), false);
    assert.equal(socket.readyState, 1);
  } finally { stream.close(); }
});

test("a throwing socket write is never retried, including release, and closes as unknown", async () => {
  const { socket, stream, log } = await streamHarness();
  socket.message({ type: "state", state: "active", acked_seq: 0 });
  let attempts = 0;
  socket.send = () => { attempts++; throw new Error("uncertain write"); };
  stream.send({ kind: "type", text: "do not repeat" });
  stream.send({ kind: "pointer_up" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(attempts, 1);
  assert.deepEqual(log.errors, ["input_ack_unknown"]);
  assert.equal(socket.readyState, 3);
  stream.close();
});
