// TG-D (thin-gateway wave, ANSWER TG-D-2): program install / login / key on a computer
// no longer ride the deleted agent-dialog socket; the pill's 「账号」 row and the CLI
// card's 安装 use useProgramAccess over the gateway's REST program controls.
// One behaviour per test, asserted on the requests sent and the state the flows read:
//  - the program's status is the computer's own probe row (GET …/options → status);
//  - 安装 sends the typed directory (default ~/.local = gateway default) and shows the
//    operation's progress lines, then its done line, then reads the status again;
//  - 登录 shows the operation's link, takes a pasted code, and ends "done" on success;
//  - a refused start shows the route's own code; 取消 cancels the running operation.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test, { beforeEach, afterEach } from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://oceanbizs.com/" });
for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator })) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The REST transport: every request is recorded; each path answers from `routes`.
const calls = [];
let routes = {};
globalThis.__programControls = { calls, answer: (path, init) => {
  const handler = routes[`${init?.method || "GET"} ${path}`];
  if (!handler) throw new Error(`unexpected ${init?.method || "GET"} ${path}`);
  return handler(init?.body ? JSON.parse(init.body) : undefined);
} };
const cloudComputerApi = dataModule(`
  export class CloudComputerError extends Error {
    constructor(code, message, status, retryAfter, detail) { super(message); this.code = code; this.status = status; if (detail) this.detail = detail; }
  }
  export async function cloudComputerRequest(path, init) {
    globalThis.__programControls.calls.push({ method: init?.method || "GET", path, body: init?.body ? JSON.parse(init.body) : undefined });
    return globalThis.__programControls.answer(path, init);
  }
`);
const { useProgramAccess, OPERATION_POLL_MS } = await import(await compileModule("src/shell/cloud-computer/native-surface/useProgramAccess.ts", {
  "../../../lib/cloud-computer-api": cloudComputerApi,
}));

const { LoginFlow } = await import(await compileModule("src/shell/cloud-computer/native-surface/ProgramAccess.tsx", {
  "../agent-dialog/program-key-api": dataModule(`export class ProgramKeyError extends Error {} export function removeProgramKey(){} export function saveProgramKey(){}`),
  "../../../i18n/ui/useUI": dataModule(`export function useUI(){ return text => text; }`),
}));
let errors;
const originalError = console.error;
beforeEach(() => { errors = []; console.error = (...args) => errors.push(args.join(" ")); });
afterEach(() => { console.error = originalError; assert.deepEqual(errors, []); });

const BASE = "/v1/computers/cc_1";
const STATUS = { id: "codex", installed: false, path: "", version: "", auth: "none", logged_in: false, dir_capability: "full", running: false };

async function flush(count = 6) { for (let i = 0; i < count; i += 1) await act(async () => {}); }
async function tick() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, OPERATION_POLL_MS + 20)); }); await flush(); }

async function mountHook(program = "codex", strict = false, show = false) {
  const box = { access: null };
  function Probe() { box.access = useProgramAccess("cc_1", program); return show ? React.createElement(LoginFlow, { dialog: box.access, program }) : null; }
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(strict ? React.createElement(React.StrictMode, null, React.createElement(Probe)) : React.createElement(Probe)));
  await flush();
  return { box, container, unmount: async () => act(async () => root.unmount()) };
}

function reset(next) { calls.length = 0; routes = next; }

test("the program's status is the computer's own probe row", async () => {
  reset({ [`GET ${BASE}/programs/codex/options`]: () => ({ program: "codex", installed: false, version: null, status: STATUS }) });
  const { box, unmount } = await mountHook();
  assert.deepEqual(box.access.programs, [STATUS]);
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [`GET ${BASE}/programs/codex/options`]);
  await unmount();
});

