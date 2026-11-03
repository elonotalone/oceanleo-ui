import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
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
const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/" });
const { window } = dom;
for (const [name, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, HTMLInputElement: window.HTMLInputElement, HTMLTextAreaElement: window.HTMLTextAreaElement, Element: window.Element, Node: window.Node, localStorage: window.localStorage, sessionStorage: window.sessionStorage })) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLElement.prototype.attachEvent = () => {};

const api = { records: new Map(), gets: [], puts: [] };
const realtime = { handler: null, connection: "open" };
const reactUrl = pathToFileURL(require.resolve("react")).href;
const apiStub = dataModule(`
  export async function getComposerDrafts(keys) { globalThis.__draftApi.gets.push(keys); const drafts = keys.map((key) => globalThis.__draftApi.records.get(key)).filter(Boolean); globalThis.__draftApi.lastDrafts = drafts; return { drafts }; }
  export async function putComposerDraft(key, body) { globalThis.__draftApi.puts.push({ key, body }); const old = globalThis.__draftApi.records.get(key); const rev = (old?.rev || 0) + 1; const record = { key, text: body.text, attachments: body.attachments, rev, device_id: body.device_id, updated_at: new Date().toISOString() }; globalThis.__draftApi.records.set(key, record); return { rev, updated_at: record.updated_at }; }
`);
const realtimeStub = dataModule(`
  import { useEffect } from ${JSON.stringify(reactUrl)};
  export function useImConnection() { return globalThis.__draftRealtime.connection; }
  export function useImEvent(_type, handler) { useEffect(() => { globalThis.__draftRealtime.handler = handler; return () => { if (globalThis.__draftRealtime.handler === handler) globalThis.__draftRealtime.handler = null; }; }, [handler]); }
`);
const uploadStub = dataModule(`export function composerAttachmentFromLibraryItem() { return null; }`);
const attachmentStub = dataModule(`export function attachmentRef(att) { return att?.artifactId && att?.revisionId ? { artifactId: att.artifactId, revisionId: att.revisionId } : null; }`);
globalThis.__draftApi = api;
globalThis.__draftRealtime = realtime;
const mod = await import(await compileModule("src/shell/composer-draft.ts", {
  "../lib/composer-drafts-api": apiStub,
  "./messages/realtime/hooks": realtimeStub,
  "../lib/attachment-url": attachmentStub,
  "./composer-upload": uploadStub,
}));
const { useComposerDraft } = mod;

function reset() {
  api.records.clear(); api.gets.length = 0; api.puts.length = 0; realtime.handler = null; realtime.connection = "open";
  globalThis.__draftChanges = [];
  window.localStorage.clear(); window.sessionStorage.clear(); window.document.body.replaceChildren();
}
async function tick() { await act(async () => {}); }
async function advance(ms) { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); }); }
function mount({ key = "task:t1", initial = "", initialAttachments = [] } = {}) {
  let value = initial; let attachments = initialAttachments; let handle;
  const container = window.document.createElement("div"); window.document.body.append(container);
  const root = createRoot(container);
  function Probe() {
    const [text, setText] = React.useState(value);
    const [atts, setAtts] = React.useState(attachments);
    value = text; attachments = atts;
    globalThis.__draftSetText = setText;
    const change = (next) => { globalThis.__draftChanges.push(next); setText(next); };
    handle = useComposerDraft({ draftKey: key, value: text, onChange: change, attachments: atts, onAddAttachments: (items) => setAtts((old) => [...old, ...items]), onRemoveAttachment: (id) => setAtts((old) => old.filter((item) => item.id !== id)) });
    return React.createElement("textarea", { value: text, onChange: (e) => setText(e.target.value) });
  }
  return { root, container, async render() { await act(async () => root.render(React.createElement(Probe))); await tick(); }, async unmount() { await act(async () => root.unmount()); container.remove(); }, setText(next) { return act(async () => globalThis.__draftSetText(next)); }, get value() { return value; }, textarea() { return container.querySelector("textarea"); }, get handle() { return handle; } };
}

const libAtt = { id: "a1", artifactId: "art", revisionId: "rev", name: "x.txt" };

