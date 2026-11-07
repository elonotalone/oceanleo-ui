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
import test from "node:test";

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

const BASE = "/v1/computers/cc_1";
const STATUS = { id: "codex", installed: false, path: "", version: "", auth: "none", logged_in: false, dir_capability: "full", running: false };

async function flush(count = 6) { for (let i = 0; i < count; i += 1) await act(async () => {}); }
async function tick() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, OPERATION_POLL_MS + 20)); }); await flush(); }

async function mountHook(program = "codex") {
  const box = { access: null };
  function Probe() { box.access = useProgramAccess("cc_1", program); return null; }
  const container = document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Probe)));
  await flush();
  return { box, unmount: async () => act(async () => root.unmount()) };
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
