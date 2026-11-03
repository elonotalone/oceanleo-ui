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
const { useComposerDraft, readComposerDraftFiles, writeComposerDraftFiles, writeComposerDraft, composerDraftFileToFile, COMPOSER_DRAFT_BYTES_LIMIT } = mod;


// Transaction-completion shim: structured clone deliberately turns File blobs
// into Blobs, as some real IndexedDB implementations do.
function installDb({ unavailable = false } = {}) {
  const data = new Map();
  globalThis.indexedDB = { open() {
    if (unavailable) throw new Error("private mode");
    const req = {};
    setTimeout(() => {
      req.result = { createObjectStore() {}, close() {}, transaction() {
        const tx = {};
        tx.objectStore = () => ({
          get(key) { const r = { result: data.get(key) }; setTimeout(() => tx.oncomplete?.(), 0); return r; },
          put(value, key) { data.set(key, structuredClone(value)); setTimeout(() => tx.oncomplete?.(), 0); return { result: key }; },
          delete(key) { data.delete(key); setTimeout(() => tx.oncomplete?.(), 0); return {}; },
        });
        return tx;
      }};
      req.onupgradeneeded?.(); req.onsuccess?.();
    }, 0);
    return req;
  }};
  return data;
}
function reset() {
  api.records.clear(); api.gets.length = 0; api.puts.length = 0; realtime.handler = null; realtime.connection = "closed";
  window.localStorage.clear(); window.sessionStorage.clear();
  return installDb();
}
async function settle() { for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); }); }
let seq = 0;
function mount({ key = "task:t1", host = true, strict = false, initial = [], transform = (att) => att, onHost = () => {} } = {}) {
  let handle, setAtts, setText, current, keyValue = key, enabled = host;
  const calls = [];
  let renders = 0;
  const container = document.createElement("div"); document.body.append(container);
  const root = createRoot(container);
  function Probe() {
    renders += 1;
    const [atts, update] = React.useState(initial); setAtts = update;
    const [text, change] = React.useState(""); setText = change;
    current = { atts, text };
    handle = useComposerDraft({ draftKey: keyValue, value: text, onChange: change, attachments: atts,
      onAddAttachments: (items) => update((old) => [...old, ...items]),
      fetchItem: async () => ({ ok: false, status: 500 }),
      onAttachFiles: enabled ? (files) => {
        calls.push(files);
        onHost(files);
        update((old) => [...old, ...files.map((file) => transform({ id: `tile-${++seq}`, name: file.name, mime: file.type, size: file.size, uploading: true }))]);
      } : undefined,
    });
    return null;
  }
  const render = () => act(async () => root.render(strict ? React.createElement(React.StrictMode, null, React.createElement(Probe)) : React.createElement(Probe)));
  return { render, calls, get renders() { return renders; }, get handle() { return handle; }, get current() { return current; },
    attach: (files) => act(async () => handle.attachFiles(files)),
    set: (next) => act(async () => setAtts(next)), text: (next) => act(async () => setText(next)),
    async switch(key) { keyValue = key; await render(); }, async host(value) { enabled = value; await render(); },
    async unmount() { await act(async () => root.unmount()); container.remove(); },
  };
}
const file = (name = "pic.png", body = "bytes") => new File([body], name, { type: "image/png", lastModified: 1234 });
const row = (f, id = "stored") => ({ draftFileId: id, name: f.name, type: f.type, size: f.size, lastModified: f.lastModified, blob: f });

test("attach stores bytes; refresh restores uploading, failed and inbox files through the host", async () => {
  for (const state of ["uploading", "failed", "inbox"]) {
    reset(); const a = mount(); await a.render(); await settle();
    const original = file(); await a.attach([original]); await settle();
    if (state !== "uploading") await a.set((atts) => atts.map((att) => ({ ...att, uploading: false, failed: state === "failed", name: state === "failed" ? `${att.name} · 上传失败` : att.name })));
    await settle(); const stored = await readComposerDraftFiles("task:t1");
    assert.equal(stored.length, 1); assert.equal(await stored[0].blob.text(), "bytes");
    await a.unmount(); const b = mount(); await b.render(); await settle();
    assert.equal(b.calls.length, 1); assert.equal(b.current.atts.length, 1);
    const restored = b.calls[0][0];
    assert.equal(restored.name, original.name); assert.equal(restored.type, original.type);
    assert.equal(restored.lastModified, original.lastModified); assert.deepEqual(await restored.arrayBuffer(), await original.arrayBuffer());
    await b.unmount();
  }
});

test("remove deletes only its file, including repeated names and different sizes", async () => {
  reset(); const a = mount(); await a.render(); await settle();
  await a.attach([file("same.png", "a"), file("same.png", "longer")]); await settle();
  await a.set((atts) => atts.slice(1)); await settle();
  const stored = await readComposerDraftFiles("task:t1"); assert.equal(stored.length, 1); assert.equal(await stored[0].blob.text(), "longer");
  await a.set([]); await settle(); assert.deepEqual(await readComposerDraftFiles("task:t1"), []); await a.unmount();
});