test("install sends the typed directory, shows progress and the done line, then reads the status again", async () => {
  let polls = 0;
  reset({
    [`GET ${BASE}/programs/codex/options`]: () => ({ status: polls >= 2 ? { ...STATUS, installed: true, version: "0.9" } : STATUS }),
    [`POST ${BASE}/programs/codex/install`]: () => ({ operation_id: "op1" }),
    [`GET ${BASE}/program-operations/op1`]: () => (++polls < 2
      ? { operation_id: "op1", kind: "install", state: "running", progress: "added 12 packages" }
      : { operation_id: "op1", kind: "install", state: "succeeded", message: "/opt/tools/bin/codex-acp", progress: "added 12 packages" }),
  });
  const { box, unmount } = await mountHook();
  await act(async () => box.access.openInstall("codex"));
  await act(async () => box.access.setInstallDir("/opt/tools"));
  await act(async () => box.access.startInstall());
  await flush();
  assert.deepEqual(calls.find((call) => call.method === "POST").body, { dir: "/opt/tools" });
  assert.equal(box.access.install.running, true);
  await tick();
  assert.deepEqual(box.access.install.lines, ["added 12 packages"]);
  await tick();
  assert.equal(box.access.install.running, false);
  assert.equal(box.access.install.donePath, "/opt/tools/bin/codex-acp");
  assert.equal(box.access.programs[0].installed, true);
  await unmount();
});

test("the default install directory is left to the gateway", async () => {
  reset({
    [`GET ${BASE}/programs/codex/options`]: () => ({ status: STATUS }),
    [`POST ${BASE}/programs/codex/install`]: () => ({ operation_id: "op2" }),
    [`GET ${BASE}/program-operations/op2`]: () => ({ operation_id: "op2", kind: "install", state: "failed", message: "exit_1" }),
  });
  const { box, unmount } = await mountHook();
  await act(async () => box.access.openInstall("codex"));
  await act(async () => box.access.startInstall());
  await flush();
  assert.deepEqual(calls.find((call) => call.method === "POST").body, {});
  await tick();
  assert.equal(box.access.install.failedText, "exit_1");
  await unmount();
});

test("login shows the link, takes a pasted code and ends done", async () => {
  let state = "running";
  reset({
    [`GET ${BASE}/programs/claude/options`]: () => ({ status: { ...STATUS, id: "claude", installed: true } }),
    [`POST ${BASE}/programs/claude/login`]: () => ({ operation_id: "op3" }),
    [`GET ${BASE}/program-operations/op3`]: () => ({ operation_id: "op3", kind: "login", state, url: "https://claude.ai/oauth?x=1", needs_code: true }),
    [`POST ${BASE}/programs/claude/login/code`]: (body) => { state = "succeeded"; return { operation_id: body.operation_id, kind: "login", state: "running" }; },
  });
  const { box, unmount } = await mountHook("claude");
  await act(async () => box.access.openLogin("claude"));
  await flush();
  assert.equal(box.access.login.phase, "opening");
  await tick();
  assert.equal(box.access.login.phase, "waiting");
  assert.equal(box.access.login.url, "https://claude.ai/oauth?x=1");
  assert.equal(box.access.login.needsCode, true);
  await act(async () => box.access.submitLoginCode("claude", " abc-123 "));
  await flush();
  assert.deepEqual(calls.find((call) => call.path.endsWith("/login/code")).body, { operation_id: "op3", code: "abc-123" });
  await tick();
  assert.equal(box.access.login.phase, "done");
  await unmount();
});

