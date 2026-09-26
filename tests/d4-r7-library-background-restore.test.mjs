import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React, { act } from 'react';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { setLibraryCurrentIdentity, resetLibraryCurrentIdentityForTests } from '../src/shell/library-current-identity.ts';

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve('fabric/node'));
const canvasPath = fabricRequire.resolve('canvas');
const oldCanvas = require.cache[canvasPath];
require.cache[canvasPath] = { id: canvasPath, filename: canvasPath, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve('jsdom')).href);
if (oldCanvas) require.cache[canvasPath] = oldCanvas;
else delete require.cache[canvasPath];
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://p-test.dev.oceanleo.com/workspace', pretendToBeVisual: true });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent']) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === 'window' ? dom.window : dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reactUrl = pathToFileURL(require.resolve('react')).href;
const leaf = dataModule(`
import { createElement as h } from ${JSON.stringify(reactUrl)};
export function WorkspaceCard({entry,onOpen}) { return h('button', {'data-card':entry.id,onClick:onOpen}, entry.title); }
export const WorkspaceListRow = WorkspaceCard;
export function WorkspaceLibraryEmpty() { return h('p',null,'empty'); }
export function WorkspaceLibraryEntryViewer() { return h('p',{'data-detail':true},'detail'); }
`);
const { WorkspaceLibrary } = await import(await compileModule('src/shell/WorkspaceLibrary.tsx', {
  '../i18n/ui/useUI': dataModule('export const useUI = () => text => text;'),
  '../lib/virtual': dataModule('export const pixelsPerRem = () => 16; export const useVirtualGrid = ({itemCount}) => ({startIndex:0,endIndex:itemCount,spacerTop:0,spacerBottom:0,containerProps:{}});'),
  './LibraryLayout': dataModule('export const LibraryChips = () => null; export const LibraryToolbar = () => null;'),
  './ArtifactActions': dataModule('export const ArtifactActionButtons = () => null; export const artifactActionMatrix = () => ({});'),
  './library-detail-app-actions': dataModule('export const MaterialOwningAppEdit = () => null; export const MaterialOwningAppList = () => null; export const useMaterialDetailAppPlan = () => ({editRoute:"none"});'),
  './workspace-library-view': leaf,
}));
const { createRoot } = await import('react-dom/client');
const entry = { id: 'autosaved-entry', title: 'Current website', kind: 'website', category: 'website' };

async function mounted(run) {
  resetLibraryCurrentIdentityForTests();
  window.history.replaceState(null, '', '/workspace');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try { await run(root, container); }
  finally { await act(async () => root.unmount()); container.remove(); resetLibraryCurrentIdentityForTests(); }
}

for (const hiddenProps of [{ hidden: true }, { inert: true }, { 'aria-hidden': true }]) {
  test(`hidden library restores only local selection: ${Object.keys(hiddenProps)[0]}`, () => mounted(async (root, container) => {
    const opened = [];
    setLibraryCurrentIdentity({ artifactId: '', entryId: entry.id });
    const render = entries => root.render(React.createElement('div', hiddenProps, React.createElement(WorkspaceLibrary, { entries, onOpenEntry: e => opened.push(e) })));
    await act(async () => render([]));
    await act(async () => render([entry]));
    assert.equal(opened.length, 0);
    assert.ok(container.querySelector('[data-detail]'), 'hidden library still restores its own detail selection');
  }));
}

test('autosave appearing behind foreground edit keeps editor mounted and mode edit', () => mounted(async root => {
  let mode = 'edit';
  let unmounts = 0;
  function Editor() { React.useEffect(() => () => { unmounts++; }, []); return React.createElement('div', { 'data-editor': true }); }
  function Host({ entries }) {
    const [activeMode, setMode] = React.useState('edit');
    mode = activeMode;
    return React.createElement(React.Fragment, null,
      activeMode === 'edit' && React.createElement(Editor),
      React.createElement('div', { inert: activeMode === 'edit', 'aria-hidden': activeMode === 'edit' },
        React.createElement(WorkspaceLibrary, { entries, onOpenEntry: () => setMode('preview') })));
  }
  setLibraryCurrentIdentity({ artifactId: '', entryId: entry.id });
  await act(async () => root.render(React.createElement(Host, { entries: [] })));
  await act(async () => root.render(React.createElement(Host, { entries: [entry] })));
  assert.equal(mode, 'edit');
  assert.equal(unmounts, 0);
}));

test('visible library initial ?item URL restores the durable artifact entry', () => mounted(async root => {
  const artifactId = 'd4-r7-durable-website';
  const revisionId = 'r7-revision-1';
  const durableEntry = { ...entry, id: 'artifact:' + artifactId + ':' + revisionId, libraryItem: {
    id: artifactId, artifactId, revisionId, artifactType: 'website', kind: 'website',
    title: entry.title, meta: {}, artifact: { artifactId, revisionId },
  } };
  window.history.replaceState(null, '', '/workspace?item=' + artifactId);
  const opened = [];
  await act(async () => root.render(React.createElement(WorkspaceLibrary, { entries: [durableEntry], onOpenEntry: e => opened.push(e.id) })));
  assert.deepEqual(opened, [durableEntry.id]);
}));

test('visible explicit card click still opens the host canvas', () => mounted(async (root, container) => {
  const opened = [];
  await act(async () => root.render(React.createElement(WorkspaceLibrary, { entries: [entry], onOpenEntry: e => opened.push(e.id) })));
  await act(async () => container.querySelector('[data-card]').click());
  assert.deepEqual(opened, [entry.id]);
}));

test('hidden late explicit preview action also restores only local selection', () => mounted(async (root, container) => {
  const opened = [];
  const action = { nonce: 'r7-background-action', action: { tab: 'preview', entryId: entry.id } };
  await act(async () => root.render(React.createElement('div', { inert: true }, React.createElement(WorkspaceLibrary, { entries: [entry], action, onOpenEntry: e => opened.push(e.id) }))));
  assert.equal(opened.length, 0);
  assert.ok(container.querySelector('[data-detail]'));
}));

 test('visible library drawer cannot restore host while editor owns canvas', () => mounted(async (root, container) => {
  const opened = [];
  setLibraryCurrentIdentity({ artifactId: '', entryId: entry.id });
  await act(async () => root.render(React.createElement(WorkspaceLibrary, { entries: [entry], allowHostRestore: false, onOpenEntry: e => opened.push(e.id) })));
  assert.equal(opened.length, 0);
  assert.ok(container.querySelector('[data-detail]'));
}));

test('explicit click is allowed while automatic host restore is disabled', () => mounted(async (root, container) => {
  const opened = [];
  await act(async () => root.render(React.createElement(WorkspaceLibrary, { entries: [entry], allowHostRestore: false, onOpenEntry: e => opened.push(e.id) })));
  await act(async () => container.querySelector('[data-card]').click());
  assert.deepEqual(opened, [entry.id]);
}));

test('visible first explicit deep-link action opens the requested entry', () => mounted(async root => {
  const opened = [];
  const action = { nonce: 'r7-visible-action', action: { tab: 'preview', entryId: entry.id } };
  await act(async () => root.render(React.createElement(WorkspaceLibrary, { entries: [entry], action, onOpenEntry: e => opened.push(e.id) })));
  assert.deepEqual(opened, [entry.id]);
}));
