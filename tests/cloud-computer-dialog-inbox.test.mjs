import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// The agent-dialog Composer/MessageList/controller are deleted; the inbox upload API and the shared
// attachment shape stay.
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

const authStub = dataModule(`
  export async function accessToken() { return "tok"; }
  export function cachedAccessToken() { return "tok"; }
`);
const configStub = dataModule(`
  export const GATEWAY_BASE = "https://gw.test";
  export function gatewayBase() { return GATEWAY_BASE; }
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

test.after(() => {
  if (previousXhr === undefined) delete globalThis.XMLHttpRequest;
  else globalThis.XMLHttpRequest = previousXhr;
});
