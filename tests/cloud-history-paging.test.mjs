import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import React, { act, useRef } from 'react';
import { compileModule } from './helpers/module-bench.mjs';
const require = createRequire(import.meta.url);
const fabric = createRequire(require.resolve('fabric/node'));
const canvas = fabric.resolve('canvas'), previous = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabric.resolve('jsdom')).href);
if (previous) require.cache[canvas] = previous; else delete require.cache[canvas];
const dom = new JSDOM('<html><body></body></html>', { pretendToBeVisual: true, url: 'https://dev.oceanleo.com/tasks/cloud' });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement })) Object.defineProperty(globalThis, key, { configurable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let frames = new Map(), frameId = 0;
globalThis.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
const { createRoot } = await import('react-dom/client');
const { useCloudHistory } = await import(await compileModule('src/shell/transcript/useCloudHistory.ts'));
const { useOlderHistory, OlderHistoryTop } = await import(await compileModule('src/shell/history/older-history.tsx'));
const tick = async () => act(async () => { const next = [...frames.values()]; frames.clear(); next.forEach((callback) => callback()); await Promise.resolve(); });

test('cloud paging paints the pending top spinner before adding 60 already-fetched rows and holds the original row', async () => {
  const messages = Array.from({ length: 190 }, (_, i) => ({ id: i + 1, role: 'user', kind: 'text', content: String(i) }));
  const host = document.createElement('div'); document.body.append(host);
  let cloud, history, scroller;
  function Harness() {
    const ref = useRef(null);
    cloud = useCloudHistory('task:cloud-spinner', messages);
    history = useOlderHistory({ scopeKey: 'task:cloud-spinner', scrollRef: ref, firstKey: cloud.visible[0].id, hasMore: cloud.hasMore, loadOlder: cloud.loadEarlier });
    return React.createElement('div', { ref: (node) => {
      ref.current = node; if (!node || node === scroller) return; scroller = node;
      Object.defineProperty(node, 'clientHeight', { value: 400 });
      node.getBoundingClientRect = () => ({ top: 0, bottom: 400 });
    } }, React.createElement(OlderHistoryTop, { ...history, hasMore: cloud.hasMore }), ...cloud.visible.map((message, index) => React.createElement('div', { key: message.id, 'data-history-item': '', 'data-history-key': String(message.id), ref: (node) => {
      if (node) node.getBoundingClientRect = () => ({ top: index * 200 + 32 - scroller.scrollTop, bottom: (index + 1) * 200 + 32 - scroller.scrollTop });
    } }, message.content)));
  }
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(Harness)));
    host.querySelector('[data-older-history-sentinel]').getBoundingClientRect = () => ({ top: -scroller.scrollTop });
    assert.equal(cloud.visible.length, 60);
    const oldFirst = host.querySelector('[data-history-key="131"]'), offset = oldFirst.getBoundingClientRect().top;
    await tick();
    assert.equal(cloud.visible.length, 60, 'pending state must render before the larger window');
    assert.ok(host.querySelector('[data-older-history-top] .v-spinner'), 'real shared loader has a visible pending state');
    await tick(); await tick();
    assert.equal(cloud.visible.length, 120);
    assert.equal(oldFirst.getBoundingClientRect().top, offset);
    assert.equal(history.loading, false);
  } finally { await act(async () => root.unmount()); host.remove(); frames.clear(); }
});