test("send clears after host reset and on home unmount, including immediate attach then send", async () => {
  for (const unmount of [false, true]) {
    reset(); const a = mount({ key: "home:oceanleo" }); await a.render(); await settle();
    await a.attach([file()]); await settle();
    a.handle.markSubmitted();
    if (unmount) await a.unmount(); else await a.set([]);
    await settle(); assert.deepEqual(await readComposerDraftFiles("home:oceanleo"), []);
    if (!unmount) await a.unmount();
  }
  reset(); const a = mount(); await a.render();
  await a.attach([file()]); a.handle.markSubmitted(); await a.unmount(); await settle();
  assert.deepEqual(await readComposerDraftFiles("task:t1"), []);
});

test("Library ref plus its stored bytes restores one tile without a second upload", async () => {
  reset(); const f = file(); const ref = { id: "lib", name: f.name, mime: f.type, artifactId: "art", revisionId: "rev" };
  writeComposerDraft("task:t1", "draft", [ref]);
  await writeComposerDraftFiles("task:t1", [{ ...row(f), tileId: "lib", artifactId: "art", revisionId: "rev" }]);
  const a = mount(); await a.render(); await settle();
  assert.equal(a.current.atts.length, 1); assert.equal(a.calls.length, 0);
  assert.equal((await readComposerDraftFiles("task:t1")).length, 1);
  await a.set([]); await settle(); assert.deepEqual(await readComposerDraftFiles("task:t1"), []); await a.unmount();
});

test("an older row without Library metadata matches its restored reference once", async () => {
  reset(); const f = file(); writeComposerDraft("task:t1", "", [{ id: "lib", name: f.name, mime: f.type, artifactId: "art", revisionId: "rev" }]);
  await writeComposerDraftFiles("task:t1", [row(f)]);
  const a = mount(); await a.render(); await settle(); assert.equal(a.calls.length, 0); assert.equal(a.current.atts.length, 1); await a.unmount();
});

test("limits retain newest 20 files and expose a limit notice", async () => {
  reset(); const a = mount(); await a.render(); await settle();
  await a.attach(Array.from({ length: 22 }, (_, n) => file(`${n}.png`))); await settle();
  const stored = await readComposerDraftFiles("task:t1"); assert.equal(stored.length, 20); assert.equal(stored[0].name, "2.png");
  assert.equal(a.handle.fileNotice, "limit"); assert.equal(a.calls[0].length, 22, "draft limit does not alter the host intake"); await a.unmount();
});

test("100 MB cap keeps newest fitting files; oversized newest file is reported", async () => {
  reset(); const a = mount(); await a.render(); await settle();
  const large = new File([new Uint8Array(60 * 1024 * 1024)], "large.png", { type: "image/png" });
  await a.attach([large, new File([large], "newer.png", { type: "image/png" })]); await settle();
  let stored = await readComposerDraftFiles("task:t1"); assert.deepEqual(stored.map((r) => r.name), ["newer.png"]);
  assert.equal(a.handle.fileNotice, "limit");
  const oversized = new File([new Uint8Array(COMPOSER_DRAFT_BYTES_LIMIT + 1)], "too-large.png");
  await a.attach([oversized]); await settle(); stored = await readComposerDraftFiles("task:t1"); assert.deepEqual(stored.map((r) => r.name), ["newer.png"]); await a.unmount();
});

test("missing/private-mode IndexedDB preserves host intake and does not crash", async () => {
  for (const privateMode of [false, true]) {
    reset(); if (privateMode) installDb({ unavailable: true }); else delete globalThis.indexedDB;
    const a = mount(); await a.render(); await settle(); await a.attach([file()]); await settle();
    assert.equal(a.current.atts.length, 1); assert.equal(a.handle.fileNotice, "storage_unavailable"); await a.unmount();
  }
});

test("StrictMode restores once and waits until an offline host has an intake callback", async () => {
  reset(); await writeComposerDraftFiles("task:t1", [row(file())]);
  const a = mount({ host: false, strict: true }); await a.render(); await settle(); assert.equal(a.calls.length, 0);
  await a.host(true); await settle(); assert.equal(a.calls.length, 1); await a.render(); await settle(); assert.equal(a.calls.length, 1); await a.unmount();
});

test("draft key changes restore independently and do not erase the previous draft", async () => {
  reset(); await writeComposerDraftFiles("task:other", [row(file("other.png"))]);
  const a = mount(); await a.render(); await settle(); await a.attach([file()]); await settle();
  await a.set([]); await a.switch("task:other"); await settle();
  assert.equal(a.calls.at(-1)[0].name, "other.png"); assert.equal((await readComposerDraftFiles("task:other")).length, 1); await a.unmount();
});

