// W04 R2 (W09-to-W04 #1): after a confirmed save the local IndexedDB copy is gone.
// Before: the cleanup write of the last dirty render raced the post-save delete; a slow
// write landed after it, and the saved copy was restored (and now re-sent) on the next open.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://doc.oceanleo.com/" });
for (const [name, value] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// A write that takes longer than the delete: the order of completion is the bug.
globalThis.__w04Store = { records: new Map(), writes: 0 };
const STORE = dataModule(`
  const store = globalThis.__w04Store;
  export function advancedRecoveryKey(editorId, item) { return editorId + ":" + item.id; }
  export async function writeAdvancedRecovery(record) {
    store.writes += 1;
    await new Promise((resolve) => setTimeout(resolve, 80));
    store.records.set(record.key, record);
  }
  export async function readAdvancedRecovery(key) { return store.records.get(key) || null; }
  export async function deleteAdvancedRecovery(key) { store.records.delete(key); }
`);
const { useAdvancedRecovery, noteAdvancedSaveSucceeded } = await import(await compileModule("src/shell/use-advanced-recovery.ts", { "./advanced-recovery-store": STORE }));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function Probe({ dirty, revision, state, recoveryKey = "richdoc:doc-1" }) {
  useAdvancedRecovery({
    editorId: "richdoc", revision, dirty, persistenceState: state,
    recovery: {
      key: recoveryKey, draftSchema: "oceanleo.richdoc.edit.v1", ready: true,
      capture: () => ({ type: "doc", content: [{ revision }] }),
      restore: () => true,
    },
  });
  return null;
}

test("a confirmed save leaves no local copy behind, even when the last write is slow", async () => {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const render = (props) => act(async () => root.render(React.createElement(Probe, props)));
  await render({ dirty: false, revision: 0, state: "saved" });
  await render({ dirty: true, revision: 1, state: "saving" });
  await act(async () => { await sleep(600); }); // debounced write of the dirty edit
  assert.equal(globalThis.__w04Store.records.size, 1, "an unsaved edit is kept locally");
  await render({ dirty: false, revision: 1, state: "saved" });
  await act(async () => { await sleep(400); });
  assert.equal(globalThis.__w04Store.records.size, 0, "the saved edit must not be resurrected by a late write");
  await act(async () => root.unmount());
  await act(async () => { await sleep(200); });
  assert.equal(globalThis.__w04Store.records.size, 0, "closing a clean, saved document writes nothing back");
  container.remove();
});

test("an editor that keeps dirty up after a confirmed save still drops the obsolete copy", async () => {
  globalThis.__w04Store.records.clear();
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const props = { recoveryKey: "deck:deck-000123" };
  const render = (next) => act(async () => root.render(React.createElement(Probe, { ...props, ...next })));
  await render({ dirty: false, revision: 0, state: "saved" });
  await render({ dirty: true, revision: 1, state: "saving" });
  await act(async () => { await sleep(600); });
  assert.equal(globalThis.__w04Store.records.size, 1);
  noteAdvancedSaveSucceeded({ id: "deck-000123", key: "deck-000123", meta: {} }, Date.now());
  await render({ dirty: true, revision: 1, state: "saved" }); // dirty never comes down
  await act(async () => { await sleep(400); });
  assert.equal(globalThis.__w04Store.records.size, 0, "a save that covers the last edit retires the local copy");
  await act(async () => root.unmount());
  await act(async () => { await sleep(200); });
  assert.equal(globalThis.__w04Store.records.size, 0, "unmount does not write the covered copy back");
  container.remove();
});
