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
  './ArtifactActions': dataModule(`import { createElement as h } from ${JSON.stringify(reactUrl)}; export const ArtifactActionButtons = () => h('div', {'data-header-actions': true}, ['zoom','edit','favourite','share','download'].map(label => h('button', {key: label, 'aria-label': label}, label))); export const artifactActionMatrix = () => ({});`),
  './library-detail-app-actions': dataModule('export const MaterialOwningAppEdit = () => null; export const MaterialOwningAppList = () => null; export const useMaterialDetailAppPlan = () => ({editRoute:"none"});'),
  './workspace-library-view': leaf,
  './asset-detail/AssetDetail': dataModule(`import { createElement as h } from ${JSON.stringify(reactUrl)}; export function AssetDetail({entry,onBack}) { return h('section', {'data-selected-entry':entry.id}, h('button', {'data-close-preview':true,onClick:onBack}, 'close')); }`),
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


for (const keepA of [false, true]) {
  test(`A → B keeps B preview when A ${keepA ? 'remains in results' : 'is removed from entries'}`, () => mounted(async (root, container) => {
    let open;
    const notifications = [];
    const a = { id: 'image-a', title: 'A', kind: 'image' };
    const b = { id: 'image-b', title: 'B', kind: 'image' };
    function Host() {
      const [active, setActive] = React.useState(null);
      open = setActive;
      if (!active) return React.createElement('div', { 'data-card-home': true });
      return React.createElement(WorkspaceLibrary, {
        entries: keepA && active.id !== a.id ? [a, active] : [active],
        openEntryId: active.id, allowHostRestore: false,
        onDetailOpenChange: value => { notifications.push(value); if (!value) setActive(null); },
      });
    }
    await act(async () => root.render(React.createElement(Host)));
    await act(async () => open(a));
    assert.equal(container.querySelector('[data-selected-entry]')?.dataset.selectedEntry, a.id, 'first open');
    await act(async () => open({ ...a }));
    assert.equal(container.querySelector('[data-selected-entry]')?.dataset.selectedEntry, a.id, 'same picture');
    notifications.length = 0;
    await act(async () => open(b));
    assert.equal(container.querySelector('[data-selected-entry]')?.dataset.selectedEntry, b.id, 'B remains selected');
    assert.equal(notifications.includes(false), false, 'switching must never notify the host to close');
    await act(async () => container.querySelector('[data-close-preview]').click());
    assert.ok(container.querySelector('[data-card-home]'), 'manual close returns to home');
  }));
}

test('removing an uncontrolled selection still closes its preview', () => mounted(async (root, container) => {
  const notifications = [];
  const props = { allowHostRestore: false, onDetailOpenChange: value => notifications.push(value) };
  await act(async () => root.render(React.createElement(WorkspaceLibrary, { ...props, entries: [entry] })));
  await act(async () => container.querySelector('[data-card]').click());
  await act(async () => root.render(React.createElement(WorkspaceLibrary, { ...props, entries: [] })));
  assert.equal(notifications.at(-1), false);
  assert.equal(container.querySelector('[data-selected-entry]'), null);
}));