test("a refused start shows the route's own code; cancel cancels the running login", async () => {
  const { CloudComputerError } = await import(cloudComputerApi);
  reset({
    [`GET ${BASE}/programs/codex/options`]: () => ({ status: STATUS }),
    [`POST ${BASE}/programs/codex/login`]: () => { throw new CloudComputerError("client_http_503", "x", 503, undefined, { error: "node_busy" }); },
  });
  const { box, unmount } = await mountHook();
  await act(async () => box.access.openLogin("codex"));
  await flush();
  assert.equal(box.access.login.phase, "failed");
  assert.equal(box.access.login.failed, "node_busy");

  routes[`POST ${BASE}/programs/codex/login`] = () => ({ operation_id: "op4", url: "https://auth.openai.com/x" });
  routes[`POST ${BASE}/programs/codex/login/cancel`] = (body) => ({ operation_id: body.operation_id, kind: "login", state: "cancelled" });
  await act(async () => box.access.openLogin("codex"));
  await flush();
  assert.equal(box.access.login.phase, "waiting");
  await act(async () => box.access.cancelLogin("codex"));
  await flush();
  assert.deepEqual(calls.at(-1), { method: "POST", path: `${BASE}/programs/codex/login/cancel`, body: { operation_id: "op4" } });
  assert.equal(box.access.login.open, false);
  await unmount();
});

test("method-aware login sends the selected method and optional SSO email", async () => {
  reset({
    [`GET ${BASE}/programs/claude/options`]: () => ({ status: { ...STATUS, id: "claude", installed: true }, login: { state: "logged_out", methods: [{ id: "sso", kind: "link_code" }] } }),
    [`POST ${BASE}/programs/claude/login`]: (body) => ({ operation_id: body.email ? "sso-email" : "sso-empty" }),
    [`GET ${BASE}/program-operations/sso-email`]: () => ({ operation_id: "sso-email", kind: "login", state: "succeeded" }),
  });
  const { box, unmount } = await mountHook("claude");
  await act(async () => box.access.openLoginMethod("claude", "sso", "person@example.com"));
  await flush();
  assert.deepEqual(calls.find((call) => call.path.endsWith("/login")).body, { method: "sso", email: "person@example.com" });
  await tick();
  assert.equal(box.access.login.phase, "done");
  await unmount();
});

test("logout requires confirmation and polls the logout operation", async () => {
  let state = "running";
  reset({
    [`GET ${BASE}/programs/codex/options`]: () => ({ status: { ...STATUS, installed: true, logged_in: true }, login: { state: "logged_in", account: "a@example.com", plan: "pro", mode: "chatgpt", methods: [], can_logout: true, agents_running: 2 } }),
    [`POST ${BASE}/programs/codex/logout`]: (body) => { assert.deepEqual(body, { confirm: true }); return { operation_id: "logout-1" }; },
    [`GET ${BASE}/program-operations/logout-1`]: () => ({ operation_id: "logout-1", kind: "logout", state }),
  });
  const { box, unmount } = await mountHook();
  await act(async () => box.access.requestLogout());
  assert.equal(box.access.logout.confirm, true);
  await act(async () => box.access.confirmLogout());
  await flush();
  assert.equal(box.access.logout.pending, true);
  state = "succeeded";
  await tick();
  assert.equal(box.access.logout.pending, false);
  assert.equal(box.access.logout.failed, "");
  await unmount();
});

test("StrictMode shows a device code, keeps polling needs_code, deduplicates clicks and completes", async () => {
  let state = "needs_code";
  reset({
    [`GET ${BASE}/programs/codex/options`]: () => ({ status: STATUS }),
    [`POST ${BASE}/programs/codex/login`]: () => ({ operation_id: "device" }),
    [`GET ${BASE}/program-operations/device`]: () => ({ operation_id: "device", kind: "login", state, url: "https://example.test/device", device_code: "TEST-CODE", needs_code: false }),
  });
  const { box, container, unmount } = await mountHook("codex", true, true);
  await act(async () => { box.access.openLogin("codex"); box.access.openLogin("codex"); });
  await tick();
  assert.equal(box.access.login.phase, "waiting");
  assert.equal(box.access.login.pending, true);
  assert.match(container.textContent, /TEST-CODE/);
  assert.equal(container.querySelector("a").href, "https://example.test/device");
  assert.equal(container.querySelector("input"), null);
  await act(async () => box.access.openLogin("codex"));
  assert.equal(calls.filter(call => call.path.endsWith("/login")).length, 1);
  state = "succeeded";
  await tick();
  assert.equal(box.access.login.phase, "done");
  assert.match(container.textContent, /已登录/);
  await unmount();
});