test("legacy File[] rows migrate to metadata and Blob values reconstruct Files", async () => {
  const data = reset(); data.set("old", [file()]); const rows = await readComposerDraftFiles("old");
  assert.equal(rows.length, 1); assert.equal(await composerDraftFileToFile(rows[0]).text(), "bytes");
});

test("native renamed equal-size duplicate tiles bind in order and remove independently", async () => {
  reset(); let index = 0;
  const a = mount({ transform: (att) => ({ ...att, name: ++index === 1 ? att.name : "same-2.png" }) });
  await a.render(); await settle(); await a.attach([file("same.png", "a"), file("same.png", "b")]); await settle();
  await a.set((atts) => atts.slice(1)); await settle();
  const stored = await readComposerDraftFiles("task:t1");
  assert.equal(stored.length, 1); assert.equal(stored[0].name, "same-2.png"); assert.equal(await stored[0].blob.text(), "b"); await a.unmount();
});

test("a new same-name pick never binds to an already-present tile", async () => {
  reset(); const existing = { id: "existing", name: "pic.png", mime: "image/png", size: 5 };
  const a = mount({ initial: [existing] }); await a.render(); await settle();
  await a.attach([file()]); await settle(); await a.set((atts) => atts.filter((att) => att.id === "existing")); await settle();
  assert.deepEqual(await readComposerDraftFiles("task:t1"), []); await a.unmount();
});

test("host intake is synchronous, then the refresh copy is written; no-key intake stays synchronous", async () => {
  const data = reset();
  let copyAtHost;
  const a = mount({ onHost() { copyAtHost = data.get("task:t1"); } });
  await a.render(); await settle();
  const picked = file();
  act(() => {
    a.handle.attachFiles([picked]);
    assert.equal(a.calls.length, 1, "the host sees the pick before attachFiles returns");
    assert.equal(a.calls[0][0], picked, "the host receives the original File");
    assert.equal(copyAtHost, undefined, "storage never gates host intake");
  });
  await settle();
  assert.equal(data.get("task:t1").length, 1);
  assert.equal(await data.get("task:t1")[0].blob.text(), "bytes");
  await a.unmount();
  const b = mount();
  await b.render(); await b.switch(undefined);
  act(() => {
    b.handle.attachFiles([file()]);
    assert.equal(b.calls.length, 1);
  });
  await b.unmount();
});

test("no IndexedDB: home-to-task handoff drains with changing host callbacks and one storage notice", async () => {
  reset(); delete globalThis.indexedDB;
  const a = mount({ key: "home:oceanleo" });
  await a.render(); await settle();
  assert.equal(a.handle.fileNotice, null, "an empty draft needs no storage warning");
  await a.attach([file()]); await settle();
  assert.equal(a.calls.length, 1);
  assert.equal(a.handle.fileNotice, "storage_unavailable");
  const settledRenders = a.renders;
  await settle();
  assert.equal(a.renders, settledRenders, "the warning and unstable host callback do not keep rendering");
  a.handle.markSubmitted();
  await a.switch("task:t_home1"); await settle();
  assert.equal(a.calls.length, 1, "the new key does not replay the old file");
  assert.equal(a.handle.fileNotice, null, "the new draft starts without the old warning");
  const taskRenders = a.renders;
  await a.render(); await settle();
  assert.equal(a.renders, taskRenders + 1, "an unrelated host render drains normally");
  await a.unmount();
});

test("home-to-task key change keeps byte copies under their own keys", async () => {
  reset();
  await writeComposerDraftFiles("task:t_home1", [row(file("task.png", "task bytes"))]);
  const a = mount({ key: "home:oceanleo" });
  await a.render(); await settle(); await a.attach([file("home.png", "home bytes")]); await settle();
  await a.switch("task:t_home1"); await settle();
  assert.deepEqual(a.calls.map((files) => files.map((f) => f.name)), [["home.png"], ["task.png"]]);
  assert.deepEqual((await readComposerDraftFiles("home:oceanleo")).map((f) => f.name), ["home.png"]);
  assert.deepEqual((await readComposerDraftFiles("task:t_home1")).map((f) => f.name), ["task.png"]);
  const settledRenders = a.renders;
  await settle(); assert.equal(a.renders, settledRenders);
  await a.unmount();
});


test("removing an already displayed tile while the host is offline deletes its byte copy", async () => {
  reset(); const existing = { id: "kept", name: "pic.png", mime: "image/png", size: 5 };
  await writeComposerDraftFiles("task:t1", [{ ...row(file()), tileId: "kept" }]);
  const a = mount({ host: false, initial: [existing] }); await a.render(); await settle();
  await a.set([]); await settle(); assert.deepEqual(await readComposerDraftFiles("task:t1"), []);
  await a.host(true); await settle(); assert.equal(a.calls.length, 0); await a.unmount();
});
