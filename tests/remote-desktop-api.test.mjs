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

test("a reconnect floor is seeded directly and invalid floors fail closed", () => {
  let sequence = 0;
  const scheduler = { seed(value) { sequence = value; } };
  assert.equal(api.seedRemoteInputScheduler(scheduler, 41), true); assert.equal(sequence, 41);
  assert.equal(api.seedRemoteInputScheduler(scheduler, -1), false); assert.equal(sequence, 41);
});

test("media negotiation uses existing owner/controller authorization and accepts only receive-only viewer descriptors", async () => {
  const media = { provider: "artc", transport: "artc-v1", app_id: "app", channel_id: "session", user_id: "viewer", publisher_id: "desktop", token: "opaque", timestamp: 2000000000, expires_at: "2033-05-18T03:33:20Z", role: "viewer", track: "screen", camera: false, microphone: false, data_channel_input: true };
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

test("media negotiation distinguishes missing gateway routes from expired sessions and permission refusals", async () => {
  for (const [status, body, error] of [
    [404, { detail: "Not Found" }, "media_gateway_unsupported"],
    [405, { detail: "Method Not Allowed" }, "media_gateway_unsupported"],
    [501, {}, "media_gateway_unsupported"],
    [404, { detail: { code: "session_not_found" } }, "session_not_found"],
    [403, { detail: { code: "controller_revoked" } }, "controller_revoked"],
    [409, { detail: { code: "signed_out" } }, "signed_out"],
  ]) {
    const calls = mockFetch(() => ({ status, body }));
    assert.deepEqual(await api.remoteDesktopClient.negotiateMedia("synthetic-device", "synthetic-session"), { ok: false, status, error });
    assert.equal(calls.length, 1, "no fallback request or session creation");
  }
});

test("publisher diagnostics retain only versioned safe numeric metadata", () => {
  const result = api.parseRemoteMediaStatus({ state: "publishing", geometry: { display_id: "a", width: Infinity, height: 100 }, metrics: {
    version: 1, capture_frames: 2, pushes: 0, sdk_encode_fps: 15, first_capture_ms: null, first_push_ms: -1,
    sdk_sent_fps: "30", sdk_age_ms: Infinity, tick_calls: Number.MAX_SAFE_INTEGER + 1, token: "discard", arbitrary: "discard",
  } });
  assert.deepEqual(result, { state: "publishing", metrics: { version: 1, capture_frames: 2, pushes: 0, sdk_encode_fps: 15 } });
  assert.equal(api.parseRemoteMediaStatus({ state: "starting", metrics: { version: 2, pushes: 4 } }).metrics, undefined);
});

test.afterEach(() => {
  delete globalThis.__rdToken;
});

test("没有登录令牌不发请求", async () => {
  globalThis.__rdToken = null;
  const calls = mockFetch(() => ({ status: 200, body: {} }));
  const result = await api.remoteDesktopClient.getStatus("d1");
  assert.deepEqual([result.ok, result.error, result.status], [false, "unauthorized", 401]);
  assert.equal(calls.length, 0);
});

test("owner-direct sessions carry an explicit owner bit; ordinary and agent requests stay consent-gated", async () => {
  const calls = mockFetch((url) => url.endsWith("/controllers")
    ? { status: 200, body: { controller_id: "viewer-1" } }
    : { status: 200, body: { session_id: "s-owner", state: "connecting", transport: "websocket-v2" } });
  const result = await api.remoteDesktopClient.createSession("device-1", { ownerDirect: true, requestId: "owner_1234" });
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(calls.find((call) => call.url.endsWith("/sessions")).init.body), {
    request_id: "owner_1234", media: ["artc-v1"], owner_direct: true,
  });
  const ordinary = await api.remoteDesktopClient.createSession("device-1", { requestId: "agent_1234" });
  assert.equal(ordinary.ok, true);
  assert.equal(JSON.parse(calls.filter((call) => call.url.endsWith("/sessions")).at(-1).init.body).owner_direct, undefined);
});

test("the owner-handshake marker is kept only on a pending create reply", async () => {
  let reply = { session_id: "s-owner", state: "pending_consent", transport: "websocket-v2", owner_handshake: true };
  mockFetch((url) => url.endsWith("/controllers") ? { status: 200, body: { controller_id: "viewer-1" } } : { status: 200, body: reply });
  const pending = await api.remoteDesktopClient.createSession("device-1", { ownerDirect: true, requestId: "owner_5678" });
  assert.equal(pending.data.owner_handshake, true);
  reply = { ...reply, state: "connecting" };
  const live = await api.remoteDesktopClient.createSession("device-1", { ownerDirect: true, requestId: "owner_5679" });
  assert.equal("owner_handshake" in live.data, false);
  reply = { ...reply, state: "pending_consent", owner_handshake: "yes" };
  const odd = await api.remoteDesktopClient.createSession("device-1", { ownerDirect: true, requestId: "owner_5680" });
  assert.equal("owner_handshake" in odd.data, false);
});

test("HTTP 失败解出码；detail 对象 / 字符串 / 顶层 code 都认；409 保留状态", async () => {
  mockFetch(() => ({ status: 409, body: { detail: { code: "session_active" } } }));
  let result = await api.remoteDesktopClient.createSession("d1");
  assert.deepEqual([result.ok, result.error, result.status], [false, "session_active", 409]);
  mockFetch(() => ({ status: 403, body: { detail: "remote_desktop_disabled" } }));
  result = await api.remoteDesktopClient.createSession("d1");
  assert.equal(result.error, "remote_desktop_disabled");
  mockFetch(() => ({ status: 502 }));
  result = await api.remoteDesktopClient.negotiateMedia("d1", "s");
  assert.equal(result.error, "HTTP 502");
});

test("网络异常是 network_error；取消是 aborted，不当成网络故障", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  assert.equal((await api.remoteDesktopClient.negotiateMedia("d1", "s")).error, "network_error");
  const controller = new AbortController();
  globalThis.fetch = async () => {
    controller.abort();
    throw new DOMException("aborted", "AbortError");
  };
  const result = await api.remoteDesktopClient.negotiateMedia("d1", "s", undefined, { signal: controller.signal });
  assert.equal(result.error, "aborted");
});

