import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
import { AdvancedPersistenceController } from '../src/shell/advanced-persistence-controller.ts';
import { saveFileToLibraryWithDependencies } from '../src/shell/doc-editors/doc-io.ts';

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve('fabric/node'));
const canvas = fabricRequire.resolve('canvas'), previousCanvas = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve('jsdom')).href);
if (previousCanvas) require.cache[canvas] = previousCanvas; else delete require.cache[canvas];
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://test.dev.oceanleo.com' });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const react = JSON.stringify(pathToFileURL(require.resolve('react')).href);
const jsx = JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href);
const stub = source => dataModule(source);
const handoff = { kind: 'url', url: 'https://fixture.test/model.glb', format: 'glb', revision: 'r1' };
const item = {
  key: 'artifact:model:r1', source: 'artifact', id: 'model', artifactId: 'model', revisionId: 'r1',
  artifactType: 'model_3d', title: 'Chair', kind: 'model3d', siteId: 'ppt', favorite: false,
  meta: { artifact_id: 'model', revision_id: 'r1', artifact_type: 'model_3d' },
  artifact: { artifactId: 'model', revisionId: 'r1', artifactType: 'model_3d', sourceFormat: 'glb', editability: 'editable', integrity: { ok: true }, renditions: {} },
};
const compiled = await compileModule('src/shell/media-editors/Model3DNextStage.tsx', {
  '../AdvancedWorkbenchShell': stub(`import {useEffect} from ${react}; export function AdvancedWorkbenchShell({adapter}) { globalThis.d12.adapter=adapter; useEffect(()=>{globalThis.d12.controller.observe({dirty:adapter.persistence.dirty,revision:adapter.persistence.editRevision});},[adapter.persistence.dirty,adapter.persistence.editRevision]); return adapter.stage; }`),
  '../advanced-routes/mode-switch-gate': stub(`export function useModeSwitchHandoff(){return globalThis.d12.handoff;} export function useModeSwitchFailure(){return globalThis.d12.failure;} export function useModeSwitchReady(ready){globalThis.d12.ready=ready;}`),
  '../advanced-routes/editor-handoff': stub('export function useEditorHandoffSource(){return globalThis.d12.source;}'),
  '../advanced-routes/w19-handoff-store': stub('export function peekW19EnterHandoff(){return null;} export function resolveW19Handoff(item,source){return source;} export function w19ItemKey(){return "model";} export function reportW19ProSaved(key,item){globalThis.d12.reported=item;}'),
  '../doc-editors/doc-io': stub('export async function saveFileToLibrary(input){globalThis.d12.inputs.push(input);return globalThis.d12.save(input);}'),
  '../plugin-command': stub('export function usePluginCommandSurface(){}'),
  '../agent-review': stub('export function rememberEditorChips(){}'),
  './model3d-source-cache': stub('export async function preloadModel3DSource(){return {bytes:new Uint8Array([1,2,3]).buffer,format:"glb"};}'),
  './Model3DNextToolbar': stub('export function Model3DNextToolbar(){return null;}'),
  './Model3DNextDirector': stub('export function Model3DNextDirector(){return null;}'),
  './Model3DViewerStage': stub('export function Model3DViewerStage(){return null;}'),
  './Model3DHostedFrame': stub(`import {useEffect} from ${react}; import {jsx} from ${jsx}; export function Model3DHostedFrame(props){globalThis.d12.frame=props;useEffect(()=>props.onReady(),[]);return jsx('div',{'data-frame':'true'});} export function postModel3DInit(){return true;} export function postModel3DSetMode(){return true;} export function postModel3DRecoveryCapture(frame,instance,id){globalThis.d12.captureId=id;return true;}`),
});
const { Model3DNextStage } = await import(compiled);
function returnedItem(input, revisionId) {
  const rendition = (purpose, value) => ({ ...value, purpose, revisionId });
  return { ...input.item, revisionId, key: `artifact:model:${revisionId}`, url: 'https://fixture.test/saved.glb',
    meta: { ...input.item.meta, revision_id: revisionId, previous_revision_id: input.item.revisionId },
    artifact: { artifactId: 'model', revisionId, artifactType: 'model_3d', sourceFormat: 'glb', editability: 'editable',
      integrity: { ok: true, code: 'ok', reason: '' }, renditions: {
        source: rendition('source', { url: 'https://fixture.test/saved.glb', format: 'glb', digest: 'sha256:'+'a'.repeat(64), mediaType: 'model/gltf-binary' }),
        full: rendition('full', { url: 'https://fixture.test/saved.glb', format: 'glb', digest: 'sha256:'+'a'.repeat(64), mediaType: 'model/gltf-binary' }),
      } },
  };
}
async function mount() {
  const timers = new Map(); let timerId = 0;
  const state = globalThis.d12 = { inputs: [], handoff, source: { status: 'ready', source: handoff }, failure() {}, save: async input => ({ ok: true, item: returnedItem(input, `r${state.inputs.length+1}`) }) };
  state.controller = new AdvancedPersistenceController({ maxRetries: 0,
    setTimeout: cb => { timers.set(++timerId, cb); return timerId; }, clearTimeout: id => timers.delete(id),
    flushRevision: () => state.adapter.persistence.flush(), recordSavedItem: () => true,
  });
  const container = document.createElement('div'); document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Model3DNextStage, { item, siteId: 'ppt', onClose() {} })));
  await act(async () => {});
  return { state, timers, root, async close(){await act(async()=>root.unmount());state.controller.dispose();container.remove();} };
}
async function dirty(state) { await act(async () => state.frame.onDirty()); }
async function capture(state, bytes = [4,5,6], ok = true) {
  assert.ok(state.captureId, 'save must ask the hosted editor for a fresh snapshot');
  await act(async () => state.frame.onSnapshot({ recoveryId: state.captureId, ok, gltfBase64: ok ? Buffer.from(bytes).toString('base64') : '' }));
}

