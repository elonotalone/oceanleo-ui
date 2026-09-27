import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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


const stubs = {
  "../lib/database": dataModule(`export async function uploadFile(file, options) { return globalThis.__e9.upload(file, options); }`),
  "./advanced-recovery-store": dataModule(`
    export async function readAdvancedRecovery(key) { return globalThis.__e9.local?.key === key ? globalThis.__e9.local : null; }
    export async function deleteAdvancedRecovery(key) { globalThis.__e9.deleted.push(key); }
    export async function writeAdvancedRecovery(record) { globalThis.__e9.local = record; }
  `),
};
await compileModule("src/shell/advanced-draft.ts", stubs);
const { useAdvancedAutoSave } = await import(await compileModule("src/shell/use-advanced-autosave.ts", stubs));
const { useAdvancedRecovery } = await import(await compileModule("src/shell/use-advanced-recovery.ts", stubs));
const { flushAdvancedDraftGate } = await import(await compileModule("src/shell/advanced-draft-gates.ts", stubs));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
function bed() {
  const b = { revision: 0, payload: { text: 'initial' }, uploads: [], records: [], versions: [], restores: [], deleted: [], local: null };
  b.item = { id: 'root-123', revisionId: 'base-1', versionId: 'base-1', title: 'Document', siteId: 'doc', meta: {} };
  b.upload = async (file) => { b.uploads.push(JSON.parse(await file.text())); return { ok: true, data: { file: { url: 'https://files.example/draft.json' } } }; };
  b.session = { sessionId: 'session-1', snapshot: () => ({ item: b.item }),
    recordDraft: async p => { b.records.push(p); return true; }, recordSavedItem: async () => true };
  b.flush = async () => { b.versions.push(b.revision); return { ok: true, item: b.item }; };
  b.recovery = { key: 'richdoc:root-123:base-1', draftSchema: 'oceanleo.richdoc.edit.v1', ready: true,
    capture: () => b.payload,
    restore: (payload, savedAt) => { b.restores.push({ payload, savedAt }); b.payload = payload; b.setInput({ revision: ++b.revision, dirty: true }); return true; } };
  globalThis.__e9 = b;
  return b;
}
function Probe({ b }) {
  const [input, setInput] = React.useState({ revision: 0, dirty: false });
  b.setInput = setInput; b.revision = input.revision;
  b.hook = useAdvancedAutoSave({ ...input, key: b.key, editorId: b.editorId, item: b.item, recovery: b.recovery, session: b.session, flush: b.flush });
  useAdvancedRecovery({ editorId: 'richdoc', ...input, persistenceState: b.hook.state,
    recovery: b.trackLocal ? b.recovery : undefined });
  return null;
}
async function edit(b, revision, payload = { text: 'edit-' + revision }) {
  b.payload = payload;
  await act(async () => b.setInput({ revision, dirty: true }));
}
async function tick(ms = 500) { await act(async () => { await sleep(ms); }); }
function server(b, schema = b.recovery.draftSchema) {
  const pointer = { rootId: 'root-123', baseRevisionId: 'base-1', schema, editRevision: 7,
    savedAt: new Date().toISOString(), url: 'https://files.example/server-draft.json' };
  b.item.meta.advanced_server_draft = pointer;
  globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ ...pointer, version: 1, data: { text: 'server' } }) });
  return pointer;
}

test('generic recovery adapter debounces 400ms and requires both upload and session acknowledgement', async () => {
  const b = bed(), ack = deferred(); b.session.recordDraft = async p => { b.records.push(p); return ack.promise; };
  const tree = await mount(React.createElement(Probe, { b }));
  try {
    await edit(b, 1); await tick(250); assert.equal(b.uploads.length, 0);
    await tick(250); assert.equal(b.uploads.length, 1); assert.equal(b.records.length, 1);
    assert.equal(b.hook.state, 'saving'); assert.equal(b.records[0].editRevision, 1);
    await act(async () => { ack.resolve(true); await sleep(0); });
    assert.equal(b.hook.state, 'saved'); assert.equal(b.versions.length, 0);
  } finally { ack.resolve(true); await tree.unmount(); }
});

for (const failure of ['upload', 'session']) test(failure + ' failure never reports saved', async () => {
  const b = bed();
  if (failure === 'upload') b.upload = async () => { throw Error('offline'); };
  else b.session.recordDraft = async () => false;
  const tree = await mount(React.createElement(Probe, { b }));
  try { await edit(b, 1); await tick(); assert.notEqual(b.hook.state, 'saved'); assert.equal(b.versions.length, 0); }
  finally { await tree.unmount(); }
});

for (const [name, payload] of [['binary', { data: new ArrayBuffer(4) }], ['blob URL', { src: 'blob:local/1' }], ['oversize', { text: 'x'.repeat(5000001) }]]) {
  test(name + ' falls back to full version without premature saved', async () => {
    const b = bed(), full = deferred(); b.flush = () => { b.versions.push(b.revision); return full.promise; };
    const tree = await mount(React.createElement(Probe, { b }));
    try {
      await edit(b, 1, payload); await tick();
      assert.equal(b.uploads.length, 0); assert.equal(b.versions.length, 1); assert.equal(b.hook.state, 'saving');
      await act(async () => { full.resolve({ ok: true, item: b.item }); await sleep(0); });
      assert.equal(b.hook.state, 'saved');
    } finally { full.resolve({ ok: true, item: b.item }); await tree.unmount(); }
  });
}

