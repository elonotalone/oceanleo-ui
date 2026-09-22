import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
  HTMLInputElement: window.HTMLInputElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const KEY = "test-key-not-a-secret";

const uiStub = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const authClientStub = dataModule(`
  export async function accessToken() {
    return "session";
  }
`);
const authConfigStub = dataModule(`
  export const GATEWAY_BASE = "https://gateway.test";
`);

const { CursorKeySheet } = await import(
  await compileModule("src/shell/cloud-computer/agent-dialog/CursorKeySheet.tsx", {
    "../../../i18n/ui/useUI": uiStub,
    "../../../lib/auth/client": authClientStub,
    "../../../lib/auth/config": authConfigStub,
  })
);

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("CursorKeySheet posts the key and then clears the field", async () => {
  const calls = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init && init.body });
    await gate;
    return { ok: true, status: 200, json: async () => ({ saved: true }) };
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      root.render(
        React.createElement(CursorKeySheet, {
          open: true,
          computerId: "cc_test",
          onClose() {},
        }),
      );
    });
    const input = document.querySelector("[data-oceanleo-cc-cursor-key-input]");
    assert.ok(input);
    const propKey = Object.keys(input).find((name) => name.startsWith("__reactProps"));
    assert.ok(propKey);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
      setter.call(input, KEY);
      input[propKey].onChange({ target: input, currentTarget: input });
    });
    const button = document.querySelector("[data-oceanleo-cc-cursor-key-save]");
    await act(async () => {
      button.click();
      for (let i = 0; i < 6; i += 1) await Promise.resolve();
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://gateway.test/v1/computers/cc_test/cursor-key");
    assert.deepEqual(JSON.parse(calls[0].body), { key: KEY });
    assert.equal(document.querySelector("[data-oceanleo-cc-cursor-key-save]").disabled, true);
    await act(async () => {
      release();
      for (let i = 0; i < 8; i += 1) await Promise.resolve();
    });
    assert.equal(document.querySelector("[data-oceanleo-cc-cursor-key-input]").value, "");
    assert.equal(window.localStorage.length, 0);
  } finally {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    globalThis.fetch = previousFetch;
  }
});

test("ProgramRow shows the key button only for installed Cursor", () => {
  const source = read("src/shell/cloud-computer/agent-dialog/ProgramRow.tsx");
  const marker = 'data-oceanleo-cc-cursor-key=""';
  const at = source.indexOf(marker);
  assert.notEqual(at, -1);
  assert.equal(source.indexOf(marker, at + marker.length), -1);
  const conditionAt = source.lastIndexOf('id === "cursor"', at);
  assert.notEqual(conditionAt, -1);
  assert.ok(at - conditionAt < 400);
  const guard = source.slice(conditionAt, at);
  assert.match(guard, /row\?\.installed/);
  assert.doesNotMatch(guard, /hermes|claude|codex|oceanleo/);
  const sheet = read("src/shell/cloud-computer/agent-dialog/CursorKeySheet.tsx");
  const api = read("src/shell/cloud-computer/agent-dialog/cursor-key-api.ts");
  assert.match(sheet, /saveCursorKey\(computerId, key\)/);
  assert.equal(sheet.includes("localStorage"), false);
  assert.equal(api.includes("localStorage"), false);
  const picker = read("src/shell/ModelPicker.tsx");
  assert.equal(picker.includes("CursorKeySheet"), false);
  assert.equal(picker.includes("cursor-key"), false);
  assert.equal(picker.includes("saveCursorKey"), false);
  assert.equal(picker.includes("data-oceanleo-cc-cursor-key"), false);
});
