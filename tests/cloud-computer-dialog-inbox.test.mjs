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
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  HTMLInputElement: window.HTMLInputElement,
  File: window.File,
  Blob: window.Blob,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
class FakeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = FakeObserver;
globalThis.IntersectionObserver = class {
  constructor(callback) {
    this.callback = callback;
  }
  observe(node) {
    this.callback([{ isIntersecting: true, target: node }]);
  }
  unobserve() {}
  disconnect() {}
};

class FakeSocket {
  static sockets = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.listeners = new Map();
    FakeSocket.sockets.push(this);
    queueMicrotask(() => {
      if (this.readyState === 3) return;
      this.readyState = 1;
      this.emit("open", {});
    });
  }
  addEventListener(type, fn, options) {
    const once = Boolean(options && options.once);
    const wrapped = (event) => {
      if (once) this.removeEventListener(type, wrapped);
      fn(event);
    };
    wrapped.original = fn;
    const list = this.listeners.get(type) ?? [];
    list.push(wrapped);
    this.listeners.set(type, list);
  }
  removeEventListener(type, fn) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((item) => item !== fn && item.original !== fn),
    );
  }
  send(data) {
    const frame = JSON.parse(data);
    this.sent.push(frame);
    if (frame.t === "occupancy" && this.autoOccupancy !== false) {
      const busy = this.occupancyBusy?.[frame.program] ?? this.turnBusy?.[frame.program] ?? [];
      queueMicrotask(() => {
        if (this.readyState === 1) this.server({ t: "occupancy", program: frame.program, busy });
      });
    }
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close", {});
  }
  emit(type, event) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }
  server(frame) {
    this.turnBusy ??= {};
    if (frame.program && frame.acp_session) {
      const cur = new Set(this.turnBusy[frame.program] ?? []);
      if (frame.t === "turn_start") cur.add(frame.acp_session);
      else if (frame.t === "done" || frame.t === "error") cur.delete(frame.acp_session);
      this.turnBusy[frame.program] = [...cur];
    }
    this.emit("message", { data: JSON.stringify(frame) });
  }
}
FakeSocket.CONNECTING = 0;
FakeSocket.OPEN = 1;
FakeSocket.CLOSING = 2;
FakeSocket.CLOSED = 3;
globalThis.WebSocket = FakeSocket;
window.WebSocket = FakeSocket;

class FakeXhr {
  static instances = [];
  constructor() {
    this.upload = { onprogress: null };
    this.status = 0;
    this.responseText = "";
    this.headers = {};
    this.withCredentials = false;
    FakeXhr.instances.push(this);
  }
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name, value) {
    this.headers[name] = value;
  }
  send(body) {
    this.body = body;
  }
  abort() {}
  progress(loaded, total) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  succeed(payload) {
    this.status = 200;
    this.responseText = JSON.stringify(payload);
    this.onload?.();
  }
  fail(status, payload) {
    this.status = status;
    this.responseText = JSON.stringify(payload);
    this.onload?.();
  }
}
const previousXhr = globalThis.XMLHttpRequest;
globalThis.XMLHttpRequest = FakeXhr;

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function useUI() {
    return (value, vars) => {
      if (!vars) return value;
      return value.replace(/\\{(\\w+)\\}/g, (token, key) => (key in vars ? String(vars[key]) : token));
    };
  }
`);
const authStub = dataModule(`
  export async function accessToken() { return "tok"; }
  export function cachedAccessToken() { return "tok"; }
`);
const configStub = dataModule(`
  export const GATEWAY_BASE = "https://gw.test";
`);
const agentStub = dataModule(`
  export async function getTask() { return { ok: false, data: null }; }
  export async function stopTask() { return { ok: false }; }
`);
const computerAgentStub = dataModule(`
  export async function agentState() { return { ok: false, error: "off" }; }
  export async function agentTurn() { return { ok: false, error: "off" }; }
  export async function agentReset() { return { ok: false, error: "off" }; }