test("StrictMode logout completes; rate limit ends login spinner with actionable copy", async () => {
  reset({
    [`GET ${BASE}/programs/codex/options`]: () => ({ status: STATUS }),
    [`POST ${BASE}/programs/codex/logout`]: () => ({ operation_id: "out" }),
    [`GET ${BASE}/program-operations/out`]: () => ({ operation_id: "out", kind: "logout", state: "succeeded" }),
    [`POST ${BASE}/programs/codex/login`]: () => ({ operation_id: "limited" }),
    [`GET ${BASE}/program-operations/limited`]: () => ({ operation_id: "limited", kind: "login", state: "failed", message: "rate_limited" }),
  });
  const { box, container, unmount } = await mountHook("codex", true, true);
  await act(async () => { box.access.confirmLogout(); box.access.confirmLogout(); });
  await tick();
  assert.equal(box.access.logout.pending, false);
  assert.equal(calls.filter(call => call.path.endsWith("/logout")).length, 1);
  await act(async () => box.access.openLogin("codex"));
  await tick();
  assert.equal(box.access.login.pending, false);
  assert.match(container.textContent, /登录尝试太频繁，请约 15 分钟后再试/);
  await unmount();
});

test("cancel before start response cancels the eventual operation and never reopens login", async () => {
  let resolveStart;
  reset({
    [`GET ${BASE}/programs/codex/options`]: () => ({ status: STATUS }),
    [`POST ${BASE}/programs/codex/login`]: () => new Promise(resolve => { resolveStart = resolve; }),
    [`POST ${BASE}/programs/codex/login/cancel`]: () => ({ state: "cancelled" }),
  });
  const { box, unmount } = await mountHook();
  await act(async () => box.access.openLogin("codex"));
  await act(async () => box.access.cancelLogin("codex"));
  await act(async () => resolveStart({ operation_id: "late" }));
  await flush();
  assert.equal(box.access.login.open, false);
  assert.equal(calls.at(-1).body.operation_id, "late");
  assert.match(calls.at(-1).path, /cancel$/);
  await unmount();
});

test("lost operation, timeout and CLI exit end the real login view with an error", async () => {
  const { CloudComputerError } = await import(cloudComputerApi);
  for (const [message, copy] of [["operation_not_found", /登录状态已丢失/], ["timeout", /登录超时/], ["exit_7", /登录程序退出了/]]) {
    reset({
      [`GET ${BASE}/programs/codex/options`]: () => ({ status: STATUS }),
      [`POST ${BASE}/programs/codex/login`]: () => ({ operation_id: "err" }),
      [`GET ${BASE}/program-operations/err`]: () => {
        if (message === "operation_not_found") throw new CloudComputerError(message, message, 404);
        return { operation_id: "err", kind: "login", state: "failed", message };
      },
    });
    const { box, container, unmount } = await mountHook("codex", true, true);
    await act(async () => box.access.openLogin("codex"));
    await tick();
    assert.equal(box.access.login.pending, false);
    assert.equal(box.access.login.phase, "failed");
    assert.match(container.textContent, copy);
    await unmount();
  }
});

test("a transport that never answers is bounded to twenty seconds", async (t) => {
  const api = await import(await compileModule("src/lib/program-controls-api.ts", { "./cloud-computer-api": cloudComputerApi }));
  reset({ [`POST ${BASE}/programs/codex/login`]: () => new Promise(() => {}) });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = api.startProgramLogin("cc_1", "codex");
  const checked = assert.rejects(pending, error => error.code === "timeout");
  t.mock.timers.tick(20001);
  await checked;
  t.mock.timers.reset();
});
