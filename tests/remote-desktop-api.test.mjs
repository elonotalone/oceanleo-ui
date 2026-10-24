import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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

test.afterEach(() => {
  delete globalThis.__rdToken;
});

test("端点、方法与用户 Bearer 与固定接口 v1 一致，设备密钥不出现", async () => {
  const calls = mockFetch((url) => {
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
      ["GET", `${base}/status`],
      ["POST", `${base}/sessions`],
      ["GET", `${base}/sessions/s%201/frame`],
      ["POST", `${base}/sessions/s%201/input`],
      ["DELETE", `${base}/sessions/s%201`],
    ],
  );
  for (const call of calls) {
    assert.equal(call.init.headers.Authorization, "Bearer user-token");
    assert.equal(call.init.cache, "no-store");
  }
  assert.deepEqual(JSON.parse(calls[3].init.body), {
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