`);
const leoEntryStub = dataModule(`
  export function LeoEntryButton() { return null; }
`);

const { putComputerInbox } = await import(
  await compileModule("src/lib/cloud-computer-api.ts", {
    "./auth/client": authStub,
    "./auth/config": configStub,
  })
);
const { userAttachments, normalizeUserMessage } = await import(
  await compileModule("src/shell/cloud-computer/agent-dialog/message-attachments.ts")
);
const controllerStubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../lib/auth/client": authStub,
  "./auth/client": authStub,
  "./auth/config": configStub,
  "../../../lib/agent": agentStub,
  "../../../lib/cloud-computer-agent-api": computerAgentStub,
  "../../LeoEntryButton": leoEntryStub,
};
const { useAgentDialog } = await import(
  await compileModule("src/shell/cloud-computer/agent-dialog/useAgentDialogController.tsx", controllerStubs)
);
const { Composer } = await import(
  await compileModule("src/shell/cloud-computer/agent-dialog/Composer.tsx", controllerStubs)
);
const { MessageList } = await import(
  await compileModule("src/shell/cloud-computer/agent-dialog/MessageList.tsx", controllerStubs)
);

function bigFile() {
  return new File([new Uint8Array(9 * 1024 * 1024)], "big.bin", {
    type: "application/octet-stream",
  });
}

async function until(fn, label) {
  for (let i = 0; i < 80; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    if (fn()) return;
  }
  throw new Error(label);
}

test("putComputerInbox uses XHR progress and does not fetch the file body", async () => {
  FakeXhr.instances.length = 0;
  const fetchCalls = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    throw new Error("fetch must not carry inbox bytes");
  };
  const percents = [];
  const file = bigFile();
  const pending = putComputerInbox("cc_1", file, (percent) => percents.push(percent));
  await until(() => FakeXhr.instances.length === 1, "xhr opened");
  const xhr = FakeXhr.instances[0];
  assert.equal(xhr.method, "PUT");
  assert.equal(
    xhr.url,
    "https://gw.test/v1/computers/cc_1/inbox?name=big.bin",
  );
  assert.equal(xhr.headers.Authorization, "Bearer tok");
  assert.equal(xhr.headers["Content-Type"], "application/octet-stream");
  assert.equal(xhr.body, file);
  xhr.progress(42, 100);
  xhr.succeed({
    path: "/root/oceanleo-inbox/20261016T040412Z-big.bin",
    name: "big.bin",
    size: file.size,
    mime: "application/octet-stream",
  });
  const result = await pending;
  assert.deepEqual(percents, [42, 100]);
  assert.equal(result.path, "/root/oceanleo-inbox/20261016T040412Z-big.bin");
  assert.equal(fetchCalls.length, 0);
  globalThis.fetch = previousFetch;
});

test("attachment shape keeps an absolute path and drops file://", () => {
  const kept = userAttachments([
    {
      name: "image.png",
      mime: "image/png",
      path: "/root/oceanleo-inbox/20261016T040412Z-image.png",
    },
    { name: "bad", mime: "text/plain", path: "file:///root/secret" },
  ]);
  assert.deepEqual(kept, [
    {
      name: "image.png",
      mime: "image/png",
      path: "/root/oceanleo-inbox/20261016T040412Z-image.png",
    },
    { name: "bad", mime: "text/plain" },
  ]);
  const visible = normalizeUserMessage("hi", [
    { name: "note.txt", mime: "text/plain", path: "/root/oceanleo-inbox/note.txt" },
  ]);
  assert.equal(visible.attachments[0].path, "/root/oceanleo-inbox/note.txt");
});

test("MessageList renders the inbox path as text", async () => {
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  const dialog = {
    program: "cursor",
    messages: [
      {
        kind: "user",
        id: "u1",
        text: "see this",
        attachments: [
          {
            name: "image.png",
            mime: "image/png",
            path: "/root/oceanleo-inbox/20261016T040412Z-image.png",
          },
        ],
      },
    ],
    historyOffset: 0,
    activeSession: "s1",
    sessionLoading: false,
    hasOlder: false,
    historyLoading: false,
    busy: false,
    install: { program: null, donePath: "", failedText: "" },
    programs: [],
    loadOlderHistory() {},
    openLogin() {},
    openInstall() {},
    retryConnect() {},
    answerPermission() {},
    answerQuestion() {},
  };
  await act(async () => {
    root.render(React.createElement(MessageList, { dialog }));
  });
  const pathNode = host.querySelector("[data-oceanleo-cc-user-path]");
  assert.ok(pathNode);
  assert.equal(
    pathNode.getAttribute("data-oceanleo-cc-user-path"),
    "/root/oceanleo-inbox/20261016T040412Z-image.png",
  );
  assert.equal(pathNode.tagName, "SPAN");
  assert.equal(host.querySelector("a"), null);
  assert.equal(host.querySelector("[data-oceanleo-cc-user-image]"), null);
  await act(async () => root.unmount());
  host.remove();
});

test("selecting an 8MB+ file uploads immediately; progress updates the chip; send has path and no data", async () => {
  FakeSocket.sockets.length = 0;
  FakeXhr.instances.length = 0;
  let latest;
  function Probe() {
    const dialog = useAgentDialog({
      computerId: "cc_1",
      sessionId: "sid_1",
      enabled: true,
      initialProgram: "cursor",
    });
    latest = dialog;
    return React.createElement(
      React.Fragment,
      null,
      React.createElement(Composer, { dialog }),
      React.createElement(MessageList, { dialog }),
    );
  }
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Probe));
  });
  try {
  await until(() => FakeSocket.sockets.some((socket) => socket.readyState === 1), "socket open");
  await until(() => latest.occupancyAt != null, "occupancy idle");
  const file = bigFile();
  await act(async () => {
    latest.addAttachments([file]);
  });
  await until(() => latest.attachments.length === 1, "chip created");
  assert.equal(latest.attachments[0].state, "uploading");
  assert.ok(file.size > 8 * 1024 * 1024);
  await until(() => FakeXhr.instances.length === 1, "inbox xhr");
  const xhr = FakeXhr.instances[0];
  assert.equal(xhr.body, file);
  await act(async () => {
    xhr.progress(41, 100);
  });
  await until(
    () => host.querySelector("[data-oceanleo-cc-attach-percent='41']"),
    "chip percent",
  );
  assert.equal(latest.attachments[0].percent, 41);
  const inboxPath = "/root/oceanleo-inbox/20261016T040412Z-big.bin";
  await act(async () => {
    xhr.succeed({
      path: inboxPath,
      name: "big.bin",
      size: file.size,
      mime: "application/octet-stream",
    });
  });
  await until(() => latest.attachments[0]?.state === "done", "upload done");
  assert.equal(latest.attachments[0].path, inboxPath);
  assert.equal(host.querySelector("[data-oceanleo-cc-attach-path]")?.textContent, inboxPath);
  await act(async () => {
    latest.setDraft("look");
  });
  await act(async () => {
    await latest.send();
  });
  const socket = [...FakeSocket.sockets].reverse().find((item) => item.readyState === 1);
  const prompt = socket.sent.find((frame) => frame.t === "prompt");
  assert.ok(prompt);
  assert.deepEqual(prompt.files, [
    { name: "big.bin", mime: "application/octet-stream", path: inboxPath },
  ]);
  assert.equal("data" in prompt.files[0], false);
  await until(() => host.querySelector("[data-oceanleo-cc-user-path]"), "bubble path");
  assert.equal(
    host.querySelector("[data-oceanleo-cc-user-path]").getAttribute("data-oceanleo-cc-user-path"),
    inboxPath,
  );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test.after(() => {
  if (previousXhr === undefined) delete globalThis.XMLHttpRequest;
  else globalThis.XMLHttpRequest = previousXhr;
});
