import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { compileModule, dataModule } from './helpers/module-bench.mjs';
const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve('fabric/node'));
const canvas = fabricRequire.resolve('canvas'); const previous = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve('jsdom')).href);
if (previous) require.cache[canvas] = previous; else delete require.cache[canvas];
const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://app.example.test' });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLTextAreaElement', 'Event', 'MouseEvent']) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : dom.window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const errors = [];
const oldError = console.error;
console.error = (...args) => { errors.push(args.join(' ')); };
const { createRoot } = await import('react-dom/client');
const { GameProjectEditorSession } = await import(await compileModule('src/shell/game-editor/GameProjectEditor.tsx', {
  '../../i18n/ui/useUI': dataModule('export const useUI = () => (text) => text;'),
  '../AdvancedWorkbenchShell': dataModule('export const AdvancedWorkbenchShell = ({adapter}) => adapter.stage;'),
  '../library-data': dataModule('export const isDurableLibraryItem = x => !!x.artifact; export const artifactProjectionToLibraryItem = x => x;'),
  '../artifact-client': dataModule('export const forkArtifact = async x => ({ok:true,data:{...x, artifactId:"copy", revisionId:"copy-v1",artifact:{access:{canEdit:true}}}});'),
  './game-project-api': dataModule('export const gameProjectApi = {};'),
}));
const textFile = (path, content) => ({ path, content, mediaType: 'text/plain', sha256: 'a'.repeat(64), byteSize: Buffer.byteLength(content) });
const project = { schema: 'game-project@1', entrypoint: 'index.html', title: '海岸', orientation: 'both', controls: ['touch'], files: [textFile('index.html', '<html>game</html>'), textFile('game.js', 'let score=0;')] };
const item = { artifactId: 'game-1', revisionId: 'v1', id: 'game-1', kind: 'game', title: '海岸' };
async function mount(api, currentItem = item) {
  const container = document.createElement('div'); document.body.append(container); const root = createRoot(container);
  await act(async () => { root.render(React.createElement(GameProjectEditorSession, { item: currentItem, api, onClose() {} })); });
  return { container, async close() { await act(async () => root.unmount()); container.remove(); } };
}
const apiBase = () => ({ load: async () => project, play: async () => ({url:'https://p-game.oceanleo.app/index.html'}), file: async () => '', current: async () => ({...item,revisionId:'v2'}) });
const button = (container, text) => [...container.querySelectorAll('button')].find(button => button.textContent === text);
async function type(textarea, value) {
  await act(async () => { Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(textarea, value); textarea.dispatchEvent(new window.Event('input', {bubbles:true})); });
}
test('real editor loads, switches files, saves and previews with opaque sandbox', async () => {
  const calls = []; const api = { ...apiBase(), save: async (...args) => { calls.push(args); return {...item,revisionId:'v2'}; } };
  const mounted = await mount(api); const {container} = mounted;
  assert.equal(container.querySelectorAll('option').length,2);
  const frame = container.querySelector('iframe'); assert.equal(frame.src,'https://p-game.oceanleo.app/index.html'); assert.equal(frame.getAttribute('sandbox'),'allow-scripts allow-pointer-lock');
  await act(async () => { const select = container.querySelector('select'); select.value='game.js'; select.dispatchEvent(new window.Event('change',{bubbles:true})); });
  const editor = container.querySelector('textarea[aria-label="game.js"]'); assert.equal(editor.value,'let score=0;');
  await type(editor,'let score=1;');
  assert.equal(button(container,'保存文件').disabled,false);
  await act(async () => button(container,'保存文件').click());
  assert.equal(calls.length,1); assert.equal(calls[0][1],'v1'); assert.deepEqual(calls[0][3],{'game.js':'let score=1;'});
  await mounted.close(); assert.deepEqual(errors,[]);
});
test('legacy game stays playable and read-only; unsafe play URL never creates frame', async () => {
  const mounted = await mount({...apiBase(), load:async()=>({...project,readOnly:true})});
  assert.equal(mounted.container.querySelector('textarea').readOnly,true);
  assert.equal(button(mounted.container,'保存文件').disabled,true);
  assert.equal(mounted.container.querySelector('#game-project-prompt'),null);
  await mounted.close();
  const unsafe = await mount({...apiBase(),play:async()=>({url:'https://oceanleo.com/game'})});
  assert.equal(unsafe.container.querySelector('iframe'),null); assert.match(unsafe.container.textContent,/隔离域/);
  await unsafe.close(); assert.deepEqual(errors,[]);
});
test('iteration polls jobs and adopts authoritative revision before the next save', async () => {
  const calls=[]; const api={...apiBase(),iterate:async(id,revision,prompt)=>{calls.push([id,revision,prompt]);return 'job-1';},job:async()=>({phase:'done',progress:100,artifactId:'game-1'})};
  const mounted=await mount(api); await type(mounted.container.querySelector('#game-project-prompt'),'加入海浪');
  await act(async()=>button(mounted.container,'迭代这一版').click());
  assert.deepEqual(calls,[['game-1','v1','加入海浪']]); assert.match(mounted.container.textContent,/游戏已更新/);
  await mounted.close(); assert.deepEqual(errors,[]);
});
test('load and job failures are visible and do not crash hooks', async () => {
  const failed=await mount({...apiBase(),load:async()=>{throw new Error('load failed');}});
  assert.match(failed.container.textContent,/load failed/); await failed.close();
  const mounted=await mount({...apiBase(),iterate:async()=> 'job',job:async()=>({phase:'failed',progress:30,message:'art failed'})});
  await type(mounted.container.querySelector('#game-project-prompt'),'change');
  await act(async()=>button(mounted.container,'迭代这一版').click());
  assert.match(mounted.container.textContent,/art failed/); await mounted.close(); assert.deepEqual(errors,[]);
});
test.after(()=>{console.error=oldError;dom.window.close();});

test('fork-on-save retries the same copy after a failed save, preserving the draft', async () => {
  let count=0; const ids=[];
  const mounted=await mount({...apiBase(),save:async(id)=>{ids.push(id);if (++count===1) throw new Error('save failed');return {...item,artifactId:'copy',revisionId:'copy-v2'};}},
    {...item,artifact:{access:{canEdit:false,canFork:true}}});
  await type(mounted.container.querySelector('textarea[aria-label]'),'edited');
  await act(async()=>button(mounted.container,'保存文件').click());
  assert.equal(mounted.container.querySelector('textarea[aria-label]').value,'edited');
  assert.match(mounted.container.textContent,/save failed/);
  await act(async()=>button(mounted.container,'保存文件').click());
  assert.deepEqual(ids,['copy','copy']);await mounted.close();assert.deepEqual(errors,[]);
});

test('view-only projects expose no iteration and no writable text',async()=>{
  const mounted=await mount(apiBase(),{...item,artifact:{access:{canEdit:false,canFork:false}}});
  assert.equal(mounted.container.querySelector('textarea').readOnly,true);
  assert.equal(mounted.container.querySelector('#game-project-prompt'),null);
  await mounted.close();assert.deepEqual(errors,[]);
});
