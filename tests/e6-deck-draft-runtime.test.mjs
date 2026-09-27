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



import { ADVANCED_DRAFT_META_KEY } from '../src/shell/advanced-draft.ts';
import { DECK_DRAFT_SCHEMA } from '../src/shell/advanced-draft-deck.ts';
import { normalizeDeckDocument } from '../src/shell/doc-editors/deck-schema.ts';
const { useDeckEditor } = await import(await compileModule('src/shell/doc-editors/use-deck-editor.ts', {
  '../../i18n/ui/useUI': dataModule('const tt = x => x; export function useUI() { return tt; }'),
  './doc-io': dataModule(`
    export function blobToDataUrl() { throw Error('unexpected'); }
    export function downloadBlob() { globalThis.__e6Deck.downloads++; }
    export function downloadText() { globalThis.__e6Deck.downloads++; }
    export function loadEditorProject() { throw Error('unexpected version read'); }
    export async function saveFileToLibrary(input) { return globalThis.__e6Deck.save(input); }
    export function urlExtension() { return ''; }
  `),
}));
const documentModel = normalizeDeckDocument({ title: 'Cloud title', slides: [{ id: 'slide', title: 'Cloud edit' }] });
const base = { id: 'base-1', key: 'root-1', source: 'creation', title: 'Base title', kind: 'ppt', siteId: 'ppt', favorite: false, meta: { parent_asset_id: 'root-1', deck: normalizeDeckDocument({ title: 'Version title' }) } };
const pointer = { rootId: 'root-1', baseRevisionId: 'base-1', url: 'https://files.example/draft.json', schema: DECK_DRAFT_SCHEMA, editRevision: 7, savedAt: '2026-09-27T00:00:00Z' };
let editor;
function Probe({ item = base }) { editor = useDeckEditor(item, 'ppt'); return null; }
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };

test('PPT hook restores the server document and exposes a durable revision, rejecting only older local recovery', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ...pointer, version: 1, data: { deck: documentModel, draft: null } }));
  const tree = await mount(React.createElement(Probe, { item: { ...base, meta: { ...base.meta, [ADVANCED_DRAFT_META_KEY]: pointer } } }));
  try {
    await act(async () => { await sleep(0); });
    assert.equal(editor.loading, false); assert.equal(editor.deck.title, 'Cloud title');
    assert.equal(editor.editRevision, 7); assert.equal(editor.draft.restoredRevision, 7);
    assert.equal(editor.dirty, true);
    const captured = editor.draft.capture(); captured.deck.title = 'Mutated capture';
    assert.equal(editor.deck.title, 'Cloud title');
    assert.equal(editor.restoreRecovery(base.meta.deck, Date.parse(pointer.savedAt) - 1), false);
    await act(async () => { assert.equal(editor.restoreRecovery(base.meta.deck, Date.parse(pointer.savedAt) + 1), true); });
    assert.equal(editor.deck.title, 'Version title'); assert.equal(editor.editRevision, 8);
  } finally { await tree.unmount(); globalThis.fetch = originalFetch; }
});
test('a successful PPT save still returns its version receipt after the editor unmounts', async () => {
  const pending = deferred(); globalThis.__e6Deck = { downloads: 0, save: async () => pending.promise };
  const tree = await mount(React.createElement(Probe, {}));
  await act(async () => { await sleep(0); });
  let saving;
  await act(async () => { editor.setTitle('Changed'); });
  await act(async () => { saving = editor.save(); });
  await tree.unmount();
  pending.resolve({ ok: true, url: 'https://files.example/new.pptx', versionId: 'base-2', projectUrl: 'https://files.example/new.json', title: 'Changed' });
  const saved = await saving;
  assert.equal(saved?.versionId, 'base-2'); assert.equal(saved?.item.id, 'base-2');
});
test('PPT JSON download waits for its complete version gate and stops on save failure', async () => {
  globalThis.__e6Deck = { downloads: 0 }; const pending = deferred();
  const tree = await mount(React.createElement(Probe, {}));
  try {
    await act(async () => { await sleep(0); });
    editor.draft.bindFlush(() => pending.promise);
    const exporting = editor.downloadJson();
    await Promise.resolve(); assert.equal(globalThis.__e6Deck.downloads, 0);
    pending.resolve({ ok: true }); await exporting;
    assert.equal(globalThis.__e6Deck.downloads, 1);
    editor.draft.bindFlush(async () => ({ ok: false, error: 'version failed' }));
    await assert.rejects(() => editor.downloadJson(), /version failed/);
    assert.equal(globalThis.__e6Deck.downloads, 1);
  } finally { await tree.unmount(); }
});

test('normal to professional handoff asks the host version queue instead of directly exporting again', async () => {
  let queued = 0, direct = 0;
  globalThis.__e6Deck = { save: async () => { direct++; return { ok: false }; } };
  const tree = await mount(React.createElement(Probe, {}));
  try {
    await act(async () => { await sleep(0); });
    editor.draft.bindFlush(async () => { queued++; return { ok: true }; });
    editor.persistInBackground();
    assert.equal(queued, 1); assert.equal(direct, 0);
  } finally { await tree.unmount(); }
});

test('a matching pointer arriving with session hydration triggers the actual PPT source loader', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ...pointer, version: 1, data: { deck: documentModel, draft: null } }));
  const tree = await mount(React.createElement(Probe, { item: base }));
  try {
    await act(async () => { await sleep(0); });
    assert.equal(editor.deck.title, 'Version title');
    await tree.rerender(React.createElement(Probe, { item: { ...base, meta: { ...base.meta, [ADVANCED_DRAFT_META_KEY]: pointer } } }));
    await act(async () => { await sleep(0); });
    assert.equal(editor.deck.title, 'Cloud title');
    assert.equal(editor.draft.restoredRevision, 7);
  } finally { await tree.unmount(); globalThis.fetch = originalFetch; }
});