test("signed-out availability is not replaced by the legacy online flag", async () => {
  mockFetch(() => ({ status: 200, body: { supported: true, enabled: false, online: true, session_id: null, availability: "signed_out" } }));
  assert.equal((await api.remoteDesktopClient.getStatus("mac")).data.availability, "signed_out");
});

test("viewer never persists picture/input/secrets; localStorage contains only the per-user dock preference", async () => {
  const source = (
    await Promise.all(
      ["src/api/remote-desktop.ts", "src/pages/RemoteDesktopPanel.tsx", "src/pages/remote-desktop-input.ts", "src/pages/remote-desktop-panel-state.ts", "src/pages/remote-desktop-session.ts", "src/pages/remote-desktop-panel-media.ts", "src/pages/remote-desktop-panel-input.ts", "src/pages/remote-desktop-toolbar.ts"].map(
        (file) => readFile(resolve(file), "utf8"),
      ),
    )
  ).join("\n");
  for (const forbidden of [
    "device_secret",
    "Device ",
    "sessionStorage",
    "indexedDB",
    "127.0.0.1",
    "localhost",
    "console.log",
  ]) {
    assert.ok(!source.includes(forbidden), `不该出现：${forbidden}`);
  }
  const writes = [...source.matchAll(/localStorage\.setItem\(([^;]+)\);/g)].map(match => match[1]);
  assert.deepEqual(writes, ["positionKey.current, JSON.stringify(model.getSnapshot().dock)"]);

});

function binaryPacket(sequence = 1) {
  const bytes = new ArrayBuffer(28), view = new DataView(bytes);
  view.setUint32(0, 0x4f4c5244); view.setUint32(4, 0x02010000);
  view.setUint32(8, 1920); view.setUint32(12, 1080); view.setUint32(20, sequence);
  new Uint8Array(bytes, 24).set([0xff, 0xd8, 0xff, 0xd9]);
  return bytes;
}

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
  const log = { states: [], frames: [], errors: [], congestion: [], timings: [] };
  const promise = api.remoteDesktopClient.openStream("d1", "private-handle", { state: (...state) => log.states.push(state), frame: (frame) => log.frames.push(frame), error: (error) => log.errors.push(error), congestion: (busy) => log.congestion.push(busy), controlTiming: sample => log.timings.push(sample) });
  await new Promise((resolve) => setImmediate(resolve));
  const socket = FakeSocket.latest;
  socket.onopen();
  socket.message({ type: "state", state: "pending_consent" });
  return { socket, stream: (await promise).data, log };
}


test("an unexplained viewer socket close is a network error, not device offline", async () => {
  const { socket, log } = await streamHarness();
  socket.onclose();
  assert.deepEqual(log.errors, ["network_error"]);
});

test("generic stream failure is mapped to network error while explicit device offline is retained", async () => {
  for (const [reason, expected] of [["stream_failed", "network_error"], ["device_lost", "device_lost"]]) {
    const { socket, log } = await streamHarness();
    socket.message({ type: "state", state: "closed", error: reason });
    assert.deepEqual(log.states.at(-1), ["closed", expected]);
  }
});

test("createSession retries a lost reply with the SAME request id and declares ARTC (2026-10-31)", async () => {
  let sessionPosts = 0;
  const calls = mockFetch((url) => {
    if (url.endsWith("/v1/devices/controllers")) return { status: 200, body: { controller_id: "ctl-1" } };
    if (url.endsWith("/remote-desktop/sessions")) {
      sessionPosts += 1;
      if (sessionPosts === 1) throw new TypeError("Failed to fetch"); // reached the gateway, reply lost
      return { status: 200, body: { session_id: "s-1", state: "pending_consent", transport: "websocket-v2", billing: null } };
    }
    return { status: 404, body: {} };
  });
  const result = await api.remoteDesktopClient.createSession("d-1", { requestId: "rq_test_0001" });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.session_id, "s-1");
  const bodies = calls.filter((call) => call.url.endsWith("/sessions")).map((call) => JSON.parse(call.init.body));
  assert.deepEqual(bodies, [{ request_id: "rq_test_0001", media: ["artc-v1"] }, { request_id: "rq_test_0001", media: ["artc-v1"] }]);
  assert.ok(calls.every((call) => call.init.signal), "every attempt carries its own timeout signal");
});

test("a gateway refusal is never retried as if it were the network", async () => {
  let posts = 0;
  mockFetch((url) => {
    if (url.endsWith("/v1/devices/controllers")) return { status: 200, body: { controller_id: "ctl-1" } };
    posts += 1;
    return { status: 409, body: { detail: { code: "session_active" } } };
  });
  const result = await api.remoteDesktopClient.createSession("d-1", { requestId: "rq_test_0002" });
  assert.deepEqual([result.ok, result.error, posts], [false, "session_active", 1]);
  assert.equal(api.isNetworkFailure("request_timeout"), true);
  assert.match(api.newRequestId(), /^[A-Za-z0-9_-]{8,80}$/);
});