test("remote newer rev replaces text, preserves caret sensibly, and ignores own/older events", async () => {
  reset(); const m = mount({ initial: "hello" }); await m.render();
  const area = m.textarea(); area.focus(); area.setSelectionRange(2, 2);
  await act(async () => realtime.handler({ type: "composer_draft", key: "task:t1", text: "hi", attachments: [], rev: 2, device_id: "other", updated_at: "now" })); await tick();
  assert.equal(m.value, "hi"); assert.equal(area.selectionStart, 2, "caret remains when change is after caret / replacement ends at caret");
  await act(async () => realtime.handler({ type: "composer_draft", key: "task:t1", text: "ignored", attachments: [], rev: 2, device_id: "other", updated_at: "now" }));
  assert.equal(m.value, "hi");
  const own = window.localStorage.getItem("oceanleo_composer_device_id");
  await act(async () => realtime.handler({ type: "composer_draft", key: "task:t1", text: "own ignored", attachments: [], rev: 3, device_id: own || "web-x", updated_at: "now" }));
  assert.equal(m.value, "hi"); await m.unmount();
});

test("debounce coalesces edits and delete-all / send clear remotely", async () => {
  reset(); const m = mount(); await m.render();
  const area = m.textarea(); await m.setText("a"); await m.setText("ab");
  await advance(350); assert.equal(api.puts.length, 1); assert.equal(api.puts[0].body.text, "ab");
  await m.setText(""); await advance(350); assert.equal(api.puts.at(-1).body.text, "");
  m.handle.markSubmitted(); await advance(350); assert.equal(api.puts.at(-1).body.text, ""); await m.unmount();
});

test("mount prefers newer server copy and retries queued write after reconnect", async () => {
  reset(); api.records.set("task:t1", { key: "task:t1", text: "server", attachments: [], rev: 4, device_id: "other", updated_at: "now" });
  const m = mount({ initial: "local" }); await m.render(); await act(async () => await new Promise((resolve) => setTimeout(resolve, 25))); assert.equal(api.gets.length, 1); assert.equal(api.lastDrafts?.[0]?.text, "server"); assert.deepEqual(globalThis.__draftChanges, ["server"]); assert.equal(m.value, "server");
  api.puts.length = 0; realtime.connection = "closed"; await m.setText("offline"); await advance(350); assert.equal(api.puts.length, 0);
  realtime.connection = "open"; await m.render(); await tick(); assert.equal(api.puts.at(-1).body.text, "offline"); await m.unmount();
});

test("remote text-only edit leaves local computer inbox attachments in place", async () => {
  reset(); const inbox = { id: "inbox", name: "screen.png", url: "blob:x" }; const m = mount({ initial: "before", initialAttachments: [inbox] }); await m.render();
  await act(async () => realtime.handler({ type: "composer_draft", key: "task:t1", text: "after", attachments: [], rev: 2, device_id: "other", updated_at: "now" })); await tick();
  assert.equal(m.value, "after"); assert.equal(m.container.querySelector("textarea")?.value, "after"); await m.unmount();
});

const storedDraft = (key = "task:t1") => window.sessionStorage.getItem(`oceanleo_composer_draft:v1:${key}`);

test("sent text is cleared locally when the mount applied an empty server tombstone first", async () => {
  // V1 2026-11-04: the tombstone of an earlier send armed the echo guard, which then
  // swallowed this send's text → empty transition and left the sent text in storage.
  reset(); api.records.set("task:t1", { key: "task:t1", text: "", attachments: [], rev: 7, device_id: "other", updated_at: "now" });
  const m = mount(); await m.render(); await advance(25); assert.equal(api.gets.length, 1);
  await m.setText("sent once"); await advance(350);
  assert.equal(api.puts.at(-1).body.text, "sent once"); assert.match(storedDraft() || "", /sent once/);
  m.handle.markSubmitted(); await m.setText(""); await advance(350);
  assert.equal(storedDraft(), null, "the page-reload copy is gone once the composer is empty");
  assert.equal(api.records.get("task:t1").text, "");
  await m.unmount();
});

test("a newer server copy supersedes the restored local text and its queued write", async () => {
  // V1 2026-11-04: reload restored stale text, its PUT waited for the socket, the
  // server tombstone emptied the composer, then reconnect PUT the stale text back.
  reset(); window.sessionStorage.setItem("oceanleo_composer_draft:v1:task:t1", JSON.stringify({ text: "already sent", attachments: [] }));
  api.records.set("task:t1", { key: "task:t1", text: "", attachments: [], rev: 7, device_id: "web-same", updated_at: "now" });
  realtime.connection = "connecting";
  const m = mount(); await m.render(); await advance(350);
  assert.equal(m.value, "", "the newer server tombstone wins over the restored text");
  assert.equal(api.puts.length, 0);
  realtime.connection = "open"; await m.render(); await advance(350);
  assert.equal(api.puts.length, 0, "no stale write after the socket opens");
  assert.equal(api.records.get("task:t1").text, ""); assert.equal(api.records.get("task:t1").rev, 7);
  assert.equal(storedDraft(), null, "this tab's copy follows the shown (server) state");
  await m.unmount();
});
