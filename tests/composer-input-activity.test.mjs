import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { compileModule, dataModule } from './helpers/module-bench.mjs';

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve('fabric/node'));
const canvas = fabricRequire.resolve('canvas');
const previous = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve('jsdom')).href);
if (previous) require.cache[canvas] = previous;
else delete require.cache[canvas];
const dom = new JSDOM('<!doctype html><body></body>');
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator })) {
  Object.defineProperty(globalThis, key, { configurable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__inputWrites = [];
globalThis.__inputEvents = [];
const { useComposerInputActivity } = await import(await compileModule('src/shell/use-composer-input-activity.ts', {
  '../lib/acp-frames-api': dataModule('export async function request(...args){ globalThis.__inputWrites.push(args); if(globalThis.__failInput) throw Error("offline"); return {available:true}; }'),
  '../lib/history-events': dataModule('export function notifyHistoryActivity(input){ globalThis.__inputEvents.push(input); }'),
}));
let edit;
function Harness({ taskId, value = '' }) {
  edit = useComposerInputActivity(taskId, value, () => {});
  return null;
}

test('typing reports immediately, batches continuous input, and sends no draft content', async () => {
  const timers = new Map();
  const originalSet = globalThis.setTimeout;
  const originalClear = globalThis.clearTimeout;
  globalThis.setTimeout = (callback, ms, ...args) => {
    if (ms !== 2000) return originalSet(callback, ms, ...args);
    const id = Symbol(); timers.set(id, callback); return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id) || originalClear(id);
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () => root.render(React.createElement(Harness, { taskId: 'task/1' })));
    // Merely opening/restoring a value is never activity.
    assert.equal(globalThis.__inputEvents.length, 0);
    await act(async () => { edit('secret draft'); edit('secret draft continued'); });
    assert.equal(globalThis.__inputEvents.length, 2);
    assert.equal(globalThis.__inputEvents[0].user, true);
    assert.equal(timers.size, 1);
    assert.equal(globalThis.__inputWrites.length, 0);
    await act(async () => [...timers.values()][0]());
    assert.equal(globalThis.__inputWrites.length, 1);
    const [path, options] = globalThis.__inputWrites[0];
    assert.equal(path, '/v1/agent/tasks/task%2F1/input-activity');
    assert.deepEqual(options, {method:'POST', keepalive:true});
    assert.equal(JSON.stringify(globalThis.__inputWrites).includes('secret'), false);
    // A final keystroke flushes against the old task during a task switch.
    await act(async () => edit('last edit'));
    await act(async () => root.render(React.createElement(Harness, {taskId:'task/2', value:'restored'})));
    assert.equal(globalThis.__inputWrites.length, 2);
    assert.equal(globalThis.__inputWrites[1][0], path);
    assert.equal(globalThis.__inputEvents.length, 3);
  } finally {
    await act(async () => root.unmount());
    globalThis.setTimeout = originalSet;
    globalThis.clearTimeout = originalClear;
  }
});

test('home drafts, unchanged values and clearing text do not report task activity', async () => {
  globalThis.__inputEvents = [];
  globalThis.__inputWrites = [];
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(React.createElement(Harness, {})));
  await act(async () => edit('home draft'));
  await act(async () => root.render(React.createElement(Harness, {taskId:'task', value:'saved'})));
  await act(async () => { edit('saved'); edit('   '); edit(''); });
  await act(async () => root.unmount());
  assert.deepEqual(globalThis.__inputEvents, []);
  assert.deepEqual(globalThis.__inputWrites, []);
});

test('offline activity never changes or drops the typed text', async () => {
  globalThis.__failInput = true;
  let value = '';
  function Offline() {
    edit = useComposerInputActivity('task', '', (next) => { value = next; });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(React.createElement(Offline)));
  await act(async () => edit('keep my draft'));
  await act(async () => root.unmount());
  assert.equal(value, 'keep my draft');
  globalThis.__failInput = false;
});

const { HistoryPage } = await import(await compileModule('src/shell/HistoryPage.tsx', {
  '../lib/agent': dataModule('export async function listTasks(){ return {ok:true,data:{items:globalThis.__inputPageRows}}; } export async function deleteTask(){return {ok:true};}'),
  '../i18n/ui/useUI': dataModule('export function useUI(){ return (text) => text; }'),
  '../ui': dataModule('export function ConfirmDialog(){return null;}'),
  './AppPageHeader': dataModule('export const APP_PAGE_FRAME_CLASS=""; export function AppPageHeader(){return null;}'),
  './LibraryLayout': dataModule('export function LibraryToolbar(){return null;}'),
}));

test('My Tasks page reorders unsent input immediately and preserves it across a stale refresh', async () => {
  globalThis.__inputPageRows = [
    {id:'a',title:'Task A',status:'done',mode:'agent',last_input_at:'2026-11-19T08:00:00Z'},
    {id:'b',title:'Task B',status:'done',mode:'agent',last_input_at:'2026-11-18T08:00:00Z'},
  ];
  const container = document.createElement('div');
  const root = createRoot(container);
  const order = () => [...container.querySelectorAll('p')].map((node) => node.textContent).filter((text) => /^Task [AB]$/.test(text));
  try {
    await act(async () => root.render(React.createElement(HistoryPage, {onOpen(){}})));
    assert.deepEqual(order(), ['Task A','Task B']);
    await act(async () => window.dispatchEvent(new dom.window.CustomEvent('oceanleo:history-activity', {
      detail:{taskId:'b',user:true,at:'2026-11-19T09:00:00Z'},
    })));
    assert.deepEqual(order(), ['Task B','Task A']);
    await act(async () => window.dispatchEvent(new dom.window.Event('focus')));
    assert.deepEqual(order(), ['Task B','Task A']);
  } finally {
    await act(async () => root.unmount());
  }
});
