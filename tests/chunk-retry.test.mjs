import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { compileModule, dataModule } from './helpers/module-bench.mjs';

const helper = await import(await compileModule('src/lib/lazy-with-retry.tsx'));
const { loadChunkWithRetry, chunkRetryLoader, chunkRouteState, withChunkRetry, importWithChunkReload,
  isChunkLoadError, chunkUrlFromError, withCacheBust, reloadChunkOnce, CHUNK_RELOAD_STORAGE_KEY } = helper;
const { WorkbenchRouteChunkError } = await import(await compileModule('src/shell/advanced-routes/WorkbenchRouteLoading.tsx', {
  '../../i18n/ui/useUI': dataModule('export const useUI=()=>s=>s;'),
}));
const chunkError = (status = '') => Object.assign(new Error(`Loading chunk 42 failed. ${status}`), { name: 'ChunkLoadError', request: 'https://cdn.test/chunk.js' });
const probe = async () => ({ status: 200, ok: true, cacheBusted: true });
const memory = () => { const values = new Map(); return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }; };

test('chunk retry keeps jittered backoff, cache probes and unique tokens, then returns the real import', async () => {
  let calls = 0;
  const sleeps = [], tokens = [];
  const result = await loadChunkWithRetry('editor', async () => { if (++calls < 4) throw chunkError(); return 'editor'; }, {
    sleep: async ms => sleeps.push(ms), random: () => 0.5,
    probe: async (url, token) => { tokens.push(token); assert.equal(url, 'https://cdn.test/chunk.js'); return probe(); },
  });
  assert.deepEqual(result, { ok: true, value: 'editor', attempts: 4 });
  assert.deepEqual(sleeps, [375, 1125, 3000]);
  assert.equal(new Set(tokens).size, 3);
});

test('stale detection stops short retries and keeps the old-document reload guard', async () => {
  const result = await loadChunkWithRetry('editor', async () => { throw chunkError(); }, {
    probe: async () => ({ status: 404, ok: false, cacheBusted: true }),
    sleep: async () => assert.fail('404 must skip short network backoff'),
  });
  assert.equal(result.kind, 'stale-version');
  assert.equal(result.attempts, 1);
  const storage = memory(); let reloads = 0;
  const runtime = { storage, reload: () => reloads++ };
  assert.equal(reloadChunkOnce(runtime), true);
  assert.equal(reloadChunkOnce(runtime), false);
  await importWithChunkReload(async () => 'unrelated success', runtime);
  assert.equal(storage.getItem(CHUNK_RELOAD_STORAGE_KEY), '1');
  assert.equal(reloadChunkOnce(runtime), false);
  assert.equal(reloads, 1);
  assert.equal(reloadChunkOnce({ storage: null, reload: () => assert.fail('unguarded reload') }), false);
  assert.equal(reloadChunkOnce({ storage: { getItem(){ throw Error('blocked'); } } }), false);
});

test('exhaustion retries automatically while the same editor stays mounted', async () => {
  let calls = 0; const sleeps = [];
  const loader = chunkRetryLoader('editor-auto', async () => { if (++calls <= 4) throw chunkError(); return 'editor'; }, {
    sleep: async ms => sleeps.push(ms), random: () => 0, probe,
  });
  assert.equal(await loader(), 'editor');
  assert.deepEqual(sleeps, [250, 750, 2000, 30000]);
  assert.equal(chunkRouteState('editor-auto').phase, 'loading');
  const Dynamic = () => React.createElement('div', { 'data-real-editor': true });
  const Gate = withChunkRetry('editor-auto', Dynamic, WorkbenchRouteChunkError);
  const markup = renderToStaticMarkup(React.createElement(Gate));
  assert.match(markup, /data-real-editor/);
  assert.doesNotMatch(markup, /button|data-workbench-route-error/);
  const recovery = renderToStaticMarkup(React.createElement(WorkbenchRouteChunkError, { kind: 'network', attempts: 4 }));
  assert.match(recovery, /aria-busy="true"/);
  assert.doesNotMatch(recovery, /<button|重试|刷新页面/);
});

test('transient shell downloads recover without reloading a current deployment', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, status: 200 }));
  let calls = 0;
  const sleeps = [];
  const value = await importWithChunkReload(async () => { if (++calls <= 5) throw chunkError(); return 'ready'; }, {
    sleep: async ms => sleeps.push(ms), storage: memory(), reload: () => assert.fail('current module must not reload'),
  });
  assert.equal(value, 'ready');
  assert.equal(calls, 6);
  assert.ok(sleeps.includes(30000));
});

test('a stale module reloads once, then stays pending and retries until import recovers', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false, status: 404 }));
  let calls = 0, reloads = 0;
  const storage = memory();
  const value = await importWithChunkReload(async () => { if (++calls < 4) throw chunkError(); return 'ready'; }, {
    sleep: async () => {}, storage, reload: () => reloads++,
  });
  assert.equal(value, 'ready'); assert.equal(reloads, 1);
  assert.equal(storage.getItem(CHUNK_RELOAD_STORAGE_KEY), '1');
});

test('programming errors propagate immediately; module signatures and URL extraction stay precise', async () => {
  let calls = 0;
  await assert.rejects(importWithChunkReload(async () => { calls++; throw Error('render bug'); }), /render bug/);
  assert.equal(calls, 1);
  await assert.rejects(chunkRetryLoader('render-bug', async () => { throw Error('render bug'); })(), /render bug/);
  assert.equal(isChunkLoadError(chunkError()), true);
  assert.equal(isChunkLoadError(new Error('Failed to fetch dynamically imported module')), true);
  assert.equal(isChunkLoadError(new Error('render bug')), false);
  assert.equal(chunkUrlFromError(chunkError()), 'https://cdn.test/chunk.js');
  assert.equal(withCacheBust('https://cdn.test/chunk.js?dpl=abc', 'token'), 'https://cdn.test/chunk.js?dpl=abc&__leoChunkRetry=token');
});
