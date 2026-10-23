import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  recordUserMutation,
  resetUserEditSession,
} from "../src/shell/user-edit-session.ts";

/* --------------------------------- jsdom --------------------------------- */

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
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://ppt.dev.oceanleo.com/advanced/presentation_editing",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(element) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    async rerender(next) {
      await act(async () => {
        root.render(next);
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


const transportStubs = {
  "../lib/database": dataModule(`export async function uploadFile(file, options) { return globalThis.__e6Upload(file, options); }`),
};
// The upload transport is a dynamic import: register that entry before the hook
// so module-bench replaces it as well as static collaborators.
await compileModule("src/shell/advanced-draft.ts", transportStubs);
const { useAdvancedAutoSave } = await import(await compileModule("src/shell/use-advanced-autosave.ts", transportStubs));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
function bed() {
  resetUserEditSession();
  const b = { revision: 0, itemKey: "artifact:e6-draft", uploads: [], records: [], versions: [], hooks: null, setInput: null, boundFlush: null };
  globalThis.__e6Upload = async (file, options) => {
    b.uploads.push(JSON.parse(await file.text()));
    assert.equal(options.registerAsset, false);
    return { ok: true, data: { file: { url: 'https://files.example/draft-' + b.uploads.length + '.json' } } };
  };
  b.draft = { schema: 'test.working.v1', capture: () => ({ text: 'edit-' + b.revision }), bindFlush: f => { b.boundFlush = f; } };
  b.session = { sessionId: 'session-1', snapshot: () => ({ item: { id: 'root', versionId: 'base', title: 'Deck', siteId: 'ppt', meta: {} } }),
    recordDraft: async p => { b.records.push(p); return true; }, recordSavedItem: async () => true };
  b.flush = async () => { b.versions.push(b.revision); return { ok: true, item: { id: 'v' + b.revision, meta: {} } }; };
  return b;
}
function Probe({ b, session = b.session, draft = b.draft }) {
  const [input, setInput] = React.useState({ revision: 0, dirty: false });
  b.setInput = setInput; b.revision = input.revision;
  b.hooks = useAdvancedAutoSave({ ...input, key: b.itemKey, session, draft, flush: b.flush });
  return null;
}
async function edit(b, revision) {
  recordUserMutation(b.itemKey);
  await act(async () => b.setInput({ revision, dirty: true }));
}
async function waitDraft() { await act(async () => { await sleep(500); }); }

test('real hook only reports saved after upload AND session acknowledgement, then export binding forces a version', async () => {
  const b = bed(), ack = deferred();
  b.session.recordDraft = async p => { b.records.push(p); return ack.promise; };
  const tree = await mount(React.createElement(Probe, { b }));
  try {
    await edit(b, 1); await waitDraft();
    assert.equal(b.uploads.length, 1); assert.equal(b.records.length, 1);
    assert.equal(b.hooks.state, 'saving'); assert.deepEqual(b.versions, []);
    await act(async () => { ack.resolve(true); await sleep(0); });
    // W04 R2 (§5, W08-to-W04 #1): the draft receipt alone is not 「已保存」; the version follows within ~1.5 s.
    assert.equal(b.hooks.state, 'saving');
    assert.equal(b.uploads[0].data.text, 'edit-1');
    await act(async () => { await sleep(1700); });
    assert.deepEqual(b.versions, [1]);
    assert.equal(b.hooks.state, 'saved');
    assert.equal(typeof b.boundFlush, 'function');
    await act(async () => { assert.equal((await b.boundFlush()).ok, true); });
    assert.deepEqual(b.versions, [1], 'an explicit gate after the version has nothing left to publish');
  } finally { await tree.unmount(); }
});
test('image-draft receipts turn green only once the version is committed', async () => {
  const b = bed(), ack = deferred();
  const imageProject = {
    schema: 'oceanleo.fabric-image.v1',
    version: 1,
    updatedAt: '2026-10-21T00:00:00.000Z',
    snapshot: { doc: { width: 1080, height: 1080 }, json: { objects: [{ type: 'textbox', text: 'saved edit' }] } },
  };
  b.draft.schema = 'oceanleo.fabric-image.edit.v1';
  b.draft.captureRevision = revision => ({ revision, payload: imageProject });
  b.session.recordDraft = async p => { b.records.push(p); return ack.promise; };
  const tree = await mount(React.createElement(Probe, { b }));
  try {
    await edit(b, 1); await waitDraft();
    assert.equal(b.uploads.length, 1);
    assert.equal(b.uploads[0].schema, 'oceanleo.fabric-image.edit.v1');
    assert.equal(b.uploads[0].data.schema, 'oceanleo.fabric-image.v1');
    assert.equal(b.uploads[0].data.snapshot.json.objects[0].text, 'saved edit');
    assert.equal(b.records.length, 1);
    assert.equal(b.hooks.state, 'saving', 'upload alone is not a durable receipt');
    assert.deepEqual(b.versions, [], 'the version waits for the draft receipt');
    await act(async () => { ack.resolve(true); await sleep(0); });
    assert.equal(b.hooks.state, 'saving', 'W04 R2: a draft receipt is not yet a server version');
    await act(async () => { await sleep(1700); });
    assert.deepEqual(b.versions, [1]);
    assert.equal(b.hooks.state, 'saved');
  } finally { await tree.unmount(); }
});
test('real hook reuses uploaded draft on failed CAS; pagehide forces the complete version', async () => {
  const b = bed(); let attempts = 0;
  b.session.recordDraft = async p => { b.records.push(p); return ++attempts > 1; };
  const tree = await mount(React.createElement(Probe, { b }));
  try {
    await edit(b, 1); await waitDraft(); assert.equal(b.hooks.state, 'saving');
    await act(async () => { await sleep(1550); });
    assert.equal(b.uploads.length, 1); assert.equal(b.records.length, 2);
    await act(async () => { await sleep(1700); });
    assert.deepEqual(b.versions, [1]); assert.equal(b.hooks.state, 'saved');
    await act(async () => { window.dispatchEvent(new window.Event('pagehide')); await sleep(0); });
    assert.deepEqual(b.versions, [1], 'pagehide after the version has nothing left to publish');
  } finally { await tree.unmount(); }
});
test('a captured server draft destination cannot drift to another session during upload', async () => {
  const b = bed(), uploaded = deferred();
  globalThis.__e6Upload = async () => uploaded.promise;
  const tree = await mount(React.createElement(Probe, { b }));
  try {
    await edit(b, 1); await waitDraft();
    const nextRecords = [];
    const other = { ...b.session, sessionId: 'session-2', recordDraft: async p => { nextRecords.push(p); return true; } };
    await tree.rerender(React.createElement(Probe, { b, session: other }));
    await act(async () => { uploaded.resolve({ ok: true, data: { file: { url: 'https://files.example/draft.json' } } }); await sleep(0); });
    assert.equal(b.records.length, 1); assert.deepEqual(nextRecords, []);
  } finally { await tree.unmount(); }
});
test('a session without draft persistence uses the 500ms full-save path', async () => {
  const b = bed(); delete b.session.recordDraft;
  const tree = await mount(React.createElement(Probe, { b }));
  try {
    const startedAt = Date.now();
    await edit(b, 1);
    await act(async () => { await sleep(350); });
    assert.deepEqual(b.uploads, []); assert.deepEqual(b.versions, []);
    await act(async () => { await sleep(250); });
    const elapsedMs = Date.now() - startedAt;
    assert.deepEqual(b.versions, [1]); assert.equal(b.hooks.state, 'saved');
    assert.ok(elapsedMs >= 450 && elapsedMs < 1300, `500ms debounce measured ${elapsedMs}ms`);
    assert.equal(b.boundFlush, null);
  } finally { await tree.unmount(); }
});

test('a newly created session enables drafts after the legacy save finishes without duplicating its in-flight work', async () => {
  const b = bed(), pending = deferred(); b.session.sessionId = null;
  b.flush = async () => { b.versions.push(b.revision); return pending.promise; };
  const tree = await mount(React.createElement(Probe, { b }));
  let first;
  try {
    await edit(b, 1);
    await act(async () => { first = b.hooks.flushLatest(); });
    const session = { ...b.session, sessionId: 'session-created' };
    await tree.rerender(React.createElement(Probe, { b, session }));
    await waitDraft();
    assert.deepEqual(b.uploads, [], 'session creation must not launch a second tier for the same in-flight edit');
    await act(async () => { pending.resolve({ ok: true, item: { id: 'v1', meta: {} } }); await first; });
    await edit(b, 2); await waitDraft();
    assert.equal(b.uploads.length, 1); assert.equal(b.uploads[0].editRevision, 2);
    assert.deepEqual(b.versions, [1]);
  } finally {
    pending.resolve({ ok: true }); await first; await tree.unmount();
  }
});

test('W04 R2: a committed version whose session record hits a CAS conflict says saving, never 保存失败, then saved', async () => {
  const b = bed(); let records = 0, failing = true; const seen = [];
  b.session.recordSavedItem = async () => { records += 1; return !failing; };
  const tree = await mount(React.createElement(Probe, { b }));
  try {
    await edit(b, 1);
    for (let i = 0; i < 20 && b.versions.length === 0; i += 1) { await act(async () => { await sleep(250); }); seen.push(b.hooks.state); }
    assert.deepEqual(b.versions, [1]);
    await act(async () => { await b.boundFlush(); }); // an explicit gate while the record is still refused
    seen.push(b.hooks.state);
    assert.notEqual(b.hooks.state, 'error', 'the version is on the server; only the session record is owed');
    failing = false;
    for (let i = 0; i < 40 && b.hooks.state !== 'saved'; i += 1) { await act(async () => { await sleep(250); }); seen.push(b.hooks.state); }
    assert.deepEqual(b.versions, [1], 'the record retry does not publish the same edit twice');
    assert.ok(!seen.includes('error'), `states: ${seen.join(',')}`);
    assert.equal(b.hooks.state, 'saved');
    assert.ok(records >= 2, 'the record was retried');
  } finally { await tree.unmount(); }
});