test('matching server draft restores timestamp and does not immediately upload it again', async () => {
  const b = bed(), p = server(b); const tree = await mount(React.createElement(Probe, { b }));
  try {
    await tick(); assert.deepEqual(b.restores, [{ payload: { text: 'server' }, savedAt: Date.parse(p.savedAt) }]);
    assert.equal(b.uploads.length, 0); assert.equal(b.hook.state, 'saved');
    await act(async () => { assert.equal((await b.hook.flushLatest()).ok, true); });
    assert.equal(b.versions.length, 1, 'restored content still requires a full version on a gate');
  } finally { await tree.unmount(); }
});

test('foreign face pointer blocks both automatic and explicit saves, preserving the latest server draft', async () => {
  const b = bed(); server(b, 'oceanleo.richdoc.pro.v1');
  const tree = await mount(React.createElement(Probe, { b }));
  try {
    await edit(b, 1); await tick();
    assert.match(b.hook.errorMessage, /另一|专业/);
    assert.equal((await b.hook.flushLatest()).ok, false);
    assert.equal(b.uploads.length, 0); assert.equal(b.versions.length, 0); assert.equal(b.restores.length, 0);
  } finally { await tree.unmount(); }
});

test('failed server read pauses save; retry restores before any publication', async () => {
  const b = bed(); server(b); globalThis.fetch = async () => { throw Error('offline'); };
  const tree = await mount(React.createElement(Probe, { b }));
  try {
    await tick(); assert.equal(b.hook.state, 'error'); assert.match(b.hook.errorMessage, /草稿/);
    assert.equal((await b.hook.flushLatest()).ok, false); assert.equal(b.versions.length, 0);
    server(b);
    await act(async () => { await b.hook.retry(); await sleep(0); }); await tick();
    assert.equal(b.restores.length, 1); assert.equal(b.hook.state, 'saved'); assert.equal(b.uploads.length, 0);
  } finally { await tree.unmount(); }
});

for (const newer of [true, false]) test('local draft ' + (newer ? 'newer' : 'older') + ' than server chooses newer content', async () => {
  const b = bed(), p = server(b);
  b.local = { key: b.recovery.key + ':' + b.recovery.draftSchema, revision: 1, updatedAt: Date.parse(p.savedAt) + (newer ? 1000 : -1000), payload: { text: 'local' } };
  const tree = await mount(React.createElement(Probe, { b }));
  try {
    await tick(); assert.equal(b.restores.length, 1); assert.equal(b.restores[0].payload.text, newer ? 'local' : 'server');
    assert.equal(b.uploads.length, newer ? 1 : 0);
    if (!newer) assert.equal(b.deleted.length, 1);
  } finally { await tree.unmount(); }
});

test('iframe revision 3 snapshot cannot save current revision 4', async () => {
  const b = bed(), full = deferred();
  b.recovery.captureRevision = async () => ({ revision: 3, payload: { text: 'old' } });
  b.flush = () => full.promise;
  const tree = await mount(React.createElement(Probe, { b }));
  try { await edit(b, 4); await tick(); assert.equal(b.uploads.length, 0); assert.notEqual(b.hook.state, 'saved'); }
  finally { full.resolve({ ok: true }); await tree.unmount(); }
});


test('restored server content keeps its original edit time in local recovery, so reopening does not upload it again', async () => {
  const b = bed(), p = server(b); b.trackLocal = true;
  let tree = await mount(React.createElement(Probe, { b }));
  await tick(); await tree.unmount();
  assert.equal(b.local.updatedAt, Date.parse(p.savedAt));
  b.restores = [];
  tree = await mount(React.createElement(Probe, { b }));
  try { await tick(); assert.equal(b.uploads.length, 0); assert.equal(b.restores.length, 1); }
  finally { await tree.unmount(); }
});


test('media handoff aliases honor foreign-face protection and exports cannot bypass it', async () => {
  const b = bed(); b.key = 'display-key'; b.editorId = 'chart-editor@1';
  b.item.id = 'alias-chart'; server(b, 'other-face'); b.item.meta.advanced_server_draft.rootId = b.item.id;
  const tree = await mount(React.createElement(Probe, { b }));
  try {
    assert.equal((await flushAdvancedDraftGate('chart-editor:alias-chart', 'export')).ok, false);
    const switching = await flushAdvancedDraftGate('chart-editor:alias-chart');
    assert.equal(switching.ok, true); assert.equal(switching.item.meta.advanced_server_draft.schema, 'other-face');
    assert.equal(b.versions.length, 0);
  } finally { await tree.unmount(); }
});

test('a full version receipt lets the next face ignore stale props only after session acknowledgement', async () => {
  const b = bed(), p = server(b); p.url += '?published-test';
  // Rebuild the transport envelope after changing this receipt identity.
  globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ ...p, version: 1, data: { text: 'server' } }) });
  b.flush = async () => ({ ok: true, item: { ...b.item, revisionId: 'committed-after-restore' } });
  let tree = await mount(React.createElement(Probe, { b }));
  await tick(10);
  await act(async () => { assert.equal((await b.hook.flushLatest()).ok, true); });
  await tree.unmount();
  const next = bed(); next.item.meta.advanced_server_draft = p; next.recovery.draftSchema = 'oceanleo.richdoc.pro.v1';
  tree = await mount(React.createElement(Probe, { b: next }));
  try { await tick(10); assert.equal(next.hook.errorMessage, undefined); assert.equal(next.restores.length, 0); }
  finally { await tree.unmount(); }
});


test('a pre-schema local recovery is still considered when it is newer than the server', async () => {
  const b = bed(), p = server(b);
  b.local = { key: b.recovery.key, revision: 8, updatedAt: Date.parse(p.savedAt) + 1000, payload: { text: 'legacy-local-newer' } };
  const tree = await mount(React.createElement(Probe, { b }));
  try { await tick(); assert.equal(b.restores[0].payload.text, 'legacy-local-newer'); assert.equal(b.uploads.length, 1); }
  finally { await tree.unmount(); }
});
