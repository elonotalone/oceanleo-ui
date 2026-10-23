import assert from 'node:assert/strict';
import test from 'node:test';
import React, { act } from 'react';
import './helpers/w1-jsdom-window.mjs';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const react = import.meta.resolve('react');
const requests = [];
const media = (id, type) => ({ id, key: id, artifactId: id, artifactType: type, title: id, kind: type === 'audio' ? 'audio' : 'image', meta: {} });
globalThis.__insertableOwn = async options => {
  requests.push({ own: options.artifactType });
  return { ok: true, data: { items: [media('own-' + options.artifactType, options.artifactType)] } };
};
globalThis.__insertablePublic = async options => {
  requests.push(options);
  return { ok: true, data: { items: [media('site-image', 'single_file_image'), media('wrong-pdf', 'pdf')] } };
};
const { InlineInsertableMaterialShelf } = await import(await compileModule('src/shell/InlineInsertableMaterialShelf.tsx', {
  '../i18n/ui/useUI': dataModule('export function useUI(){return text=>text;}'),
  './artifact-client': dataModule('export const listMyArtifacts=(options)=>globalThis.__insertableOwn(options); export const searchArtifactLibrary=(options)=>globalThis.__insertablePublic(options);'),
  './workspace-library-view': dataModule(`import React from ${JSON.stringify(react)}; export function WorkspaceCard({entry,onOpen,dragProps}){return React.createElement('button', {'data-item':entry.id,onClick:onOpen,...dragProps},entry.title);}`),
}));
const { createRoot } = await import('react-dom/client');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('insert shelf loads compatible own media and site templates, excludes wrong types and inserts directly', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const inserted = [];
  try {
    await act(async () => root.render(React.createElement(InlineInsertableMaterialShelf, {
      types: ['image', 'audio'], siteId: 'video', currentId: 'current', featured: [], accent: '#000', action: 'insert',
      perform: async (action, item) => { inserted.push([action, item.artifactId]); return { ok: true }; },
      canPerform: () => true,
    })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    assert.deepEqual(requests.filter(request => request.own).map(request => request.own).sort(), ['audio', 'composite_image', 'single_file_image']);
    const publicRequest = requests.find(request => request.originSiteKey);
    assert.equal(publicRequest.originSiteKey, 'video', 'public catalog scope is not widened');
    assert.equal(publicRequest.role, 'template');
    assert.equal(host.querySelector('[data-item="wrong-pdf"]'), null);
    const card = host.querySelector('[data-item="own-single_file_image"]');
    assert.ok(card);
    await act(async () => card.click());
    assert.deepEqual(inserted, [['insert', 'own-single_file_image']]);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

test('compatible types with no admissible entries show an honest empty state rather than a blank shelf', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(InlineInsertableMaterialShelf, {
      types: ['image'], siteId: 'video', currentId: 'current', featured: [], accent: '#000', action: 'insert',
      perform: async () => ({ ok: true }), canPerform: () => false,
    })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    assert.equal(host.querySelectorAll('[data-item]').length, 0);
    assert.match(host.textContent, /暂无素材/);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
