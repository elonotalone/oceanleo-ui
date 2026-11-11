import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import React, { act, useRef, useState } from 'react';
import { compileModule } from './helpers/module-bench.mjs';
const require = createRequire(import.meta.url);
const fabric = createRequire(require.resolve('fabric/node'));
const canvas = fabric.resolve('canvas');
const previous = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabric.resolve('jsdom')).href);
if (previous) require.cache[canvas] = previous; else delete require.cache[canvas];
const dom = new JSDOM('<html><body></body></html>', { pretendToBeVisual: true });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement })) Object.defineProperty(globalThis, key, { configurable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let frames = new Map(); let frameId = 0; let observers = [];
globalThis.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
globalThis.IntersectionObserver = class { constructor(callback, options) { this.callback = callback; this.options = options; observers.push(this); } observe() {} disconnect() {} };
const { createRoot } = await import('react-dom/client');
const { useOlderHistory, OlderHistoryTop } = await import(await compileModule('src/shell/history/older-history.tsx'));
const tick = async () => { await act(async () => { const next = [...frames.values()]; frames.clear(); next.forEach((callback) => callback()); await Promise.resolve(); }); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

async function mount({ hasMore = true, disabled = false, scrollTop = 600, load } = {}) {
  frames = new Map(); observers = [];
  const errors = []; const originalError = console.error; console.error = (...args) => errors.push(args.map(String).join(' '));
  const host = document.createElement('div'); document.body.append(host);
  let patch; let scroller; let state;
  function Harness() {
    const ref = useRef(null);
    const [value, set] = useState({ ids: [10, 11, 12, 13, 14], hasMore, disabled }); patch = (next) => set((current) => ({ ...current, ...next }));
    state = useOlderHistory({ scrollRef: ref, firstKey: value.ids[0], hasMore: value.hasMore, disabled: value.disabled, loadOlder: load ?? (() => new Promise(() => {})) });
    return React.createElement('div', { ref: (node) => {
      ref.current = node; if (!node || scroller === node) return; scroller = node; node.scrollTop = scrollTop;
      Object.defineProperty(node, 'clientHeight', { configurable: true, value: 400 });
      node.getBoundingClientRect = () => ({ top: 0, bottom: 400 });
    } }, React.createElement(OlderHistoryTop, { ...state, hasMore: value.hasMore }), ...value.ids.map((id, index) => React.createElement('div', { key: id, 'data-history-item': '', 'data-history-key': String(id), ref: (node) => {
      if (node) node.getBoundingClientRect = () => ({ top: index * 200 + (value.hasMore ? 32 : 0) - scroller.scrollTop, bottom: (index + 1) * 200 + (value.hasMore ? 32 : 0) - scroller.scrollTop });
    } }, String(id))));
  }
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Harness)));
  const sentinel = host.querySelector('[data-older-history-sentinel]');
  if (sentinel) sentinel.getBoundingClientRect = () => ({ top: -scroller.scrollTop, bottom: -scroller.scrollTop });
  return { host, get scroller() { return scroller; }, get state() { return state; }, patch: async (next) => act(async () => patch(next)), scroll: async (top) => { await act(async () => { scroller.scrollTop = top; scroller.dispatchEvent(new window.Event('scroll')); }); }, close: async () => {
    await act(async () => root.unmount()); host.remove(); console.error = originalError; assert.deepEqual(errors, [], 'mounted hook must not log React errors');
  } };
}

test('one batch at a time; initial background prefetch; 1.5-screen observer margin', async () => {
  let calls = 0; const pending = deferred(); const view = await mount({ scrollTop: 2000, load: () => { calls++; return pending.promise; } });
  try { await tick(); assert.equal(calls, 1); assert.equal(observers[0].options.rootMargin, '600px 0px 0px 0px'); await view.scroll(500); await tick(); await tick(); assert.equal(calls, 1); } finally { await view.close(); }
});

test('chains inside buffer and stops when prepend leaves 1.5 screens above', async () => {
  let calls = 0; let view;
  view = await mount({ scrollTop: 300, load: async () => { calls++; await view.patch(calls === 1 ? { ids: [8, 9, 10, 11, 12, 13, 14] } : { ids: [6, 7, 8, 9, 10, 11, 12, 13, 14] }); } });
  try { await tick(); await tick(); assert.equal(calls, 1); assert.equal(view.scroller.scrollTop, 700); await view.scroll(500); await tick(); await tick(); assert.equal(calls, 2); assert.equal(view.scroller.scrollTop, 900); } finally { await view.close(); }
});

test('disabled and exhausted histories never load and exhausted top has no slot', async () => {
  for (const options of [{ hasMore: false }, { disabled: true }]) {
    let calls = 0; const view = await mount({ ...options, load: async () => { calls++; } });
    try { await tick(); assert.equal(calls, 0); if (!options.hasMore && !options.disabled) assert.equal(view.host.querySelector('[data-older-history-top]'), null); } finally { await view.close(); }
  }
});