test('import dirty stays saved; every subsequent dirty advances the real autosave queue', async () => {
  const m = await mount(); const { state, timers } = m;
  try {
    await dirty(state);
    assert.equal(state.adapter.persistence.editRevision, 0); assert.equal(timers.size, 0);
    assert.equal(state.controller.snapshot().state, 'saved'); assert.equal(state.ready, true);
    await dirty(state);
    assert.equal(state.adapter.persistence.editRevision, 1); assert.equal(timers.size, 1);
    assert.equal(state.controller.snapshot().state, 'saving');
    await dirty(state); assert.equal(state.adapter.persistence.editRevision, 2); assert.equal(timers.size, 1);
  } finally { await m.close(); }
});

test('autosave exports the new snapshot, advances the same typed root and keeps the pro editor ready', async () => {
  const m = await mount(); const { state, timers } = m;
  try {
    await dirty(state); await dirty(state);
    await act(async () => { [...timers.values()][0](); });
    await capture(state, [9,8,7]); await act(async () => { await state.controller.whenIdle(); });
    const input = state.inputs[0];
    assert.equal(input.artifactRevision?.artifactType, 'model_3d');
    assert.equal(input.item.artifactId, 'model'); assert.equal(input.item.revisionId, 'r1');
    assert.deepEqual([...new Uint8Array(await (await input.createFile()).arrayBuffer())], [9,8,7]);
    assert.equal(state.reported.artifactId, 'model'); assert.equal(state.reported.revisionId, 'r2');
    assert.equal(state.controller.snapshot().state, 'saved'); assert.equal(state.adapter.persistence.dirty, false);
    assert.equal(state.ready, true); assert.equal(state.adapter.mode.current, 'pro');
    await act(async () => m.root.render(React.createElement(Model3DNextStage, { item: state.reported, siteId: 'ppt', onClose() {} })));
    assert.equal(state.ready, true, 'the parent save acknowledgement must not reset model readiness');
    await dirty(state);
    let saving; await act(async () => { saving = state.controller.flushLatest(); });
    await capture(state, [6,5,4]); await act(async () => { await saving; });
    assert.equal(state.inputs[1].item.revisionId, 'r2', 'next manual save uses the acknowledged CAS pin');
    assert.notEqual(state.inputs[1].idempotencyKey, input.idempotencyKey);
    assert.equal(state.reported.revisionId, 'r3');
  } finally { await m.close(); }
});

test('capture failure refuses stale bytes and leaves a short save error', async () => {
  const m = await mount(); const { state } = m;
  try {
    await dirty(state); await dirty(state);
    let saving; await act(async () => { saving = state.controller.flushLatest(); });
    await capture(state, [], false); let result; await act(async () => { result = await saving; });
    assert.equal(result.ok, false); assert.match(result.error, /模型|快照/);
    assert.equal(state.inputs.length, 0); assert.equal(state.controller.snapshot().state, 'error');
  } finally { await m.close(); }
});

test('a 3D typed save uses the existing CAS publisher and never creates a creation', async () => {
  const m = await mount(); const { state } = m; const commits = [], uploads = [];
  try {
    state.save = input => saveFileToLibraryWithDependencies(input, {
      now: () => new Date('2026-09-26T00:00:00Z'),
      uploadFile: async (file, options) => { uploads.push(options); return { ok: true, data: { file: { url: `https://fixture.test/upload-${uploads.length}` } } }; },
      saveCreations: async () => { assert.fail('3D must not fall back to creations'); },
      createArtifactRevision: async (id, commit) => {
        commits.push({ id, commit });
        const next = returnedItem(input, 'r2');
        next.artifact.renditions = Object.fromEntries([{ purpose: 'source', ...commit.source }, ...commit.renditions].map(r => [r.purpose, { ...r, revisionId: 'r2', mediaType: r.purpose === 'editor_manifest' ? 'application/json' : 'model/gltf-binary' }]));
        return { ok: true, data: next };
      },
    });
    await dirty(state); await dirty(state);
    let saving; await act(async () => { saving = state.controller.flushLatest(); });
    await capture(state); let result; await act(async () => { result = await saving; });
    assert.equal(result.ok, true, result.error);
    assert.equal(commits.length, 1); assert.equal(commits[0].id, 'model');
    assert.equal(commits[0].commit.expectedRevisionId, 'r1'); assert.equal(commits[0].commit.artifactType, 'model_3d');
    assert.equal(uploads.length, 2);
  } finally { await m.close(); }
});

test('a hosted dirty:false acknowledgement does not become another user edit', async () => {
  const module = await import(await compileModule('src/shell/media-editors/Model3DHostedFrame.tsx'));
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
  let changes = 0;
  try {
    await act(async () => root.render(React.createElement(module.Model3DHostedFrame, {
      instanceId: 'd12-frame', hostOrigin: 'https://test.dev.oceanleo.com', src: 'https://3d.oceanleo.app/', title: '3D',
      onReady() {}, onSnapshot() {}, onError() {}, onDirty() { changes++; },
    })));
    const iframe = container.querySelector('iframe');
    const send = dirty => window.dispatchEvent(new window.MessageEvent('message', {
      origin: 'https://3d.oceanleo.app', source: iframe.contentWindow,
      data: { protocol: 'oceanleo.editor.v1', type: 'dirty', instanceId: 'd12-frame', dirty, revision: 1 },
    }));
    await act(async () => send(false)); assert.equal(changes, 0);
    await act(async () => send(true)); assert.equal(changes, 1);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