test('first visible message stays within one pixel during prepend plus bottom append', async () => {
  const pending = deferred(); const view = await mount({ scrollTop: 300, load: () => pending.promise });
  try {
    await tick(); const item = view.host.querySelector('[data-history-key="11"]'); const before = item.getBoundingClientRect().top;
    await view.patch({ ids: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17] });
    assert.ok(Math.abs(item.getBoundingClientRect().top - before) <= 1); assert.equal(view.scroller.scrollTop, 700);
    await act(async () => pending.resolve());
  } finally { await view.close(); }
});

test('bottom-only streaming does not change scrollTop; final slot removal is anchored', async () => {
  const pending = deferred(); const view = await mount({ scrollTop: 300, load: () => pending.promise });
  try { await tick(); await view.patch({ ids: [10, 11, 12, 13, 14, 15] }); assert.equal(view.scroller.scrollTop, 300);
    const before = view.host.querySelector('[data-history-key="11"]').getBoundingClientRect().top;
    await view.patch({ ids: [8, 9, 10, 11, 12, 13, 14, 15], hasMore: false });
    assert.equal(view.host.querySelector('[data-history-key="11"]').getBoundingClientRect().top, before);
  } finally { await view.close(); }
});

test('spinner only at visible top while pending, fixed slot and no visible loading text', async () => {
  const view = await mount({ scrollTop: 300 });
  try { await tick(); assert.equal(view.state.loading, true); assert.equal(view.host.querySelector('.v-spinner'), null);
    await view.scroll(0); await tick(); assert.ok(view.host.querySelector('.v-spinner')); assert.equal(view.host.querySelector('[data-older-history-top]').style.height, '32px'); assert.equal(view.host.querySelector('[role="status"] .sr-only').textContent, 'Loading');
    await view.scroll(100); await tick(); assert.equal(view.host.querySelector('.v-spinner'), null);
  } finally { await view.close(); }
});

test('failed batch retries silently after one second and never overlaps on scroll', async () => {
  let calls = 0; const pending = deferred(); const view = await mount({ scrollTop: 2000, load: () => { calls++; return calls === 1 ? Promise.reject(new Error('offline')) : pending.promise; } });
  try { await tick(); assert.equal(calls, 1); assert.equal(view.state.loading, false); await view.scroll(1800); await tick(); assert.equal(calls, 1);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 1050))); await tick(); assert.equal(calls, 2); assert.equal(view.host.textContent.includes('offline'), false);
  } finally { await view.close(); }
});

test('backoff is 1s, 3s, 8s, then waits for a new intersection or scroll', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let calls = 0;
  const view = await mount({ scrollTop: 100, load: async () => { calls++; throw new Error('offline'); } });
  try {
    await tick(); assert.equal(calls, 1);
    for (const delay of [1000, 3000, 8000]) {
      await act(async () => t.mock.timers.tick(delay - 1)); await tick(); const before = calls;
      await act(async () => t.mock.timers.tick(1)); await tick(); assert.equal(calls, before + 1);
    }
    assert.equal(calls, 4);
    await act(async () => t.mock.timers.tick(60_000)); await tick(); assert.equal(calls, 4);
    await act(async () => observers.at(-1).callback([])); await tick(); assert.equal(calls, 5);
  } finally { await view.close(); t.mock.timers.reset(); }
});

test('disabling then re-enabling while a batch is pending never overlaps requests', async () => {
  let calls = 0; const pending = deferred();
  const view = await mount({ load: () => { calls++; return pending.promise; } });
  try { await tick(); await view.patch({ disabled: true }); await view.patch({ disabled: false }); await tick(); assert.equal(calls, 1);
    await view.scroll(0); await tick(); assert.ok(view.host.querySelector(".v-spinner"), "resumed pending request still shows spinner at top"); }
  finally { await view.close(); await act(async () => pending.resolve()); }
});

test('a newly opened history prefetches even if the previous conversation request is still pending', async () => {
  let calls = 0; const first = deferred(); const second = deferred();
  const view = await mount({ load: () => { calls++; return calls === 1 ? first.promise : second.promise; } });
  try {
    await tick(); assert.equal(calls, 1);
    await view.patch({ hasMore: false });
    await view.patch({ hasMore: true, ids: [20, 21, 22, 23] });
    await tick(); assert.equal(calls, 2, 'old conversation does not block opening prefetch');
    await act(async () => first.resolve()); await view.scroll(100); await tick();
    assert.equal(calls, 2, 'completion from old conversation never releases new request guard');
  } finally { await view.close(); await act(async () => second.resolve()); }
});
